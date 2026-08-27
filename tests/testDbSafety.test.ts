import { describe, expect, it, vi } from "vitest";
import {
  assertSafeTestDatabaseUrl,
  assertNotPublicSchema,
  generateTestSchemaName,
  withIsolatedSchema,
} from "./helpers/testDbSafety";

// 이 테스트 파일은 실제 DB에 전혀 연결하지 않습니다 - assertSafeTestDatabaseUrl이
// "연결을 시도하기 전에" 오설정을 막는다는 것 자체를 증명하는 것이 목적입니다.
// (요구사항: "운영 URL이 잘못 들어가도 실제 DB 연결 전에 throw하는 순수 단위 테스트")

const SAFE_TEST_URL = "postgresql://user:pass@ep-test-branch.neon.tech:5432/personal_finance_test";
const PROD_URL = "postgresql://user:pass@ep-prod-branch.neon.tech:5432/personal_finance";

describe("assertSafeTestDatabaseUrl", () => {
  it("TEST_DATABASE_URL이 없으면 DATABASE_URL로 대체하지 않고 즉시 중단한다", () => {
    expect(() =>
      assertSafeTestDatabaseUrl({
        testDatabaseUrl: undefined,
        productionDatabaseUrl: PROD_URL,
        allowDestructiveDbTests: "true",
      })
    ).toThrow(/TEST_DATABASE_URL/);
  });

  it("ALLOW_DESTRUCTIVE_DB_TESTS가 설정되지 않으면 중단한다", () => {
    expect(() =>
      assertSafeTestDatabaseUrl({
        testDatabaseUrl: SAFE_TEST_URL,
        productionDatabaseUrl: PROD_URL,
        allowDestructiveDbTests: undefined,
      })
    ).toThrow(/ALLOW_DESTRUCTIVE_DB_TESTS/);
  });

  it('ALLOW_DESTRUCTIVE_DB_TESTS가 "true" 문자열이 아니면 중단한다 (예: "false", "1")', () => {
    for (const value of ["false", "1", "TRUE", "yes"]) {
      expect(() =>
        assertSafeTestDatabaseUrl({
          testDatabaseUrl: SAFE_TEST_URL,
          productionDatabaseUrl: PROD_URL,
          allowDestructiveDbTests: value,
        })
      ).toThrow(/ALLOW_DESTRUCTIVE_DB_TESTS/);
    }
  });

  it("TEST_DATABASE_URL이 DATABASE_URL과 완전히 같으면 중단한다", () => {
    expect(() =>
      assertSafeTestDatabaseUrl({
        testDatabaseUrl: PROD_URL,
        productionDatabaseUrl: PROD_URL,
        allowDestructiveDbTests: "true",
      })
    ).toThrow(/같은 데이터베이스/);
  });

  it("대소문자·끝 슬래시만 다른 '정규화하면 같은' URL도 중단한다 (단순 문자열 비교보다 강함)", () => {
    const prodVariant = "postgresql://user:pass@EP-PROD-BRANCH.neon.tech:5432/personal_finance/";
    expect(prodVariant).not.toBe(PROD_URL); // 원문 문자열은 실제로 다름을 확인
    expect(() =>
      assertSafeTestDatabaseUrl({
        testDatabaseUrl: prodVariant,
        productionDatabaseUrl: PROD_URL,
        allowDestructiveDbTests: "true",
      })
    ).toThrow(/같은 데이터베이스/);
  });

  it("TEST_DATABASE_URL에 production 문자열이 포함되어 있으면 중단한다 (보조 검사)", () => {
    const looksLikeProd = "postgresql://user:pass@ep-production-x.neon.tech:5432/app";
    expect(() =>
      assertSafeTestDatabaseUrl({
        testDatabaseUrl: looksLikeProd,
        productionDatabaseUrl: undefined,
        allowDestructiveDbTests: "true",
      })
    ).toThrow(/운영을 암시/);
  });

  it("DATABASE_URL이 설정되지 않은 상태에서도 prod 문자열 보조 검사는 동작한다", () => {
    const looksLikeProd = "postgresql://user:pass@my-prod-db.example.com:5432/app";
    expect(() =>
      assertSafeTestDatabaseUrl({
        testDatabaseUrl: looksLikeProd,
        productionDatabaseUrl: undefined,
        allowDestructiveDbTests: "true",
      })
    ).toThrow(/운영을 암시/);
  });

  it("형식이 잘못된 TEST_DATABASE_URL은 안전하게 거절한다", () => {
    expect(() =>
      assertSafeTestDatabaseUrl({
        testDatabaseUrl: "not-a-valid-url",
        productionDatabaseUrl: PROD_URL,
        allowDestructiveDbTests: "true",
      })
    ).toThrow(/형식이 올바르지/);
  });

  it("DATABASE_URL(운영) 형식이 잘못되면 비교를 건너뛰지 않고 즉시 거절한다 (fail-closed)", () => {
    expect(() =>
      assertSafeTestDatabaseUrl({
        testDatabaseUrl: SAFE_TEST_URL,
        productionDatabaseUrl: "not-a-valid-url",
        allowDestructiveDbTests: "true",
      })
    ).toThrow(/DATABASE_URL 형식이 올바르지 않거나.*확인할 수 없어/);
  });

  it("TEST_DATABASE_URL이 postgresql:/postgres: 외 프로토콜(http/https/file)이면 거절한다", () => {
    for (const url of [
      "http://ep-test-branch.example.com:5432/personal_finance_test",
      "https://ep-test-branch.example.com:5432/personal_finance_test",
      "file:///tmp/personal_finance_test.db",
    ]) {
      expect(() =>
        assertSafeTestDatabaseUrl({
          testDatabaseUrl: url,
          productionDatabaseUrl: undefined,
          allowDestructiveDbTests: "true",
        })
      ).toThrow(/형식이 올바르지/);
    }
  });

  it("DATABASE_URL이 postgresql:/postgres: 외 프로토콜(http/https/file)이면 거절한다", () => {
    for (const url of [
      "http://ep-main-branch.example.com:5432/personal_finance",
      "https://ep-main-branch.example.com:5432/personal_finance",
      "file:///tmp/personal_finance.db",
    ]) {
      expect(() =>
        assertSafeTestDatabaseUrl({
          testDatabaseUrl: SAFE_TEST_URL,
          productionDatabaseUrl: url,
          allowDestructiveDbTests: "true",
        })
      ).toThrow(/DATABASE_URL 형식이 올바르지 않거나.*확인할 수 없어/);
    }
  });

  /**
   * try 블록 안에서 "도달하면 안 됩니다" 식으로 직접 throw하면, 그 오류가 같은
   * catch에 잡혀 "무언가 던져지긴 했다"는 이유로 테스트가 통과해버릴 수 있습니다
   * (대상 함수가 실제로는 아무것도 던지지 않아도 false-positive로 통과).
   * 그래서 여기서는 throw 여부를 caught 변수로만 판단하고, 대상 함수가 실제로
   * 예상한 안전 오류 문구를 던졌는지부터 명시적으로 검증한 뒤에만 자격증명
   * 비노출을 확인합니다.
   */
  function expectSafeErrorWithoutCredentials(
    opts: Parameters<typeof assertSafeTestDatabaseUrl>[0],
    expectedMessagePattern: RegExp,
    forbiddenSubstrings: string[]
  ) {
    let caught: unknown = undefined;
    let didThrow = false;
    try {
      assertSafeTestDatabaseUrl(opts);
    } catch (err) {
      didThrow = true;
      caught = err;
    }
    expect(didThrow).toBe(true); // 대상 함수가 실제로 throw했는지부터 확인
    const message = caught instanceof Error ? caught.message : String(caught);
    expect(message).toMatch(expectedMessagePattern); // 예상한 "안전한" 오류인지 확인
    for (const forbidden of forbiddenSubstrings) {
      expect(message).not.toContain(forbidden);
    }
  }

  it("잘못된 TEST_DATABASE_URL의 사용자명·비밀번호는 오류 메시지에 포함되지 않는다", () => {
    const secretUrl = "http://leaked_user:leaked_password@ep-test-branch.example.com:5432/db";
    expectSafeErrorWithoutCredentials(
      { testDatabaseUrl: secretUrl, productionDatabaseUrl: undefined, allowDestructiveDbTests: "true" },
      /형식이 올바르지/,
      ["leaked_user", "leaked_password"]
    );
  });

  it("잘못된 DATABASE_URL의 사용자명·비밀번호는 오류 메시지에 포함되지 않는다", () => {
    const secretUrl = "http://prod_admin:super_secret_pw@ep-main-branch.example.com:5432/db";
    expectSafeErrorWithoutCredentials(
      { testDatabaseUrl: SAFE_TEST_URL, productionDatabaseUrl: secretUrl, allowDestructiveDbTests: "true" },
      /DATABASE_URL 형식이 올바르지 않거나.*확인할 수 없어/,
      ["prod_admin", "super_secret_pw"]
    );
  });

  it("postgres://와 postgresql:// 두 프로토콜 표기 모두 정상 케이스로 통과한다", () => {
    const withPostgresqlScheme = "postgresql://user:pass@ep-test-branch.neon.tech:5432/personal_finance_test";
    const withPostgresScheme = "postgres://user:pass@ep-test-branch.neon.tech:5432/personal_finance_test";
    expect(
      assertSafeTestDatabaseUrl({
        testDatabaseUrl: withPostgresqlScheme,
        productionDatabaseUrl: PROD_URL,
        allowDestructiveDbTests: "true",
      })
    ).toBe(withPostgresqlScheme);
    expect(
      assertSafeTestDatabaseUrl({
        testDatabaseUrl: withPostgresScheme,
        productionDatabaseUrl: PROD_URL,
        allowDestructiveDbTests: "true",
      })
    ).toBe(withPostgresScheme);
  });

  it("모든 조건을 만족하는 정상 케이스는 통과하고 URL을 그대로 반환한다", () => {
    const result = assertSafeTestDatabaseUrl({
      testDatabaseUrl: SAFE_TEST_URL,
      productionDatabaseUrl: PROD_URL,
      allowDestructiveDbTests: "true",
    });
    expect(result).toBe(SAFE_TEST_URL);
  });

  it("DATABASE_URL 자체가 아예 설정되지 않은 로컬 환경에서도 정상 케이스는 통과한다", () => {
    const result = assertSafeTestDatabaseUrl({
      testDatabaseUrl: SAFE_TEST_URL,
      productionDatabaseUrl: undefined,
      allowDestructiveDbTests: "true",
    });
    expect(result).toBe(SAFE_TEST_URL);
  });
});

