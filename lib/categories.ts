export const ASSET_CATEGORIES = [
  { value: "DEPOSIT", label: "예금" },
  { value: "SAVINGS", label: "적금" },
  { value: "STOCK", label: "주식" },
  { value: "ETF", label: "ETF" },
  { value: "PENSION", label: "연금" },
  { value: "REAL_ESTATE", label: "부동산" },
  { value: "CAR", label: "자동차" },
  { value: "OTHER", label: "기타" },
] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number]["value"];

export const LOAN_CATEGORIES = [
  { value: "CREDIT", label: "신용대출" },
  { value: "MORTGAGE", label: "주택담보대출" },
  { value: "JEONSE", label: "전세대출" },
  { value: "STUDENT", label: "학자금대출" },
  { value: "CARD_LOAN", label: "카드론" },
  { value: "OTHER", label: "기타" },
] as const;

export type LoanCategory = (typeof LOAN_CATEGORIES)[number]["value"];

export const RATE_TYPES = [
  { value: "FIXED", label: "고정금리" },
  { value: "VARIABLE", label: "변동금리" },
] as const;

export const REPAYMENT_METHODS = [
  { value: "EQUAL_PRINCIPAL_INTEREST", label: "원리금균등상환" },
  { value: "EQUAL_PRINCIPAL", label: "원금균등상환" },
  { value: "BULLET", label: "만기일시상환" },
] as const;

export const CASHFLOW_TYPES = [
  { value: "INCOME", label: "소득" },
  { value: "FIXED_EXPENSE", label: "고정지출" },
  { value: "VARIABLE_EXPENSE", label: "변동지출" },
] as const;

function labelFrom(list: readonly { value: string; label: string }[], value: string): string {
  return list.find((i) => i.value === value)?.label ?? value;
}

/** 한글 고정 라벨 — CSV/엑셀 업로드 매칭(resolveCategoryCode)에서만 사용합니다. */
export const assetCategoryLabel = (value: string) => labelFrom(ASSET_CATEGORIES, value);
export const loanCategoryLabel = (value: string) => labelFrom(LOAN_CATEGORIES, value);
export const rateTypeLabel = (value: string) => labelFrom(RATE_TYPES, value);
export const repaymentMethodLabel = (value: string) => labelFrom(REPAYMENT_METHODS, value);
export const cashflowTypeLabel = (value: string) => labelFrom(CASHFLOW_TYPES, value);

/** 화면 표시용 — 현재 언어(t)에 맞는 라벨을 반환합니다. */
type TFn = (key: string, vars?: Record<string, string | number>) => string;
export const assetCategoryLabelT = (t: TFn, value: string) => t(`categories.asset.${value}`);
export const loanCategoryLabelT = (t: TFn, value: string) => t(`categories.loan.${value}`);
export const rateTypeLabelT = (t: TFn, value: string) => t(`categories.rateType.${value}`);
export const repaymentMethodLabelT = (t: TFn, value: string) =>
  t(`categories.repaymentMethod.${value}`);
export const cashflowTypeLabelT = (t: TFn, value: string) => t(`categories.cashflowType.${value}`);

/** CSV/엑셀 업로드 시 한글 라벨 또는 영문 코드를 코드값으로 변환. 매칭 실패 시 null. */
export function resolveCategoryCode(
  list: readonly { value: string; label: string }[],
  raw: string
): string | null {
  const normalized = raw.trim().toUpperCase();
  const byCode = list.find((i) => i.value.toUpperCase() === normalized);
  if (byCode) return byCode.value;
  const byLabel = list.find((i) => i.label === raw.trim());
  if (byLabel) return byLabel.value;
  return null;
}
