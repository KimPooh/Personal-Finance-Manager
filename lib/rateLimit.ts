import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@/app/generated/prisma/client";
import { hmacFingerprint } from "@/lib/crypto";

// DB(PostgreSQL) 기반 로그인 rate limiting. Vercel 서버리스는 인스턴스 간 메모리를
// 공유하지 않으므로 기존의 프로세스 메모리 Map으로는 rate limit이 무력화된다.
//
// 아이디 버킷과 IP 버킷을 독립적으로 추적한다(dual bucket) - 어느 한쪽이라도 한도를
// 넘으면 차단한다. 로그인 성공 시에는 아이디 버킷만 초기화하고 IP 버킷은 그대로
// 둔다: 같은 IP에서 여러 아이디로 시도하는 credential-stuffing을 아이디 하나의
// 성공으로 우회하지 못하게 하기 위함이다. IP 버킷은 15분 윈도우 만료 또는 24시간
// 초과 정리로만 사라진다.
//
// 원문 아이디/IP는 절대 저장하지 않고 hmacFingerprint로 도메인 분리된 입력을 해시한
// keyHash만 저장한다. 실패 횟수 증가는 read→compute→write 왕복 대신 단일 원자적
// UPSERT(하나의 SQL 문)로 처리해, 동시 요청 사이의 증가분 유실이나 윈도우 리셋
// 경쟁 상태를 PostgreSQL 자체의 행 잠금에 맡긴다.
//
// DB 오류(확인/기록 어느 단계든)는 fail-closed로 처리한다: 이 앱은 어차피 같은 DB로
// 사용자 조회도 하므로 DB 장애 시 fail-open으로 얻을 가용성 이득이 없고, 오히려
// rate limit을 우회할 수 있는 보안 허점만 생긴다. 호출자(로그인 라우트)는
// { outcome: "dbError" }를 받으면 원본 오류·아이디·IP·해시를 응답이나 로그에 남기지
// 않고 고정된 503 응답을 반환해야 한다.
//
// 24시간 초과 정리는 별도 정책이다: best-effort이며 실패해도 로그인 흐름을 막지
// 않는다(정리 실패가 로그인 기능 자체를 깨뜨리면 안 됨) - 확인/기록 실패의
// fail-closed 정책과는 명확히 분리되어 있다.
//
// 중요: @prisma/adapter-neon의 schema 옵션(PrismaNeonOptions.schema)은 ORM 쿼리
// 빌더(prisma.loginRateLimitBucket.xxx)에만 적용되고 $queryRaw/$executeRaw로 실행하는
// raw SQL에는 자동 적용되지 않는다(tests/helpers/postgresTestDb.ts에서 마이그레이션에
// 대해 확인한 것과 동일한 제약, 라이브 Neon 검증 중 재현됨). 그래서 raw SQL을 쓰는
// readBucket/upsertFailure만 schemaName을 받아 Prisma.raw()로 스키마 한정 테이블명을
// 만든다. 운영에서는 항상 기본값 "public"을 쓰고(별도 schema 개념이 필요 없음),
// 테스트에서만 격리된 임시 schema 이름을 명시적으로 전달한다. schemaName은 raw SQL에
// 그대로 splice되므로(파라미터 바인딩 불가 - 식별자이기 때문) 호출자 입력을 그대로
// 신뢰하지 않고 이 파일 안에서도 방어적으로 형식을 검증한다.

const USERNAME_WINDOW_MS = 15 * 60 * 1000;
const USERNAME_MAX_ATTEMPTS = 5;
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX_ATTEMPTS = 20;
const CLEANUP_AGE_MS = 24 * 60 * 60 * 1000;

const SCHEMA_NAME_RE = /^[a-z_][a-z0-9_]*$/;

function assertValidSchemaName(schemaName: string): void {
  if (!SCHEMA_NAME_RE.test(schemaName)) {
    throw new Error(`유효하지 않은 schema 이름입니다: "${schemaName}"`);
  }
}

/** INSERT/SELECT의 FROM/INTO 대상으로 쓸 schema 한정 테이블 참조. */
function bucketTableRef(schemaName: string): Prisma.Sql {
  assertValidSchemaName(schemaName);
  return Prisma.raw(`"${schemaName}"."LoginRateLimitBucket"`);
}

/**
 * text 파라미터를 enum으로 캐스팅할 때 붙일 조각. enum 타입 자체도 마이그레이션이
 * 적용된 schema 안에 만들어지므로("public"이 아닐 수 있음), 테이블과 동일하게
 * schema로 한정해야 한다.
 */
function bucketTypeCast(schemaName: string): Prisma.Sql {
  assertValidSchemaName(schemaName);
  return Prisma.raw(`::"${schemaName}"."LoginRateLimitBucketType"`);
}

type BucketType = "USERNAME" | "IP";

function usernameKeyHash(username: string): string {
  // 대소문자만 다른 아이디로 rate limit을 우회하지 못하도록 정규화 후 해시한다.
  // 실제 로그인 조회(prisma.appUser.findUnique)는 이 정규화와 무관하게 그대로 동작한다.
  return hmacFingerprint(`login:username:${username.trim().toLowerCase()}`);
}

function ipKeyHash(ip: string): string {
  return hmacFingerprint(`login:ip:${ip}`);
}

interface BucketRow {
  failCount: number;
  windowStart: Date;
}

