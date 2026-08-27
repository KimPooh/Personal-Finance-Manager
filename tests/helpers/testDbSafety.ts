import crypto from "node:crypto";

// PostgreSQL 전환 이후 통합 테스트가 실수로 운영 DB를 건드리는 걸 막기 위한 순수
// 유틸리티입니다. 이 파일은 절대 DB 클라이언트를 import하지 않고 실제로 연결을
// 시도하지도 않습니다 - 모든 검사는 문자열/객체만 다루는 순수 함수라, 오설정된
// 값이 들어와도 "연결 자체를 시도하기 전에" 예외를 던질 수 있습니다. 실제 연결과
// 스키마 생성/정리는 이 유틸리티를 사용하는 통합 테스트 쪽(PostgreSQL 전환 커밋)
// 담당입니다.

/**
 * Postgres 연결 문자열에서 "같은 데이터베이스를 가리키는지" 비교하는 데 의미 있는
 * 부분만 뽑아 정규화합니다. 쿼리 파라미터 순서, 대소문자, 끝 슬래시 같은 사소한
 * 차이로 "다른 DB"로 오판(=검사를 통과)하지 않도록 host+port+database만 비교합니다.
 */
function normalizeConnectionIdentity(rawUrl: string): string {
  const parsed = new URL(rawUrl);
  const host = parsed.hostname.toLowerCase();
  const port = parsed.port || "5432";
  const database = parsed.pathname.replace(/^\/+|\/+$/g, "").toLowerCase();
  return `${host}:${port}/${database}`;
}

/** 연결 문자열의 자격증명(user:password@) 부분을 제거합니다 - 오류 메시지에 절대 포함하지 않기 위함. */
function stripCredentials(rawUrl: string): string {
  return rawUrl.replace(/:\/\/[^/@]*@/, "://");
}

export interface TestDbSafetyOptions {
  testDatabaseUrl: string | undefined;
  productionDatabaseUrl: string | undefined;
  allowDestructiveDbTests: string | undefined;
}

/**
 * 테스트가 실제 DB에 연결하기 전에 반드시 통과해야 하는 안전 검사입니다.
 * 하나라도 걸리면 즉시 throw합니다 - 호출자는 이 함수가 정상 반환했을 때만
 * testDatabaseUrl로 연결을 시도해야 합니다.
 *
 * 검사 순서(우선순위 순):
 * 1) TEST_DATABASE_URL 자체가 없으면 중단 (DATABASE_URL로 폴백하지 않음)
 * 2) ALLOW_DESTRUCTIVE_DB_TESTS=true가 아니면 중단 (명시적 opt-in 필수)
 * 3) TEST_DATABASE_URL과 DATABASE_URL이 정규화 비교로 같은 DB를 가리키면 중단
 * 4) (보조 검사) TEST_DATABASE_URL에 prod/production 문자열이 있으면 중단
 */
export function assertSafeTestDatabaseUrl(opts: TestDbSafetyOptions): string {
  const { testDatabaseUrl, productionDatabaseUrl, allowDestructiveDbTests } = opts;

  if (!testDatabaseUrl) {
    throw new Error(
      "TEST_DATABASE_URL이 설정되지 않았습니다. DATABASE_URL로 대체 연결하지 않고 테스트를 중단합니다."
    );
  }

  if (allowDestructiveDbTests !== "true") {
    throw new Error(
      "ALLOW_DESTRUCTIVE_DB_TESTS=true가 설정되지 않아 테스트를 중단합니다 (파괴적 DB 테스트는 명시적으로 허용해야 실행됩니다)."
    );
  }

  let normalizedTest: string;
  try {
    normalizedTest = normalizeConnectionIdentity(testDatabaseUrl);
  } catch {
    throw new Error("TEST_DATABASE_URL 형식이 올바르지 않아 테스트를 중단합니다.");
  }

  if (productionDatabaseUrl) {
    let normalizedProd: string | null = null;
    try {
      normalizedProd = normalizeConnectionIdentity(productionDatabaseUrl);
    } catch {
      normalizedProd = null; // 운영 값 형식이 이상하면 이 비교는 건너뛰고 아래 보조 검사에 맡깁니다.
    }
    if (normalizedProd && normalizedTest === normalizedProd) {
      throw new Error(
        "TEST_DATABASE_URL이 DATABASE_URL과 같은 데이터베이스를 가리키고 있어 테스트를 중단합니다."
      );
    }
  }

  if (/prod|production/i.test(stripCredentials(testDatabaseUrl))) {
    throw new Error(
      "TEST_DATABASE_URL에 운영을 암시하는 문자열(prod/production)이 포함되어 있어 테스트를 중단합니다."
    );
  }

  return testDatabaseUrl;
}

/** public 스키마를 대상으로 한 파괴적 작업(DROP/TRUNCATE 등)을 막는 가드입니다. */
export function assertNotPublicSchema(schemaName: string): void {
  const trimmed = schemaName.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "public") {
    throw new Error(
      `public 스키마(또는 빈 이름)에 대한 파괴적 작업은 허용되지 않습니다: "${schemaName}"`
    );
  }
}

const SCHEMA_NAME_RE = /^[a-z_][a-z0-9_]*$/;

/**
 * 테스트 실행마다 고유한 Postgres 스키마 이름을 만듭니다. 소문자/숫자/밑줄만
 * 사용해 따옴표 없이도 안전하게 SQL 식별자로 쓸 수 있고, 항상 문자로 시작합니다.
 */
export function generateTestSchemaName(): string {
  const suffix = crypto.randomBytes(6).toString("hex");
  const name = `test_${Date.now()}_${suffix}`;
  if (!SCHEMA_NAME_RE.test(name)) {
    // 방어적 체크 - 위 생성 규칙상 이론적으로 발생하지 않지만, 혹시라도 잘못된
    // 이름으로 스키마를 만드는 일이 없도록 명시적으로 막습니다.
    throw new Error(`생성된 스키마 이름이 유효하지 않습니다: "${name}"`);
  }
  return name;
}

/**
 * 격리된 스키마를 만들어 콜백을 실행하고, 성공/실패와 무관하게 항상 정리합니다.
 * 이 함수 자체는 스키마를 실제로 만들거나 지우지 않습니다 - run/cleanup 콜백에
 * 실제 DB 연결 로직을 주입받는 구조라, 이 파일은 여전히 DB에 직접 연결하지 않습니다.
 */
export async function withIsolatedSchema<T>(
  run: (schemaName: string) => Promise<T>,
  cleanup: (schemaName: string) => Promise<void>
): Promise<T> {
  const schemaName = generateTestSchemaName();
  try {
    return await run(schemaName);
  } finally {
    await cleanup(schemaName);
  }
}