describe("assertNotPublicSchema", () => {
  it("public 스키마는 거절한다", () => {
    expect(() => assertNotPublicSchema("public")).toThrow(/public/);
    expect(() => assertNotPublicSchema("PUBLIC")).toThrow(/public/);
  });

  it("빈 문자열도 거절한다", () => {
    expect(() => assertNotPublicSchema("")).toThrow();
    expect(() => assertNotPublicSchema("   ")).toThrow();
  });

  it("격리된 테스트 스키마 이름은 통과시킨다", () => {
    expect(() => assertNotPublicSchema("test_1234_abcdef")).not.toThrow();
  });
});

describe("generateTestSchemaName", () => {
  it("Postgres 식별자 규칙을 만족하는 이름을 만든다 (소문자로 시작, 영숫자/밑줄만)", () => {
    const name = generateTestSchemaName();
    expect(name).toMatch(/^[a-z_][a-z0-9_]*$/);
  });

  it("호출할 때마다 서로 다른 이름을 만든다 (충돌 방지)", () => {
    const names = new Set(Array.from({ length: 20 }, () => generateTestSchemaName()));
    expect(names.size).toBe(20);
  });

  it("public이 아니라는 안전 검사도 통과한다", () => {
    expect(() => assertNotPublicSchema(generateTestSchemaName())).not.toThrow();
  });
});

describe("withIsolatedSchema", () => {
  it("성공 시에도 cleanup을 호출한다", async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const result = await withIsolatedSchema(async (schemaName) => {
      expect(schemaName).toMatch(/^test_/);
      return "ok";
    }, cleanup);
    expect(result).toBe("ok");
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("run이 실패해도 cleanup을 반드시 호출한다", async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined);
    await expect(
      withIsolatedSchema(async () => {
        throw new Error("boom");
      }, cleanup)
    ).rejects.toThrow("boom");
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("run과 cleanup에 같은 스키마 이름이 전달된다", async () => {
    let seenInRun = "";
    let seenInCleanup = "";
    await withIsolatedSchema(
      async (schemaName) => {
        seenInRun = schemaName;
      },
      async (schemaName) => {
        seenInCleanup = schemaName;
      }
    );
    expect(seenInRun).toBe(seenInCleanup);
    expect(seenInRun).not.toBe("");
  });
});
