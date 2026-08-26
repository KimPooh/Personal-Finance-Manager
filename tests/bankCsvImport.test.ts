import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseTransactionDate,
  normalizeDescription,
  classifyTransaction,
  computeRowFingerprint,
  computeFileHash,
  parseBankCsvRows,
  assignOccurrenceIndexes,
  looksLikeAccountNumber,
  bankCsvOptionsSchema,
  MAX_DESCRIPTION_LENGTH,
  MAX_TRANSACTION_AMOUNT,
  MAX_CSV_FILE_SIZE_BYTES,
  MAX_CSV_ROWS,
  MAX_SOURCE_LABEL_LENGTH,
  ALLOWED_CSV_EXTENSIONS,
} from "@/lib/bankCsvImport";
import type { ParsedRow } from "@/lib/importFile";

const TEST_KEY = "44".repeat(32);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseTransactionDate", () => {
  it("하이픈/점/슬래시 구분자를 모두 인식한다", () => {
    expect(parseTransactionDate("2026-08-25")).toBe("2026-08-25");
    expect(parseTransactionDate("2026.08.25")).toBe("2026-08-25");
    expect(parseTransactionDate("2026/08/25")).toBe("2026-08-25");
  });

  it("구분자 없는 8자리(YYYYMMDD)를 인식한다", () => {
    expect(parseTransactionDate("20260825")).toBe("2026-08-25");
  });

  it("한 자리 월/일도 0을 채워 정규화한다", () => {
    expect(parseTransactionDate("2026-8-5")).toBe("2026-08-05");
  });

  it("시각이 붙어 있어도 날짜 부분만 취한다", () => {
    expect(parseTransactionDate("2026-08-25 14:23:11")).toBe("2026-08-25");
  });

  it("월/일 범위를 벗어나면 null을 반환한다", () => {
    expect(parseTransactionDate("2026-13-01")).toBeNull();
    expect(parseTransactionDate("2026-01-32")).toBeNull();
  });

  it("알 수 없는 형식은 null을 반환한다", () => {
    expect(parseTransactionDate("어제")).toBeNull();
    expect(parseTransactionDate("")).toBeNull();
  });

  it("윤년의 2월 29일은 허용한다", () => {
    expect(parseTransactionDate("2024-02-29")).toBe("2024-02-29");
  });

  it("평년의 2월 29일은 거절한다", () => {
    expect(parseTransactionDate("2025-02-29")).toBeNull();
  });

  it("2월 30일·31일은 윤년 여부와 무관하게 거절한다", () => {
    expect(parseTransactionDate("2026-02-30")).toBeNull();
    expect(parseTransactionDate("2026-02-31")).toBeNull();
  });

  it("31일이 없는 달(4월)은 거절한다", () => {
    expect(parseTransactionDate("2026-04-31")).toBeNull();
  });

  it("공백+시각 또는 T+시각은 허용한다", () => {
    expect(parseTransactionDate("2026-08-25 14:30")).toBe("2026-08-25");
    expect(parseTransactionDate("2026-08-25T14:30:00")).toBe("2026-08-25");
  });

  it("날짜 뒤에 임의 문자열이 붙으면 거절한다", () => {
    expect(parseTransactionDate("2026-08-25abc")).toBeNull();
  });
});

describe("normalizeDescription", () => {
  it("앞뒤 공백을 제거하고 연속 공백을 하나로 줄인다", () => {
    expect(normalizeDescription("  스타벅스   강남점  ")).toBe("스타벅스 강남점");
  });

  it("그 외 내용은 바꾸지 않는다", () => {
    expect(normalizeDescription("이마트24 서초점")).toBe("이마트24 서초점");
  });
});

