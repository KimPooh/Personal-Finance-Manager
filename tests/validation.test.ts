import { describe, expect, it } from "vitest";
import { cashflowCopyPreviousInputSchema, cashflowInputSchema } from "@/lib/validation";

const validCashflow = {
  yearMonth: "2026-08",
  type: "INCOME" as const,
  category: "근로소득",
  amount: 3_000_000,
  memo: null,
};

describe("현금흐름 월 검증", () => {
  it.each(["2026-01", "2026-12"])('%s를 허용한다', (yearMonth) => {
    expect(cashflowInputSchema.safeParse({ ...validCashflow, yearMonth }).success).toBe(true);
    expect(cashflowCopyPreviousInputSchema.safeParse({ targetMonth: yearMonth }).success).toBe(true);
  });

  it.each(["2026-00", "2026-13", "2026-99", "26-08", "2026-8"])('%s를 거부한다', (yearMonth) => {
    expect(cashflowInputSchema.safeParse({ ...validCashflow, yearMonth }).success).toBe(false);
    expect(cashflowCopyPreviousInputSchema.safeParse({ targetMonth: yearMonth }).success).toBe(false);
  });
});
