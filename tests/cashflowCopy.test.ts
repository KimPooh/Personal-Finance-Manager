import { describe, expect, it } from "vitest";
import { planCashflowCopies, type CashflowCopyEntry } from "@/lib/cashflowCopy";

const salary: CashflowCopyEntry = {
  type: "INCOME",
  category: "근로소득",
  amount: 3_000_000,
  memo: null,
};

describe("지난달 현금흐름 복사 계획", () => {
  it("대상 월이 비었으면 원본을 모두 복사한다", () => {
    const source = [salary, { ...salary, category: "부업", amount: 200_000 }];
    const result = planCashflowCopies(source, []);

    expect(result.toCreate).toEqual(source);
    expect(result.skippedCount).toBe(0);
  });

  it("반복 복사 시 이미 존재하는 항목을 모두 건너뛴다", () => {
    const source = [salary, { ...salary, category: "부업", amount: 200_000 }];
    const result = planCashflowCopies(source, source);

    expect(result.toCreate).toEqual([]);
    expect(result.skippedCount).toBe(2);
  });

  it("동일 서명 항목을 개수 기준으로 비교한다", () => {
    const source = [salary, salary, salary];
    const result = planCashflowCopies(source, [salary]);

    expect(result.toCreate).toHaveLength(2);
    expect(result.skippedCount).toBe(1);
  });

  it("null·빈 메모와 앞뒤 공백을 동일하게 취급한다", () => {
    const source = [{ ...salary, category: " 근로소득 ", memo: null }];
    const target = [{ ...salary, memo: "   " }];

    expect(planCashflowCopies(source, target)).toEqual({ toCreate: [], skippedCount: 1 });
  });

  it("금액이나 메모가 다르면 별도 항목으로 복사한다", () => {
    const result = planCashflowCopies(
      [{ ...salary, memo: "8월" }, { ...salary, amount: 3_100_000 }],
      [salary]
    );

    expect(result.toCreate).toHaveLength(2);
    expect(result.skippedCount).toBe(0);
  });

  it("입력 배열과 항목을 변경하지 않는다", () => {
    const source = [salary];
    const target: CashflowCopyEntry[] = [];
    const sourceBefore = structuredClone(source);

    const result = planCashflowCopies(source, target);

    expect(source).toEqual(sourceBefore);
    expect(result.toCreate[0]).not.toBe(source[0]);
  });
});
