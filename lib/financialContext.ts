import { prisma } from "@/lib/db";
import { assetCategoryLabel, loanCategoryLabel, rateTypeLabel, repaymentMethodLabel } from "@/lib/categories";
import { currentYearMonth, daysUntil } from "@/lib/format";

// Claude API에는 이름·계좌·금융회사명 등 식별 정보를 절대 포함하지 않고,
// 계산에 필요한 숫자와 조건만 전달합니다.

export async function buildFinancialContext() {
  const nowMonth = currentYearMonth();

  const [assets, loans, cashflowEntries, snapshots, profile] = await Promise.all([
    prisma.asset.findMany(),
    prisma.loan.findMany(),
    prisma.cashflowEntry.findMany({ where: { yearMonth: nowMonth } }),
    prisma.netWorthSnapshot.findMany({ orderBy: { yearMonth: "asc" }, take: 12 }),
    prisma.userProfile.findFirst(),
  ]);

  const totalAssets = assets.reduce((s, a) => s + a.currentValue, 0);
  const totalLoans = loans.reduce((s, l) => s + l.balance, 0);
  const netWorth = totalAssets - totalLoans;

  const assetsByCategory = new Map<string, number>();
  for (const a of assets) {
    assetsByCategory.set(a.category, (assetsByCategory.get(a.category) ?? 0) + a.currentValue);
  }

  const income = cashflowEntries.filter((e) => e.type === "INCOME").reduce((s, e) => s + e.amount, 0);
  const fixedExpense = cashflowEntries
    .filter((e) => e.type === "FIXED_EXPENSE")
    .reduce((s, e) => s + e.amount, 0);
  const variableExpense = cashflowEntries
    .filter((e) => e.type === "VARIABLE_EXPENSE")
    .reduce((s, e) => s + e.amount, 0);
  const monthlyLoanPayment = loans.reduce((s, l) => s + (l.monthlyPayment ?? 0), 0);

  return {
    asOf: new Date().toISOString().slice(0, 10),
    totalAssets,
    totalLoans,
    netWorth,
    debtRatioPercent: totalAssets > 0 ? Number(((totalLoans / totalAssets) * 100).toFixed(1)) : null,
    assetsByCategory: Array.from(assetsByCategory.entries()).map(([category, value]) => ({
      category: assetCategoryLabel(category),
      value,
    })),
    loans: loans.map((l) => ({
      category: loanCategoryLabel(l.category),
      balance: l.balance,
      interestRatePercent: l.interestRate,
      rateType: rateTypeLabel(l.rateType),
      repaymentMethod: repaymentMethodLabel(l.repaymentMethod),
      monthlyPayment: l.monthlyPayment,
      maturityInDays: daysUntil(l.maturityDate),
      rateChangeInDays: l.rateChangeDate ? daysUntil(l.rateChangeDate) : null,
    })),
    currentMonth: {
      yearMonth: nowMonth,
      income,
      fixedExpense,
      variableExpense,
      surplus: income - fixedExpense - variableExpense,
      monthlyLoanPayment,
      surplusAfterDebt: income - fixedExpense - variableExpense - monthlyLoanPayment,
    },
    netWorthTrend: snapshots.map((s) => ({ yearMonth: s.yearMonth, netWorth: s.netWorth })),
    profile: profile
      ? {
          age: profile.age,
          region: profile.region,
          householdAnnualIncomeManwon: profile.householdAnnualIncomeManwon,
          occupation: profile.occupation,
          householdType: profile.householdType,
          maritalStatus: profile.maritalStatus,
          numberOfChildren: profile.numberOfChildren,
          homeOwnership: profile.homeOwnership,
        }
      : null,
  };
}

export type FinancialContext = Awaited<ReturnType<typeof buildFinancialContext>>;
