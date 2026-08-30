import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkPreflight,
  resolveDatabaseUrlFromFileContent,
  type ReadEnvFileResult,
} from "../scripts/createAdmin";

// scripts/createAdmin.ts를 import해도 main()이 실행되지 않는지(부수효과 없음)는
// 이 파일이 정상적으로 로드되고 아래 단언들이 통과한다는 사실 자체로 증명된다 -
// main()이 돌았다면 대화형 프롬프트가 시작되어 이 테스트가 멈춰버렸을 것이다.

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveDatabaseUrlFromFileContent", () => {
  it("파일 내용에서 DATABASE_URL을 파싱해 반환한다", () => {
    const result = resolveDatabaseUrlFromFileContent("DATABASE_URL=postgresql://real-prod-file/proddb\n");
    expect(result).toEqual({ ok: true, databaseUrl: "postgresql://real-prod-file/proddb" });
  });

  it(
    "부모 셸에 이미 다른 DATABASE_URL이 설정되어 있어도(process.env) 파일에서 파싱한 값만 " +
      "선택된다 - node --env-file은 이미 존재하는 환경변수를 덮어쓰지 않으므로, 이 함수는 " +
      "애초에 process.env를 전혀 참조하지 않는다",
    () => {
      vi.stubEnv("DATABASE_URL", "postgresql://fake-dev-shell/devdb");
      const result = resolveDatabaseUrlFromFileContent(
        "DATABASE_URL=postgresql://real-prod-file/proddb\n"
      );
      expect(result).toEqual({ ok: true, databaseUrl: "postgresql://real-prod-file/proddb" });
    }
  );

  it("파일에 DATABASE_URL이 없으면 거절한다", () => {
    const result = resolveDatabaseUrlFromFileContent("OTHER_VAR=1\n");
    expect(result.ok).toBe(false);
  });

  it("postgresql/postgres가 아닌 프로토콜은 거절한다", () => {
    const result = resolveDatabaseUrlFromFileContent("DATABASE_URL=mysql://host/db\n");
    expect(result.ok).toBe(false);
  });

  it("URL 형식을 해석할 수 없으면 거절한다", () => {
    const result = resolveDatabaseUrlFromFileContent("DATABASE_URL=not-a-url\n");
    expect(result.ok).toBe(false);
  });
});

describe("checkPreflight", () => {
  const validFile: ReadEnvFileResult = {
    ok: true,
    content: "DATABASE_URL=postgresql://real-prod-file/proddb\n",
  };
  const missingFile: ReadEnvFileResult = {
    ok: false,
    message: ".env.production.local 파일을 찾을 수 없습니다.",
  };

  it("TTY가 아니면 파일 존재 여부와 무관하게 차단한다", () => {
    const result = checkPreflight(false, validFile);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("터미널");
  });

  it("TTY이지만 파일이 없으면 차단한다", () => {
    const result = checkPreflight(true, missingFile);
    expect(result.ok).toBe(false);
  });

  it("TTY이고 파일에 유효한 DATABASE_URL이 있으면 통과한다", () => {
    const result = checkPreflight(true, validFile);
    expect(result).toEqual({ ok: true, databaseUrl: "postgresql://real-prod-file/proddb" });
  });

  it("TTY이고 파일이 있어도, 부모 셸의 DATABASE_URL과 무관하게 파일 값만 쓰인다", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://fake-dev-shell/devdb");
    const result = checkPreflight(true, validFile);
    expect(result).toEqual({ ok: true, databaseUrl: "postgresql://real-prod-file/proddb" });
  });
});
