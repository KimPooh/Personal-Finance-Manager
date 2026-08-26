import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseTransactionDate,
  normalizeDescription,
  classifyTransaction,
  computeRowFingerprint,
  computeFileHash,
  parseBankCsvRows,
  assignOccurrenceIndexes,
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

  it("거래일을 인식할 수 없으면 행 번호와 함께 오류로 남기고 계속 진행한다", () => {
    const rows: ParsedRow[] = [
      { 거래일자: "알수없음", 적요: "테스트", 출금액: "1,000" },
      { 거래일자: "2026-08-25", 적요: "정상 행", 출금액: "2,000" },
    ];
    const result = parseBankCsvRows(rows);
    expect(result.errors).toEqual([{ rowNumber: 2, error: expect.stringContaining("거래일") }]);
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