describe("classifyTransaction", () => {
  it("입금은 소득 키워드가 있으면 근로소득으로, 없으면 미분류 소득으로 분류한다", () => {
    expect(classifyTransaction("8월 급여", true)).toEqual({ type: "INCOME", category: "근로소득" });
    expect(classifyTransaction("계좌이체", true)).toEqual({ type: "INCOME", category: "미분류" });
  });

  it("고정지출 키워드를 우선 매칭한다", () => {
    expect(classifyTransaction("SKT 통신요금", false)).toEqual({
      type: "FIXED_EXPENSE",
      category: "통신비",
    });
    expect(classifyTransaction("넷플릭스 정기결제", false)).toEqual({
      type: "FIXED_EXPENSE",
      category: "구독료",
    });
  });

  it("변동지출 키워드를 매칭한다", () => {
    expect(classifyTransaction("스타벅스 강남점", false)).toEqual({
      type: "VARIABLE_EXPENSE",
      category: "식비",
    });
  });

  it("어떤 키워드도 없으면 변동지출/미분류로 남긴다", () => {
    expect(classifyTransaction("정체불명 가맹점", false)).toEqual({
      type: "VARIABLE_EXPENSE",
      category: "미분류",
    });
  });

  it("대소문자를 구분하지 않는다", () => {
    expect(classifyTransaction("STARBUCKS 신촌점", false).category).toBe("식비");
  });

  it("짧은 영문 키워드는 독립 토큰으로 등장할 때 정상 매칭한다", () => {
    expect(classifyTransaction("CU 강남점", false)).toEqual({ type: "VARIABLE_EXPENSE", category: "식비" });
    expect(classifyTransaction("KT 통신요금", false)).toEqual({ type: "FIXED_EXPENSE", category: "통신비" });
    expect(classifyTransaction("SKT 멤버십할인", false)).toEqual({
      type: "FIXED_EXPENSE",
      category: "통신비",
    });
    expect(classifyTransaction("GS25 역삼점", false)).toEqual({ type: "VARIABLE_EXPENSE", category: "식비" });
  });

  it("짧은 영문 키워드가 다른 단어 안에 우연히 포함된 경우는 매칭하지 않는다", () => {
    // "cu"가 CURRENCY 안에 접두사로만 포함 - 독립 토큰이 아니므로 미분류로 남아야 한다
    expect(classifyTransaction("CURRENCY EXCHANGE 강남", false)).toEqual({
      type: "VARIABLE_EXPENSE",
      category: "미분류",
    });
    // "kt"가 BACKTRACK 중간에 포함 - 마찬가지로 미분류
    expect(classifyTransaction("BACKTRACK PAYMENT", false)).toEqual({
      type: "VARIABLE_EXPENSE",
      category: "미분류",
    });
  });

  it("한글 키워드는 기존처럼 부분 문자열 매칭을 유지한다", () => {
    expect(classifyTransaction("이마트24 신촌점", false).category).toBe("식비");
  });
});

describe("computeRowFingerprint / computeFileHash", () => {
  it("ENCRYPTION_KEY가 같으면 같은 입력에 항상 같은 지문을 낸다", () => {
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);
    const a = computeRowFingerprint("2026-08-25", -5000, "스타벅스 강남점");
    const b = computeRowFingerprint("2026-08-25", -5000, "스타벅스 강남점");
    expect(a).toBe(b);
  });

  it("날짜·금액·적요 중 하나라도 다르면 다른 지문이 나온다", () => {
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);
    const base = computeRowFingerprint("2026-08-25", -5000, "스타벅스 강남점");
    expect(computeRowFingerprint("2026-08-26", -5000, "스타벅스 강남점")).not.toBe(base);
    expect(computeRowFingerprint("2026-08-25", -5001, "스타벅스 강남점")).not.toBe(base);
    expect(computeRowFingerprint("2026-08-25", -5000, "스타벅스 홍대점")).not.toBe(base);
  });

  it("같은 입력이라도 ENCRYPTION_KEY가 다르면 다른 지문이 나온다 (사전대입 방지)", () => {
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);
    const withKeyA = computeRowFingerprint("2026-08-25", -5000, "스타벅스 강남점");

    vi.stubEnv("ENCRYPTION_KEY", "55".repeat(32));
    const withKeyB = computeRowFingerprint("2026-08-25", -5000, "스타벅스 강남점");

    expect(withKeyA).not.toBe(withKeyB);
  });

  it("ENCRYPTION_KEY 없이는 호출할 수 없다", () => {
    expect(() => computeRowFingerprint("2026-08-25", -5000, "적요")).toThrow();
  });

  it("computeFileHash는 ENCRYPTION_KEY와 무관하게 결정적이다", () => {
    expect(computeFileHash("hello")).toBe(computeFileHash("hello"));
    expect(computeFileHash("hello")).not.toBe(computeFileHash("world"));
  });
});

