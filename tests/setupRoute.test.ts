import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/app/generated/prisma/client";

// production(NODE_ENV=production - Vercel Production/Preview와 로컬 next start 전부
// 포함)에서는 /api/setup, /setup 페이지가 DB 조회 전에 고정 404를 반환해야 한다.
// 이 파일은 그 차단 동작만 검증한다 - 기존 셋업 성공 흐름(계정 생성/세션 발급) 자체는
// 이번 변경 대상이 아니므로 별도로 재검증하지 않는다.

const dbState = vi.hoisted(() => ({ prisma: undefined as unknown as PrismaClient }));

vi.mock("@/lib/db", () => ({
  get prisma() {
    return dbState.prisma;
  },
}));

// app/api/setup/route.ts는 @/lib/auth(hashPassword)와 @/lib/session(getSession)을
// 임포트한다 - 둘 다 모킹하지 않으면 실제 lib/session.ts가 모듈 로드 시점에
// SESSION_SECRET을 요구해 이 테스트와 무관한 이유로 실패한다. 이 파일이 검증하는
// 대상은 production 차단 분기이지 세션 발급 자체가 아니므로 모킹으로 대체한다.
vi.mock("@/lib/auth", () => ({
  hashPassword: vi.fn().mockResolvedValue("mock-hash"),
}));

vi.mock("@/lib/session", () => ({
  getSession: vi.fn().mockResolvedValue({ save: vi.fn() }),
}));

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function callSetup(body: unknown) {
  const { POST } = await import("@/app/api/setup/route");
  const { NextRequest } = await import("next/server");
  const req = new NextRequest("http://localhost/api/setup", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return POST(req);
}

describe("POST /api/setup", () => {
  it("NODE_ENV=production이면 DB를 조회하지 않고 고정 404를 반환한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const countSpy = vi.fn().mockRejectedValue(new Error("DB에 접근하면 안 됩니다"));
    dbState.prisma = { appUser: { count: countSpy } } as unknown as PrismaClient;

    const res = await callSetup({ username: "owner", password: "password123" });

    expect(res.status).toBe(404);
    expect(countSpy).not.toHaveBeenCalled();
  });

  it("development에서는 production 차단이 걸리지 않고 기존 동작(계정 존재 시 409)이 유지된다", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const countSpy = vi.fn().mockResolvedValue(1);
    dbState.prisma = { appUser: { count: countSpy } } as unknown as PrismaClient;

    const res = await callSetup({ username: "owner", password: "password123" });

    expect(countSpy).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(409);
    expect((await res.json()).errorCode).toBe("accountExists");
  });
});
