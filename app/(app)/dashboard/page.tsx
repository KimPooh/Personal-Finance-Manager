import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatKRW, formatDate, daysUntil } from "@/lib/format";
import { assetCategoryLabelT } from "@/lib/categories";
import { StatCard } from "@/components/shared/StatCard";
import { AssetBreakdownChart } from "@/components/dashboard/AssetBreakdownChart";
import { getServerT } from "@/lib/i18n/server";

export default async function DashboardPage() {
  const { locale, t } = await getServerT();

  const [assets, loans] = await Promise.all([
    prisma.asset.findMany(),
    prisma.loan.findMany(),
  ]);

  const totalAssets = assets.reduce((sum, a) => sum + a.currentValue, 0);
  const totalLoans = loans.reduce((sum, l) => sum + l.balance, 0);
  const netWorth = totalAssets - totalLoans;
  const monthlyLoanPayment = loans.reduce((sum, l) => sum + (l.monthlyPayment ?? 0), 0);
  const debtRatio = totalAssets > 0 ? (totalLoans / totalAssets) * 100 : 0;

  const byCategory = new Map<string, number>();
  for (const asset of assets) {
    byCategory.set(asset.category, (byCategory.get(asset.category) ?? 0) + asset.currentValue);
  }
  const chartData = Array.from(byCategory.entries()).map(([category, value]) => ({
    category,
    name: assetCategoryLabelT(t, category),
    value,
  }));

  const upcoming = loans
    .flatMap((loan) => {
      const items: { label: string; date: Date }[] = [];
      items.push({ label: t("dashboard.loanMaturity"), date: loan.maturityDate });
      if (loan.rateChangeDate) {
        items.push({ label: t("dashboard.rateChangeDate"), date: loan.rateChangeDate });
      }
      return items;
    })
    .map((item) => ({ ...item, days: daysUntil(item.date) }))
    .filter((item) => item.days >= 0 && item.days <= 60)
    .sort((a, b) => a.days - b.days);

  const hasData = assets.length > 0 || loans.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{t("dashboard.title")}</h1>
        <p className="text-sm text-slate-500">{t("dashboard.subtitle")}</p>
      </div>

      {!hasData && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
          {t("dashboard.emptyState")}{" "}
          <Link href="/assets" className="font-medium text-slate-900 underline">
            {t("dashboard.registerAssetLink")}
          </Link>
          {` ${t("dashboard.or")} `}
          <Link href="/loans" className="font-medium text-slate-900 underline">
            {t("dashboard.registerLoanLink")}
          </Link>
          {t("dashboard.startWith")}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("dashboard.totalAssets")} value={formatKRW(totalAssets)} />
        <StatCard label={t("dashboard.totalLoans")} value={formatKRW(totalLoans)} />
        <StatCard
          label={t("dashboard.netWorth")}
          value={formatKRW(netWorth)}
          tone={netWorth >= 0 ? "positive" : "negative"}
        />
        <StatCard
          label={t("dashboard.debtRatio")}
          value={`${debtRatio.toFixed(1)}%`}
          tone={debtRatio > 100 ? "negative" : "default"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-700">{t("dashboard.assetBreakdown")}</h2>
          <AssetBreakdownChart data={chartData} />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700">{t("dashboard.upcoming")}</h2>
          {upcoming.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">{t("dashboard.noUpcoming")}</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {upcoming.map((item, idx) => {
                const urgency =
                  item.days <= 7 ? "high" : item.days <= 30 ? "medium" : "low";
                const badgeClass =
                  urgency === "high"
                    ? "bg-red-100 text-red-700"
                    : urgency === "medium"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-600";
                return (
                  <li key={idx} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{item.label}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-slate-500">{formatDate(item.date, locale)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badgeClass}`}>
                        D-{item.days}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">
          {t("dashboard.monthlyLoanPaymentTotal")}
        </h2>
        <p className="mt-2 text-lg font-semibold text-slate-900">
          {formatKRW(monthlyLoanPayment)}
        </p>
      </div>
    </div>
  );
}