describe("parseBankCsvRows", () => {
  beforeEach(() => {
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);
  });

  it("입금액/출금액이 분리된 열 구조를 처리한다", () => {
    const rows: ParsedRow[] = [
      { 거래일자: "2026-08-25", 적요: "8월 급여", 입금액: "3,500,000", 출금액: "" },
      { 거래일자: "2026-08-26", 적요: "스타벅스 강남점", 입금액: "", 출금액: "5,000" },
    ];
    const result = parseBankCsvRows(rows);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      transactionDate: "2026-08-25",
      yearMonth: "2026-08",
      type: "INCOME",
      category: "근로소득",
      amount: 3_500_000,
    });
    expect(result.rows[1]).toMatchObject({
      transactionDate: "2026-08-26",
      type: "VARIABLE_EXPENSE",
      category: "식비",
      amount: 5_000,
    });
  });

  it("부호 있는 단일 거래금액 열도 처리한다 (음수=출금)", () => {
    const rows: ParsedRow[] = [
      { Date: "2026-08-25", Description: "Grocery", Amount: "-12,000" },
      { Date: "2026-08-26", Description: "Salary", Amount: "3000000" },
    ];
    const result = parseBankCsvRows(rows);
    expect(result.errors).toEqual([]);
    expect(result.rows[0].amount).toBe(12_000);
    expect(result.rows[0].type).toBe("VARIABLE_EXPENSE");
    expect(result.rows[1].amount).toBe(3_000_000);
    expect(result.rows[1].type).toBe("INCOME");
  });

  it("카드 이용금액/승인금액 열은 값이 양수여도 항상 지출로 처리한다", () => {
    const rows: ParsedRow[] = [
      { 거래일자: "2026-08-25", 적요: "스타벅스 강남점", 이용금액: "5,000" },
      { 거래일자: "2026-08-26", 적요: "온라인쇼핑몰", 승인금액: "32,000" },
    ];
    const result = parseBankCsvRows(rows);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ type: "VARIABLE_EXPENSE", amount: 5_000 });
    expect(result.rows[1]).toMatchObject({ type: "VARIABLE_EXPENSE", amount: 32_000 });
  });

  it("취소금액/환불액 열은 소득으로 처리한다", () => {
    const rows: ParsedRow[] = [{ 거래일자: "2026-08-25", 적요: "온라인쇼핑몰 취소", 취소금액: "32,000" }];
    const result = parseBankCsvRows(rows);
    expect(result.errors).toEqual([]);
    expect(result.rows[0].type).toBe("INCOME");
    expect(result.rows[0].amount).toBe(32_000);
  });

  it("입금액과 출금액이 동시에 0이 아니면 방향을 판단할 수 없어 오류로 남긴다", () => {
    const rows: ParsedRow[] = [
      { 거래일자: "2026-08-25", 적요: "모호한 거래", 입금액: "1,000", 출금액: "2,000" },
    ];
    const result = parseBankCsvRows(rows);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("동시에");
  });

  it("단일 금액 열 + 입출금구분 열을 처리한다", () => {
    const rows: ParsedRow[] = [
      { 거래일자: "2026-08-25", 적요: "급여", 금액: "3,000,000", 입출금구분: "입금" },
      { 거래일자: "2026-08-26", 적요: "커피", 금액: "4,500", 입출금구분: "출금" },
    ];
    const result = parseBankCsvRows(rows);
    expect(result.errors).toEqual([]);
    expect(result.rows[0].type).toBe("INCOME");
    expect(result.rows[1].type).toBe("VARIABLE_EXPENSE");
  });

  it("입출금구분 값을 알 수 없으면 추측하지 않고 오류로 남긴다", () => {
    const rows: ParsedRow[] = [{ 거래일자: "2026-08-25", 적요: "거래", 금액: "1,000", 입출금구분: "알수없음" }];
    const result = parseBankCsvRows(rows);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain("입출금구분");
  });

  it("sourceType이 CARD면 단일 금액 열의 양수도 지출로 처리한다", () => {
    const rows: ParsedRow[] = [{ 거래일자: "2026-08-25", 적요: "온라인쇼핑몰", 금액: "32,000" }];
    const result = parseBankCsvRows(rows, { sourceType: "CARD" });
    expect(result.errors).toEqual([]);
    expect(result.rows[0].type).toBe("VARIABLE_EXPENSE");
  });

  it("sourceType 없이 단일 금액 열만 있으면 기존처럼 부호로 방향을 판단한다 (기본값은 은행 관례)", () => {
    const rows: ParsedRow[] = [{ 거래일자: "2026-08-25", 적요: "계좌이체", 금액: "32,000" }];
    const result = parseBankCsvRows(rows);
    expect(result.errors).toEqual([]);
    expect(result.rows[0].type).toBe("INCOME");
  });

  it("거래일을 인식할 수 없으면 행 번호와 함께 오류로 남기고 계속 진행한다", () => {
    const rows: ParsedRow[] = [
      { 거래일자: "알수없음", 적요: "테스트", 출금액: "1,000" },
      { 거래일자: "2026-08-25", 적요: "정상 행", 출금액: "2,000" },
    ];
    const result = parseBankCsvRows(rows);
    expect(result.errors).toEqual([
      { rowNumber: 2, code: "INVALID_DATE", error: expect.stringContaining("거래일") },
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].amount).toBe(2_000);
  });

  it("유효한 금액 열이 없으면 오류로 남긴다", () => {
    const rows: ParsedRow[] = [{ 거래일자: "2026-08-25", 적요: "빈 금액" }];
    const result = parseBankCsvRows(rows);
    expect(result.errors).toHaveLength(1);
    expect(result.rows).toHaveLength(0);
  });

  it("빈 입력은 빈 결과를 반환한다", () => {
    expect(parseBankCsvRows([])).toEqual({ rows: [], errors: [] });
  });

  it("헤더 대소문자를 구분하지 않는다", () => {
    const rows: ParsedRow[] = [{ DATE: "2026-08-25", description: "Coffee", amount: "-4500" }];
    const result = parseBankCsvRows(rows);
    expect(result.errors).toEqual([]);
    expect(result.rows[0].amount).toBe(4_500);
  });

  it("각 파싱된 행에 원본 파일 기준 1-based rowNumber를 담는다", () => {
    const rows: ParsedRow[] = [
      { 거래일자: "알수없음", 적요: "오류행", 출금액: "1,000" },
      { 거래일자: "2026-08-25", 적요: "첫번째", 출금액: "1,000" },
      { 거래일자: "2026-08-26", 적요: "두번째", 출금액: "2,000" },
    ];
    const result = parseBankCsvRows(rows);
    expect(result.errors).toEqual([expect.objectContaining({ rowNumber: 2 })]);
    expect(result.rows.map((r) => r.rowNumber)).toEqual([3, 4]);
  });

  it("적요가 MAX_DESCRIPTION_LENGTH를 넘으면 DESCRIPTION_TOO_LONG 오류로 남긴다", () => {
    const rows: ParsedRow[] = [
      { 거래일자: "2026-08-25", 적요: "가".repeat(MAX_DESCRIPTION_LENGTH + 1), 출금액: "1,000" },
    ];
    const result = parseBankCsvRows(rows);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toEqual([expect.objectContaining({ code: "DESCRIPTION_TOO_LONG" })]);
  });

  it("금액이 MAX_TRANSACTION_AMOUNT를 넘으면 AMOUNT_TOO_LARGE 오류로 남긴다", () => {
    const rows: ParsedRow[] = [
      { 거래일자: "2026-08-25", 적요: "초고액", 출금액: String(MAX_TRANSACTION_AMOUNT + 1) },
    ];
    const result = parseBankCsvRows(rows);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toEqual([expect.objectContaining({ code: "AMOUNT_TOO_LARGE" })]);
  });

  it("MAX_TRANSACTION_AMOUNT 이하 금액은 정상 처리된다", () => {
    const rows: ParsedRow[] = [
      { 거래일자: "2026-08-25", 적요: "상한선", 출금액: String(MAX_TRANSACTION_AMOUNT) },
    ];
    const result = parseBankCsvRows(rows);
    expect(result.errors).toEqual([]);
    expect(result.rows[0].amount).toBe(MAX_TRANSACTION_AMOUNT);
  });
});

