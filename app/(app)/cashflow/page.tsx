import { prisma } from "@/lib/db";
import { decryptOptional } from "@/lib/crypto";
import { currentYearMonth } from "@/lib/format";
import { CashflowManager } from "@/components/cashflow/CashflowManager";
import { getServerT } from "@/lib/i18n/server";

export default async function CashflowPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { t } = await getServerT();
  const params = await searchParams;
  const selectedMonth = params.month && /^\d{4}-\d{2}$/.test(params.month)
    ? params.month
    : currentYearMonth();

  const nowMonth = currentYearMonth();

  const [assets, loans] = await Promise.all([prisma.asset.findMany(), prisma.loan.findMany()]);
  const totalAssets = assets.reduce((sum, a) => sum + a.currentValue, 0);
  const totalLoans = loans.reduce((sum, l) => sum + l.balance, 0);
  const netWorth = totalAssets - totalLoans;
  const totalMonthlyLoanPayment = loans.reduce((sum, l) => sum + (l.monthlyPayment ?? 0), 0);

  await prisma.netWorthSnapshot.upsert({
    where: { yearMonth: nowMonth },
    update: { totalAssets, totalLoans, netWorth, recordedAt: new Date() },
    create: { yearMonth: nowMonth, totalAssets, totalLoans, netWorth },
  });

  const [entries, snapshots] = await Promise.all([
    prisma.cashflowEntry.findMany({
      where: { yearMonth: selectedMonth },
      orderBy: { createdAt: "desc" },
    }),
    prisma.netWorthSnapshot.findMany({ orderBy: { yearMonth: "asc" } }),
  ]);

  const items = entries.map((e) => ({
    id: e.id,
    yearMonth: e.yearMonth,
    type: e.type,
    category: e.category,
    amount: e.amount,
    memo: decryptOptional(e.memoEnc),
  }));

  const trend = snapshots.map((s) => ({
    yearMonth: s.yearMonth,
    netWorth: s.netWorth,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{t("cashflow.title")}</h1>
        <p className="text-sm text-slate-500">{t("cashflow.subtitle")}</p>
      </div>
      <CashflowManager
        selectedMonth={selectedMonth}
        entries={items}
        totalMonthlyLoanPayment={totalMonthlyLoanPayment}
        netWorthTrend={trend}
      />
    </div>
  );
}
