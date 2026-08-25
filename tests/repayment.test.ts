import { describe, expect, it } from "vitest";
import {
  buildFullSchedule,
  equalPaymentAmount,
  monthsBetween,
  simulateAvalanche,
} from "@/lib/repayment";

const now = new Date(2026, 0, 1);

describe("대출 상환 계산", () => {
  it("월 차이를 계산하고 지난 만기에도 최소 1개월을 반환한다", () => {
    expect(monthsBetween(now, new Date(2027, 0, 1))).toBe(12);
    expect(monthsBetween(now, new Date(2025, 0, 1))).toBe(1);
  });

  it("무이자 원리금균등 상환액을 계산한다", () => {
    expect(equalPaymentAmount(1_200_000, 0, 12)).toBe(100_000);
  });

  it.each(["EQUAL_PRINCIPAL_INTEREST", "EQUAL_PRINCIPAL", "BULLET"] as const)(
    "%s 스케줄에서 원금 합계와 최종 잔액이 정확하다",
    (repaymentMethod) => {
      const schedule = buildFullSchedule(
        {
          id: "loan",
          balance: 12_000_000,
          interestRate: 6,
          repaymentMethod,
          maturityDate: "2027-01-01",
        },
        now
      );

      expect(schedule).toHaveLength(12);
      expect(schedule.reduce((sum, row) => sum + row.principal, 0)).toBeCloseTo(12_000_000, 5);
      expect(schedule.at(-1)?.remainingBalance).toBeCloseTo(0, 5);
    }
  );

  it("추가 상환은 고금리 대출부터 줄이고 이자와 기간을 절감한다", () => {
    const result = simulateAvalanche(
      [
        { id: "high", balance: 5_000_000, interestRate: 12, repaymentMethod: "EQUAL_PRINCIPAL_INTEREST", maturityDate: "2028-01-01" },
        { id: "low", balance: 5_000_000, interestRate: 4, repaymentMethod: "EQUAL_PRINCIPAL_INTEREST", maturityDate: "2028-01-01" },
      ],
      300_000,
      now
    );

    expect(result.consideredLoanIds).toEqual(["high", "low"]);
    expect(result.interestSaved).toBeGreaterThan(0);
    expect(result.monthsSaved).toBeGreaterThan(0);
  });

  it("만기일시상환 대출은 우선상환 비교에서 제외한다", () => {
    const result = simulateAvalanche(
      [{ id: "bullet", balance: 5_000_000, interestRate: 8, repaymentMethod: "BULLET", maturityDate: "2027-01-01" }],
      100_000,
      now
    );

    expect(result.consideredLoanIds).toEqual([]);
    expect(result.excludedLoanIds).toEqual(["bullet"]);
  });
});