async function readBucket(
  prisma: PrismaClient,
  bucketType: BucketType,
  keyHash: string,
  schemaName: string
): Promise<BucketRow | null> {
  const table = bucketTableRef(schemaName);
  const typeCast = bucketTypeCast(schemaName);
  const rows = await prisma.$queryRaw<BucketRow[]>`
    SELECT "failCount", "windowStart" FROM ${table}
    WHERE "bucketType" = ${bucketType}${typeCast} AND "keyHash" = ${keyHash}
  `;
  return rows[0] ?? null;
}

function evaluateBucket(
  bucket: BucketRow | null,
  windowMs: number,
  maxAttempts: number,
  nowMs: number
): { blocked: boolean; remainingMs: number } {
  if (!bucket) return { blocked: false, remainingMs: 0 };
  const windowAgeMs = nowMs - bucket.windowStart.getTime();
  if (windowAgeMs >= windowMs) return { blocked: false, remainingMs: 0 };
  if (bucket.failCount < maxAttempts) return { blocked: false, remainingMs: 0 };
  return { blocked: true, remainingMs: windowMs - windowAgeMs };
}

async function upsertFailure(
  prisma: PrismaClient,
  bucketType: BucketType,
  keyHash: string,
  windowMs: number,
  schemaName: string
): Promise<void> {
  const table = bucketTableRef(schemaName);
  const typeCast = bucketTypeCast(schemaName);
  const windowCutoff = new Date(Date.now() - windowMs);
  // ON CONFLICT DO UPDATE 안에서 기존 행 값을 참조할 때 스키마 한정 이름 대신
  // 별칭(b)을 쓴다 - INSERT INTO 대상이 schema-qualified 식별자일 때도 명확하게 동작한다.
  await prisma.$executeRaw`
    INSERT INTO ${table} AS b ("id", "bucketType", "keyHash", "failCount", "windowStart", "updatedAt")
    VALUES (${randomUUID()}, ${bucketType}${typeCast}, ${keyHash}, 1, now(), now())
    ON CONFLICT ("bucketType", "keyHash") DO UPDATE SET
      "failCount" = CASE WHEN b."windowStart" < ${windowCutoff}
                          THEN 1 ELSE b."failCount" + 1 END,
      "windowStart" = CASE WHEN b."windowStart" < ${windowCutoff}
                            THEN now() ELSE b."windowStart" END,
      "updatedAt" = now()
  `;
}

export type LoginRateLimitCheck =
  | { outcome: "allowed" }
  | { outcome: "blocked"; remainingMs: number }
  | { outcome: "dbError" };

/**
 * 아이디/IP 버킷을 모두 읽어 어느 한쪽이라도 한도를 넘었으면 차단한다.
 * schemaName은 운영에서는 생략(기본값 "public")하고, 격리된 스키마를 쓰는 테스트에서만
 * 명시적으로 넘긴다.
 */
export async function checkLoginRateLimit(
  prisma: PrismaClient,
  username: string,
  ip: string,
  schemaName: string = "public"
): Promise<LoginRateLimitCheck> {
  try {
    const [usernameBucket, ipBucket] = await Promise.all([
      readBucket(prisma, "USERNAME", usernameKeyHash(username), schemaName),
      readBucket(prisma, "IP", ipKeyHash(ip), schemaName),
    ]);
    const now = Date.now();

    const usernameResult = evaluateBucket(usernameBucket, USERNAME_WINDOW_MS, USERNAME_MAX_ATTEMPTS, now);
    if (usernameResult.blocked) return { outcome: "blocked", remainingMs: usernameResult.remainingMs };

    const ipResult = evaluateBucket(ipBucket, IP_WINDOW_MS, IP_MAX_ATTEMPTS, now);
    if (ipResult.blocked) return { outcome: "blocked", remainingMs: ipResult.remainingMs };

    return { outcome: "allowed" };
  } catch {
    return { outcome: "dbError" };
  }
}

/** 아이디 버킷과 IP 버킷 실패 횟수를 각각 원자적으로 증가시킨다 (또는 윈도우 리셋). */
export async function recordLoginFailure(
  prisma: PrismaClient,
  username: string,
  ip: string,
  schemaName: string = "public"
): Promise<{ dbError: boolean }> {
  try {
    await Promise.all([
      upsertFailure(prisma, "USERNAME", usernameKeyHash(username), USERNAME_WINDOW_MS, schemaName),
      upsertFailure(prisma, "IP", ipKeyHash(ip), IP_WINDOW_MS, schemaName),
    ]);
    return { dbError: false };
  } catch {
    return { dbError: true };
  }
}

/** 로그인 성공 시 아이디 버킷만 초기화한다. IP 버킷은 절대 건드리지 않는다. */
export async function clearUsernameRateLimit(prisma: PrismaClient, username: string): Promise<void> {
  try {
    await prisma.loginRateLimitBucket.deleteMany({
      where: { bucketType: "USERNAME", keyHash: usernameKeyHash(username) },
    });
  } catch {
    // 이미 성공한 로그인 자체를 막지 않는다 - 정리에 실패해도 15분 뒤 윈도우 만료로
    // 저절로 해소된다.
  }
}

/** 24시간 넘게 갱신되지 않은 버킷 행을 best-effort로 정리한다. 실패해도 로그인 흐름을 막지 않는다. */
export async function cleanupExpiredRateLimitBuckets(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.loginRateLimitBucket.deleteMany({
      where: { updatedAt: { lt: new Date(Date.now() - CLEANUP_AGE_MS) } },
    });
  } catch {
    // best-effort 정리 - 실패는 무시한다.
  }
}
