import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/app/generated/prisma/client";

// app/setup/page.tsx도 app/api/setup/route.ts와 동일한 production 차단 규칙을 따른다.
const dbState = vi.hoisted(() => ({ prisma: undefined as unknown as PrismaClient }));

vi.mock("@/lib/db", () => ({
  get prisma() {
    return dbState.prisma;
  },
}));

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SetupPage", () => {
  it("NODE_ENV=production이면 DB를 조회하지 않고 notFound()로 404 처리한다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const countSpy = vi.fn().mockRejectedValue(new Error("DB에 접근하면 안 됩니다"));
    dbState.prisma = { appUser: { count: countSpy } } as unknown as PrismaClient;

    const { default: SetupPage } = await import("@/app/setup/page");

    // Next.js 16의 notFound()는 NEXT_HTTP_ERROR_FALLBACK;404 digest로 던진다
    // (실제 실행 결과로 확인 - 이전 버전의 NEXT_NOT_FOUND와 다르다).
    await expect(SetupPage()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(countSpy).not.toHaveBeenCalled();
  });
});
