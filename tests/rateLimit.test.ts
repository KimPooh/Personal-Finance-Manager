import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/app/generated/prisma/client";
import {
  checkLoginRateLimit,
  clearUsernameRateLimit,
  cleanupExpiredRateLimitBuckets,
  recordLoginFailure,
} from "@/lib/rateLimit";
import { hmacFingerprint } from "@/lib/crypto";
import { isPostgresTestDbConfigured, setupIsolatedTestDatabase } from "./helpers/postgresTestDb";

// DB 기반 dual-bucket 로그인 rate limiting 테스트. 원자적 UPSERT의 동시성 동작은
// 실제 Neon PostgreSQL(TEST_DATABASE_URL)에 대해서만 의미 있게 검증할 수 있어
// TEST_DATABASE_URL이 없으면 이 파일 전체를 스킵한다.
//
// lib/rateLimit.ts의 raw SQL 함수들은 schemaName을 받는다(운영 기본값은 "public") -
// 격리된 임시 schema를 쓰는 이 테스트에서는 setupIsolatedTestDatabase()가 반환한
// schemaName을 모든 호출에 명시적으로 전달해야 한다.
const ENCRYPTION_KEY = "22".repeat(32);
const dbConfigured = isPostgresTestDbConfigured();

let prisma: PrismaClient;
let schemaName: string;
let teardown: () => Promise<void>;

beforeAll(async () => {
  if (!dbConfigured) return;
  process.env.ENCRYPTION_KEY = ENCRYPTION_KEY;
  const db = await setupIsolatedTestDatabase();
  prisma = db.prisma;
  schemaName = db.schemaName;
  teardown = db.teardown;
});

afterAll(async () => {
  await teardown?.();
});

