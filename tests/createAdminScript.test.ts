import { describe, expect, it } from "vitest";
import { checkPreflight } from "../scripts/createAdmin";

// scripts/createAdmin.ts를 import해도 main()이 실행되지 않는지(부수효과 없음)는
// 이 파일이 정상적으로 로드되고 아래 단언들이 통과한다는 사실 자체로 증명된다 -
// main()이 돌았다면 대화형 프롬프트가 시작되어 이 테스트가 멈춰버렸을 것이다.
describe("checkPreflight", () => {
  it("TTY가 아니면 DATABASE_URL 유무와 무관하게 차단한다", () => {
    const result = checkPreflight(false, "postgresql://example/db");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("터미널");
    }
  });

  it("TTY이지만 DATABASE_URL이 없으면 차단한다", () => {
    const result = checkPreflight(true, undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("DATABASE_URL");
    }
  });

  it("TTY이고 DATABASE_URL이 있으면 통과한다", () => {
    const result = checkPreflight(true, "postgresql://example/db");
    expect(result).toEqual({ ok: true, databaseUrl: "postgresql://example/db" });
  });
});
