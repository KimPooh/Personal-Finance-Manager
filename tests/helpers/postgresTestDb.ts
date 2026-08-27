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
// public schema는 CREATE SCHEMA 한 번(이미 있으면 no-op) 외에는 전혀 건드리지 않습니다.

/** true를 반환하면 실제 DB 연결을 시도해도 안전하다는 뜻입니다 (환경변수만 확인, 연결하지 않음). */
export function isPostgresTestDbConfigured(): boolean {
  return Boolean(process.env.TEST_DATABASE_URL) && process.env.ALLOW_DESTRUCTIVE_DB_TESTS === "true";
}

function withSchemaParam(rawUrl: string, schemaName: string): string {
  const url = new URL(rawUrl);
  url.searchParams.set("schema", schemaName);
  return url.toString();
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

export interface IsolatedTestDatabase {
  prisma: PrismaClient;
  /** 생성한 임시 schema만 정리합니다. 여러 번 호출해도 안전합니다(멱등). */
  teardown: () => Promise<void>;
}

/**
 * 안전 검사 → 임시 schema 생성 → 그 schema로 스코프된 PrismaClient 생성 → 그 안에
 * 마이그레이션 적용까지 한 번에 처리합니다. 실패 시(스키마 생성 이후 어느 단계에서든)
 * 만들어진 임시 schema를 정리한 뒤 원래 오류를 그대로 다시 던집니다 - 정리 실패가
 * 원래 오류를 가리지 않도록, 정리 자체는 별도 catch로 감싸 로그만 남기고 원래 오류를
 * 우선합니다.
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

    // 2) 이 schema로 스코프된 연결 - 이후 모든 쿼리(마이그레이션 포함)가 이 schema 안에서만 실행됨
    const scopedUrl = withSchemaParam(testDatabaseUrl, schemaName);
    const adapter = new PrismaNeon({ connectionString: scopedUrl });
    prisma = new PrismaClient({ adapter });

    // 3) 이 schema 안에 마이그레이션 적용
    const statements = splitSqlStatements(readAllMigrationSql());
    for (const statement of statements) {
      await prisma.$executeRawUnsafe(statement);
    }
  } catch (err) {
    try {
      await dropSchema();
    } catch (cleanupErr) {
      // 정리 실패를 원래 오류 대신 던지지 않는다 - 원래 초기화 실패 원인을 가리지 않기 위함.
      console.error("임시 schema 정리 실패 (초기화 오류를 우선 보고합니다):", cleanupErr);
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
    }
  }

  return { prisma, teardown };
}
