import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { PrismaClient } from "@/app/generated/prisma/client";
import {
  assertNotPublicSchema,
  assertSafeTestDatabaseUrl,
  generateTestSchemaName,
} from "./testDbSafety";

// 통합 테스트가 실제 Postgres(Neon test 브랜치)에 연결할 때 항상 거쳐야 하는 유일한
// 통로입니다. 매 호출마다 assertSafeTestDatabaseUrl로 안전 검사를 통과한 뒤에만
// 연결하고, 실행마다 새로 만든 임시 schema 안에서만 테이블을 만들고 지웁니다 -
// public schema는 CREATE SCHEMA 한 번(이미 있으면 no-op) 외에는 전혀 건드리지 않으며,
// 실행 전후 public schema 스냅샷을 비교해 이를 자동으로 검증합니다.
//
// 중요: 설치된 @prisma/adapter-neon(dist/index.d.ts)의 `PrismaNeonOptions.schema`는
// getConnectionInfo()를 통해 Prisma의 ORM 쿼리 빌더(prisma.model.xxx(...))에만
// 전달되는 메타데이터입니다 - $executeRawUnsafe/$queryRawUnsafe로 실행하는 raw SQL
// 문자열에는 이 옵션이 자동으로 적용되지 않습니다. 그래서 마이그레이션 SQL이나
// 추가 raw DDL(트리거/함수 등)은 반드시 하나의 실제 트랜잭션 안에서 먼저
// `SET LOCAL search_path`를 설정한 뒤 실행합니다 - PrismaNeon은 @neondatabase/serverless의
// WebSocket 기반 Pool을 사용하므로(HTTP 무상태 드라이버가 아님) 인터랙티브
// $transaction이 하나의 실제 커넥션에 고정되어 SET LOCAL이 트랜잭션 내내 유지됩니다.

/**
 * true를 반환하면 TEST_DATABASE_URL이 설정되어 있어 이 통합 테스트 스위트를 실행해야
 * 한다는 뜻입니다(=스킵하지 않음). 실제로 연결해도 안전한지는 별도로
 * assertSafeTestDatabaseUrl이 검사합니다: ALLOW_DESTRUCTIVE_DB_TESTS가 없거나
 * "true"가 아니면 setupIsolatedTestDatabase() 호출 시 연결 시도 전에 즉시 throw하여
 * 스위트 전체가 "스킵"이 아니라 "실패"로 처리됩니다. TEST_DATABASE_URL 자체가 없을
 * 때만 스위트를 조용히 스킵하도록 허용합니다 - URL은 있는데 안전 설정만 빠진
 * 상태를 스킵으로 조용히 넘기지 않기 위함입니다.
 */
export function isPostgresTestDbConfigured(): boolean {
  return Boolean(process.env.TEST_DATABASE_URL);
}

/**
 * prisma/migrations/ 아래 모든 마이그레이션 폴더의 SQL을 시간순(디렉터리명 정렬)으로
 * 이어붙입니다. tests/backup.integration.test.ts가 기존 SQLite 시절부터 쓰던 것과
 * 동일한 "디렉터리를 직접 읽어 적용" 방식이고, PostgreSQL로 전환된 지금은 파일이
 * PostgreSQL 방언이라 그대로 실행할 수 있습니다.
 */
function readAllMigrationSql(): string {
  const migrationsDir = join(process.cwd(), "prisma", "migrations");
  const migrationDirs = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  return migrationDirs
    .map((dir) => readFileSync(join(migrationsDir, dir, "migration.sql"), "utf8"))
    .join("\n");
}

/**
 * 이 마이그레이션 SQL에는 함수/트리거/달러-인용 블록이 없고 CREATE TABLE/INDEX,
 * ALTER TABLE(외래키)만 있다는 걸 확인했으므로, 주석 줄을 제거한 뒤 세미콜론 기준으로
 * 나누는 것으로 충분합니다(일반적인 SQL 스크립트에는 안전하지 않은 방법이지만, 이
 * 특정 마이그레이션 내용에 한해서는 안전합니다).
 */
function splitSqlStatements(sql: string): string[] {
  const withoutComments = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  return withoutComments
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

/**
 * 주어진 schema로 스코프된 하나의 실제 트랜잭션 안에서 `SET LOCAL search_path`를
 * 먼저 설정한 뒤 statements를 순서대로 실행합니다. raw SQL은 adapter의 schema
 * 옵션만으로 대상 schema가 보장되지 않으므로(위 설명 참고), 모든 raw DDL/DML은
 * 이 헬퍼를 거쳐야 합니다. public schema에 대해서는 절대 호출하지 않도록
 * assertNotPublicSchema로 방어합니다.
 */
export async function runScopedRawStatements(
  prisma: PrismaClient,
  schemaName: string,
  statements: string[]
): Promise<void> {
  assertNotPublicSchema(schemaName);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schemaName}"`);
    for (const statement of statements) {
      await tx.$executeRawUnsafe(statement);
    }
  });
}

interface SchemaObjectRow {
  kind: string;
  name: string;
}

/**
 * public schema에 존재하는 테이블/함수/트리거 이름 목록을 정렬된 문자열 배열로
 * 스냅샷합니다. schema 옵션 없는(=스코프되지 않은) 별도 연결로 조회해야 실제
 * public을 봅니다. setupIsolatedTestDatabase()가 임시 schema를 만들기 직전과
 * teardown()이 그것을 지운 직후 각각 호출해 두 스냅샷이 완전히 동일한지 비교합니다.
 */
