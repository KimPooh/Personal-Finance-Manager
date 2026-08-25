"use client";

import { useMemo, useState } from "react";
import { simulateAvalanche, type LoanForSchedule } from "@/lib/repayment";
import { formatKRW } from "@/lib/format";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export function AvalancheSimulator({ loans }: { loans: LoanForSchedule[] }) {
  const { t } = useLocale();
  const [extra, setExtra] = useState("300000");

  const result = useMemo(() => {
    const extraAmount = Number(extra) || 0;
    return simulateAvalanche(loans, extraAmount);
  }, [loans, extra]);

  const bulletExcluded = result.excludedLoanIds.length;

  if (result.consideredLoanIds.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-400">
        {t("repayment.noEligibleLoans")}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-700">{t("repayment.simulatorTitle")}</h2>
      <p className="mt-1 text-xs text-slate-400">
        {t("repayment.simulatorDescription")}
        {bulletExcluded > 0 && t("repayment.bulletExcludedNote", { count: bulletExcluded })}
      </p>

      <div className="mt-3 flex items-center gap-2">
        <label className="text-xs font-medium text-slate-600">{t("repayment.extraMonthly")}</label>
        <input
          type="number"
          min={0}
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          className="w-40 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-xs text-red-700">{t("repayment.baselineInterest")}</p>
          <p className="text-base font-semibold text-red-700">
            {formatKRW(Math.round(result.baselineTotalInterest))}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-500">{t("repayment.avalancheInterest")}</p>
          <p className="text-base font-semibold text-slate-900">
            {formatKRW(Math.round(result.avalancheTotalInterest))}
          </p>
        </div>
        <div className="rounded-lg border-2 border-emerald-500 bg-emerald-50 p-3">
          <p className="text-xs font-medium text-emerald-700">{t("repayment.savedAmount")}</p>
          <p className="text-xl font-bold text-emerald-700">
            {formatKRW(Math.round(result.interestSaved))}
          </p>
          <p className="text-xs text-emerald-600">
            {t("repayment.monthsSaved", {
              months: result.monthsSaved,
              years: Math.round(result.monthsSaved / 12),
            })}
          </p>
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-400">{t("repayment.disclaimer")}</p>
    </div>
  );
}
