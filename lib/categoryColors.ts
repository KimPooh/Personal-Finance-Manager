// 카테고리별 고정 색상 — 차트와 목록 화면에서 동일한 색으로 표시해
// 어떤 화면에서든 같은 카테고리를 한눈에 인식할 수 있게 합니다.

export const ASSET_CATEGORY_COLORS: Record<string, string> = {
  DEPOSIT: "#6366f1", // indigo
  SAVINGS: "#10b981", // emerald
  HOUSING_SUBSCRIPTION: "#84cc16", // lime
  STOCK: "#f59e0b", // amber
  ETF: "#f43f5e", // rose
  CRYPTO: "#ec4899", // pink
  PENSION: "#0ea5e9", // sky
  REAL_ESTATE: "#a855f7", // violet
  CAR: "#14b8a6", // teal
  OTHER: "#fb923c", // orange
};

export const LOAN_CATEGORY_COLORS: Record<string, string> = {
  CREDIT: "#f43f5e", // rose
  OVERDRAFT: "#14b8a6", // teal
  MORTGAGE: "#6366f1", // indigo
  JEONSE: "#0ea5e9", // sky
  STUDENT: "#a855f7", // violet
  CARD_LOAN: "#f59e0b", // amber
  OTHER: "#fb923c", // orange
};

export function assetCategoryColor(category: string): string {
  return ASSET_CATEGORY_COLORS[category] ?? "#94a3b8";
}

export function loanCategoryColor(category: string): string {
  return LOAN_CATEGORY_COLORS[category] ?? "#94a3b8";
}
