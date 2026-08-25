export interface CashflowCopyEntry {
  type: string;
  category: string;
  amount: number;
  memo: string | null;
}

export interface CashflowCopyPlan {
  toCreate: CashflowCopyEntry[];
  skippedCount: number;
}

function normalizeMemo(memo: string | null): string {
  return memo && memo.trim() !== "" ? memo.trim() : "";
}

function groupKey(entry: CashflowCopyEntry): string {
  return JSON.stringify([entry.type, entry.category.trim(), normalizeMemo(entry.memo)]);
}

/**
 * 원본과 대상 월을 다중집합으로 비교해 대상 월에 부족한 항목만 복사 계획에 포함합니다.
 * 같은 서명의 항목이 여러 건이어도 개수를 보존하며, 입력 배열은 변경하지 않습니다.
 */
export function planCashflowCopies(
  sourceEntries: readonly CashflowCopyEntry[],
  targetEntries: readonly CashflowCopyEntry[]
): CashflowCopyPlan {
  const targetGroups = new Map<string, Map<number, number>>();

  for (const entry of targetEntries) {
    const key = groupKey(entry);
    const amounts = targetGroups.get(key) ?? new Map<number, number>();
    amounts.set(entry.amount, (amounts.get(entry.amount) ?? 0) + 1);
    targetGroups.set(key, amounts);
  }

  const toCreate: CashflowCopyEntry[] = [];
  let skippedCount = 0;

  for (const entry of sourceEntries) {
    const key = groupKey(entry);
    const amounts = targetGroups.get(key) ?? new Map<number, number>();
    const remaining = amounts.get(entry.amount) ?? 0;

    if (remaining > 0) {
      amounts.set(entry.amount, remaining - 1);
      skippedCount += 1;
    } else {
      toCreate.push({ ...entry });
    }
  }

  return { toCreate, skippedCount };
}
