import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { createInitialAdmin } from "@/lib/adminSetup";
import { verifyPassword } from "@/lib/passwordHash";
import { isPostgresTestDbConfigured, setupIsolatedTestDatabase } from "./helpers/postgresTestDb";

// createInitialAdmin은 count→create를 Serializable 트랜잭션으로 묶으므로, 실제
// PostgreSQL 트랜잭션 동작이 필요해 격리된 Neon test schema에서만 의미 있게
// 검증할 수 있다. TEST_DATABASE_URL이 없으면 이 파일 전체를 스킵한다.
const dbConfigured = isPostgresTestDbConfigured();

let prisma: PrismaClient;
let teardown: () => Promise<void>;

beforeAll(async () => {
  if (!dbConfigured) return;
  const db = await setupIsolatedTestDatabase();
  prisma = db.prisma;
  teardown = db.teardown;
});

afterAll(async () => {
  await teardown?.();
});

afterEach(async () => {
  if (!dbConfigured) return;
  await prisma.appUser.deleteMany();
});

describe.skipIf(!dbConfigured)("createInitialAdmin", () => {
  it("아이디가 너무 짧으면 계정을 만들지 않는다", async () => {
    const result = await createInitialAdmin(prisma, "ab", "password123");
    expect(result).toEqual({ ok: false, errorCode: "usernameTooShort" });
    expect(await prisma.appUser.count()).toBe(0);
  });

  it("비밀번호가 너무 짧으면 계정을 만들지 않는다", async () => {
    const result = await createInitialAdmin(prisma, "owner", "short1");
    expect(result).toEqual({ ok: false, errorCode: "passwordTooShort" });
    expect(await prisma.appUser.count()).toBe(0);
  });

  it("계정이 없으면 생성하고, 생성된 비밀번호로 로그인 검증이 통과한다", async () => {
    const result = await createInitialAdmin(prisma, "owner", "password123");
    expect(result.ok).toBe(true);
    expect(await prisma.appUser.count()).toBe(1);

    const user = await prisma.appUser.findUnique({ where: { username: "owner" } });
    expect(user).not.toBeNull();
    expect(await verifyPassword("password123", user!.passwordHash)).toBe(true);
    expect(await verifyPassword("wrong-password", user!.passwordHash)).toBe(false);
  });

  it("계정이 이미 있으면 거절하고 두 번째 계정을 만들지 않는다", async () => {
    const first = await createInitialAdmin(prisma, "owner", "password123");
    expect(first.ok).toBe(true);

    const second = await createInitialAdmin(prisma, "another-owner", "password456");
    expect(second).toEqual({ ok: false, errorCode: "accountExists" });

    expect(await prisma.appUser.count()).toBe(1);
    const remaining = await prisma.appUser.findMany();
    expect(remaining.map((u) => u.username)).toEqual(["owner"]);
  });
});