async function snapshotPublicSchema(testDatabaseUrl: string): Promise<string[]> {
  const { PrismaClient } = await import("@/app/generated/prisma/client");
  const { PrismaNeon } = await import("@prisma/adapter-neon");
  const adapter = new PrismaNeon({ connectionString: testDatabaseUrl });
  const client = new PrismaClient({ adapter });
  try {
    const rows = await client.$queryRawUnsafe<SchemaObjectRow[]>(`
      SELECT 'table' AS kind, tablename AS name FROM pg_tables WHERE schemaname = 'public'
      UNION ALL
      SELECT 'function' AS kind, p.proname AS name FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public'
      UNION ALL
      SELECT 'trigger' AS kind, t.tgname AS name FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE n.nspname = 'public' AND NOT t.tgisinternal
      ORDER BY kind, name
    `);
    return rows.map((r) => `${r.kind}:${r.name}`);
  } finally {
    await client.$disconnect();
  }
}

function assertPublicSchemaUnchanged(before: string[], after: string[]): void {
  if (before.join("\n") !== after.join("\n")) {
    throw new Error(
      "안전 검증 실패: 테스트 실행 전후 public schema의 테이블/함수/트리거 목록이 달라졌습니다 " +
        "(격리된 임시 schema 밖에서 무언가가 생성·삭제되었을 수 있습니다)."
    );
  }
}

export interface IsolatedTestDatabase {
  prisma: PrismaClient;
  /** 이 실행에서 만든 임시 schema 이름 - raw SQL을 추가로 실행할 때 runScopedRawStatements에 전달합니다. */
  schemaName: string;
  /** 생성한 임시 schema만 정리하고 public schema 스냅샷이 그대로인지 검증합니다. 여러 번 호출해도 안전합니다(멱등). */
  teardown: () => Promise<void>;
}

/**
 * 안전 검사 → public schema 사전 스냅샷 → 임시 schema 생성 → 그 schema로 스코프된
 * PrismaClient 생성(공식 schema 옵션 사용, 연결 문자열 조작 아님) → 그 안에 마이그레이션을
 * 트랜잭션 + SET LOCAL search_path로 적용까지 한 번에 처리합니다. 실패 시(스키마 생성
 * 이후 어느 단계에서든) 만들어진 임시 schema를 정리한 뒤 원래 오류를 그대로 다시
 * 던집니다 - 정리 실패가 원래 오류를 가리지 않도록, 정리 자체는 별도 catch로 감싸고
 * 자격증명이 섞일 수 있는 오류 객체 전체가 아니라 고정된 안전 메시지만 로그로 남깁니다.
 */
export async function setupIsolatedTestDatabase(): Promise<IsolatedTestDatabase> {
  const { PrismaClient } = await import("@/app/generated/prisma/client");
  const { PrismaNeon } = await import("@prisma/adapter-neon");

  const testDatabaseUrl = assertSafeTestDatabaseUrl({
    testDatabaseUrl: process.env.TEST_DATABASE_URL,
    productionDatabaseUrl: process.env.DATABASE_URL,
    allowDestructiveDbTests: process.env.ALLOW_DESTRUCTIVE_DB_TESTS,
  });

  const schemaName = generateTestSchemaName();
  assertNotPublicSchema(schemaName);

  const beforeSnapshot = await snapshotPublicSchema(testDatabaseUrl);

  async function dropSchema() {
    assertNotPublicSchema(schemaName); // 방어적 재확인 - public을 실수로 지우는 경로를 원천 차단
    const cleanupAdapter = new PrismaNeon({ connectionString: testDatabaseUrl });
    const cleanupClient = new PrismaClient({ adapter: cleanupAdapter });
    try {
      await cleanupClient.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    } finally {
      await cleanupClient.$disconnect();
    }
  }

  let prisma: PrismaClient;
  try {
    // 1) 임시 schema 생성 - public에는 영향 없음 (public을 지우거나 비우는 작업이 아님)
    const setupAdapter = new PrismaNeon({ connectionString: testDatabaseUrl });
    const setupClient = new PrismaClient({ adapter: setupAdapter });
    try {
      await setupClient.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
    } finally {
      await setupClient.$disconnect();
    }

    // 2) ORM 쿼리(prisma.model.xxx)용 스코프 클라이언트 - 공식 PrismaNeonOptions.schema 사용
    const adapter = new PrismaNeon({ connectionString: testDatabaseUrl }, { schema: schemaName });
    prisma = new PrismaClient({ adapter });

    // 3) raw 마이그레이션 SQL은 schema 옵션에 의존하지 않고, 하나의 실제 트랜잭션 안에서
    //    SET LOCAL search_path를 먼저 설정한 뒤 모든 statement를 실행합니다.
    const statements = splitSqlStatements(readAllMigrationSql());
    await runScopedRawStatements(prisma, schemaName, statements);
  } catch (err) {
    try {
      await dropSchema();
    } catch {
      // 정리 실패를 원래 오류 대신 던지지 않는다 - 원래 초기화 실패 원인을 가리지 않기 위함.
      // cleanupErr 객체를 그대로 로그로 남기지 않는다 - DB 드라이버 오류 객체에는 호스트/포트/
      // 사용자명 등 연결 정보가 포함될 수 있으므로, 자격증명이 섞이지 않는 고정 메시지만 남긴다.
      console.error("임시 schema 정리 실패 (초기화 오류를 우선 보고합니다).");
    }
    throw err;
  }

  let torndown = false;
  async function teardown() {
    if (torndown) return;
    torndown = true;
    try {
      await prisma.$disconnect();
    } finally {
      await dropSchema();
      const afterSnapshot = await snapshotPublicSchema(testDatabaseUrl);
      assertPublicSchemaUnchanged(beforeSnapshot, afterSnapshot);
    }
  }

  return { prisma, schemaName, teardown };
}