describe("looksLikeAccountNumber", () => {
  it("숫자 10자리 이상이면 계좌번호로 판단한다", () => {
    expect(looksLikeAccountNumber("1101234567890")).toBe(true);
    expect(looksLikeAccountNumber("110-123-456789")).toBe(true);
  });

  it("짧은 숫자열이나 일반 텍스트는 계좌번호로 판단하지 않는다", () => {
    expect(looksLikeAccountNumber("국민은행")).toBe(false);
    expect(looksLikeAccountNumber("12345")).toBe(false);
    expect(looksLikeAccountNumber("내 급여통장")).toBe(false);
  });
});

describe("bankCsvOptionsSchema", () => {
  it("sourceType만 있어도 통과한다", () => {
    expect(bankCsvOptionsSchema.safeParse({ sourceType: "BANK" }).success).toBe(true);
  });

  it("BANK/CARD가 아닌 sourceType은 거절한다", () => {
    expect(bankCsvOptionsSchema.safeParse({ sourceType: "ETC" }).success).toBe(false);
  });

  it("계좌번호처럼 보이는 sourceLabel은 거절한다", () => {
    const result = bankCsvOptionsSchema.safeParse({ sourceType: "BANK", sourceLabel: "110-123-456789" });
    expect(result.success).toBe(false);
  });

  it(`sourceLabel이 MAX_SOURCE_LABEL_LENGTH(${MAX_SOURCE_LABEL_LENGTH})를 넘으면 거절한다`, () => {
    const result = bankCsvOptionsSchema.safeParse({
      sourceType: "BANK",
      sourceLabel: "a".repeat(MAX_SOURCE_LABEL_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it("일반적인 표시명 sourceLabel은 통과한다", () => {
    const result = bankCsvOptionsSchema.safeParse({ sourceType: "BANK", sourceLabel: "국민은행 생활비 통장" });
    expect(result.success).toBe(true);
  });
});

describe("업로드 제한 상수", () => {
  it("확장자는 .csv/.xlsx만 허용한다 (.xls 제외)", () => {
    expect(ALLOWED_CSV_EXTENSIONS).toEqual([".csv", ".xlsx"]);
  });

  it("파일 크기·행 수 상한이 양의 정수로 정의되어 있다", () => {
    expect(MAX_CSV_FILE_SIZE_BYTES).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_CSV_ROWS)).toBe(true);
    expect(MAX_CSV_ROWS).toBeGreaterThan(0);
  });
});

describe("assignOccurrenceIndexes", () => {
  it("서로 다른 지문은 모두 0번째다", () => {
    expect(assignOccurrenceIndexes(["a", "b", "c"])).toEqual([0, 0, 0]);
  });

  it("같은 지문이 반복되면 등장 순서대로 증가한다", () => {
    expect(assignOccurrenceIndexes(["a", "a", "a"])).toEqual([0, 1, 2]);
  });

  it("섞여 있어도 각 지문별로 독립적으로 센다", () => {
    expect(assignOccurrenceIndexes(["a", "b", "a", "b", "a"])).toEqual([0, 0, 1, 1, 2]);
  });

  it("동일 날짜·금액·적요의 정상 거래가 여러 번이어도 서로 다른 레코드로 남는다 (occurrenceIndex로 구분)", () => {
    vi.stubEnv("ENCRYPTION_KEY", TEST_KEY);
    const rows: ParsedRow[] = [
      { 거래일자: "2026-08-25", 적요: "커피", 출금액: "4,500" },
      { 거래일자: "2026-08-25", 적요: "커피", 출금액: "4,500" },
      { 거래일자: "2026-08-25", 적요: "커피", 출금액: "4,500" },
    ];
    const parsed = parseBankCsvRows(rows);
    const occurrences = assignOccurrenceIndexes(parsed.rows.map((r) => r.rowFingerprint));
    expect(occurrences).toEqual([0, 1, 2]);
    // 세 지문 자체는 전부 동일 - 반복 거래를 fingerprint만으로는 구분하지 않는다는 뜻
    expect(new Set(parsed.rows.map((r) => r.rowFingerprint)).size).toBe(1);
  });
});