async function clearAllBuckets() {
  await prisma.loginRateLimitBucket.deleteMany();
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describe.skipIf(!dbConfigured)("checkLoginRateLimit / recordLoginFailure (dual bucket)", () => {
  it("아이디 버킷이 5회를 넘으면 차단된다", async () => {
    await clearAllBuckets();
    const username = `user-${uniqueSuffix()}`;
    const ip = "203.0.113.10";

    for (let i = 0; i < 5; i++) {
      const before = await checkLoginRateLimit(prisma, username, ip, schemaName);
      expect(before.outcome).toBe("allowed");
      await recordLoginFailure(prisma, username, ip, schemaName);
    }

    const result = await checkLoginRateLimit(prisma, username, ip, schemaName);
    expect(result.outcome).toBe("blocked");
    if (result.outcome === "blocked") {
      expect(result.remainingMs).toBeGreaterThan(0);
    }
  });

  it("IP 버킷이 20회를 넘으면 차단된다 (서로 다른 아이디를 사용해도)", async () => {
    await clearAllBuckets();
    const ip = "203.0.113.20";

    for (let i = 0; i < 20; i++) {
      await recordLoginFailure(prisma, `user-${uniqueSuffix()}`, ip, schemaName);
    }

    const result = await checkLoginRateLimit(prisma, `user-${uniqueSuffix()}`, ip, schemaName);
    expect(result.outcome).toBe("blocked");
  });

  it("두 버킷은 독립적으로 트리거된다 - 아이디만 넘으면 그 아이디만, IP만 넘으면 그 IP 전체가 차단된다", async () => {
    await clearAllBuckets();
    const username = `user-${uniqueSuffix()}`;
    const ipA = "198.51.100.1";
    const ipB = "198.51.100.2";

    for (let i = 0; i < 5; i++) {
      await recordLoginFailure(prisma, username, ipA, schemaName);
    }
    // 같은 아이디, 다른 IP - 아이디 버킷 때문에 여전히 차단되어야 한다
    const blockedByUsername = await checkLoginRateLimit(prisma, username, ipB, schemaName);
    expect(blockedByUsername.outcome).toBe("blocked");

    // 다른 아이디, 원래 IP(ipA) - IP는 5회뿐이라 아직 허용되어야 한다 (IP 한도 20)
    const allowedOtherUser = await checkLoginRateLimit(prisma, `user-${uniqueSuffix()}`, ipA, schemaName);
    expect(allowedOtherUser.outcome).toBe("allowed");
  });

  it("로그인 성공 시 아이디 버킷만 초기화되고 IP 버킷은 유지된다", async () => {
    await clearAllBuckets();
    const username = `user-${uniqueSuffix()}`;
    const ip = "203.0.113.30";

    for (let i = 0; i < 5; i++) {
      await recordLoginFailure(prisma, username, ip, schemaName);
    }
    expect((await checkLoginRateLimit(prisma, username, ip, schemaName)).outcome).toBe("blocked");

    await clearUsernameRateLimit(prisma, username);

    // 아이디 버킷은 지워졌으니 같은 아이디+IP로도 다시 허용되어야 한다
    expect((await checkLoginRateLimit(prisma, username, ip, schemaName)).outcome).toBe("allowed");

    // 하지만 IP 버킷 자체는 그대로 남아있어야 한다 (failCount 유지 확인)
    const ipHash = hmacFingerprint(`login:ip:${ip}`);
    const ipRow = await prisma.loginRateLimitBucket.findUnique({
      where: { bucketType_keyHash: { bucketType: "IP", keyHash: ipHash } },
    });
    expect(ipRow?.failCount).toBe(5);
  });

  it("윈도우(15분)가 지나면 카운트가 리셋된다", async () => {
    await clearAllBuckets();
    const username = `user-${uniqueSuffix()}`;
    const ip = "203.0.113.40";

    for (let i = 0; i < 5; i++) {
      await recordLoginFailure(prisma, username, ip, schemaName);
    }
    expect((await checkLoginRateLimit(prisma, username, ip, schemaName)).outcome).toBe("blocked");

    // 실제로 15분을 기다리는 대신 windowStart를 과거로 직접 되돌려 만료를 시뮬레이션한다
    const usernameHash = hmacFingerprint(`login:username:${username.trim().toLowerCase()}`);
    await prisma.loginRateLimitBucket.update({
      where: { bucketType_keyHash: { bucketType: "USERNAME", keyHash: usernameHash } },
      data: { windowStart: new Date(Date.now() - 16 * 60 * 1000) },
    });

    expect((await checkLoginRateLimit(prisma, username, ip, schemaName)).outcome).toBe("allowed");

    // 윈도우 만료 후 실패를 다시 기록하면 1로 리셋되어야 한다 (누적되지 않음)
    await recordLoginFailure(prisma, username, ip, schemaName);
    const row = await prisma.loginRateLimitBucket.findUnique({
      where: { bucketType_keyHash: { bucketType: "USERNAME", keyHash: usernameHash } },
    });
    expect(row?.failCount).toBe(1);
  });

  it("24시간 초과 행은 cleanupExpiredRateLimitBuckets로 정리된다", async () => {
    await clearAllBuckets();
    const oldUsername = `old-user-${uniqueSuffix()}`;
    const freshUsername = `fresh-user-${uniqueSuffix()}`;
    const ip = "203.0.113.50";

    await recordLoginFailure(prisma, oldUsername, ip, schemaName);
    await recordLoginFailure(prisma, freshUsername, ip, schemaName);

    const oldHash = hmacFingerprint(`login:username:${oldUsername.trim().toLowerCase()}`);
    await prisma.loginRateLimitBucket.update({
      where: { bucketType_keyHash: { bucketType: "USERNAME", keyHash: oldHash } },
      data: { updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });

    await cleanupExpiredRateLimitBuckets(prisma);

    const remaining = await prisma.loginRateLimitBucket.findMany({
      where: { bucketType: "USERNAME" },
    });
    const remainingHashes = remaining.map((r) => r.keyHash);
    expect(remainingHashes).not.toContain(oldHash);
    expect(remainingHashes).toContain(
      hmacFingerprint(`login:username:${freshUsername.trim().toLowerCase()}`)
    );
  });

  it("동시 실패 기록이 유실되지 않고 정확한 횟수로 반영된다 (원자적 UPSERT 검증)", async () => {
    await clearAllBuckets();
    const username = `user-${uniqueSuffix()}`;
    const ip = "203.0.113.60";

    // 10개의 실패 기록을 동시에(Promise.all) 실행해 read-modify-write 경쟁으로 인한
    // 유실이 없는지 확인한다. 실제 Neon PostgreSQL에 대해 실행해야 의미가 있다.
    await Promise.all(
      Array.from({ length: 10 }, () => recordLoginFailure(prisma, username, ip, schemaName))
    );

    const usernameHash = hmacFingerprint(`login:username:${username.trim().toLowerCase()}`);
    const row = await prisma.loginRateLimitBucket.findUnique({
      where: { bucketType_keyHash: { bucketType: "USERNAME", keyHash: usernameHash } },
    });
    expect(row?.failCount).toBe(10);
  });
});
