"use client";

import { useState } from "react";
import { buildFullSchedule, type LoanForSchedule } from "@/lib/repayment";
import { formatKRW } from "@/lib/format";
import { loanCategoryLabelT } from "@/lib/categories";
import { loanCategoryColor } from "@/lib/categoryColors";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export function LoanScheduleTable({
  loan,
}: {
  loan: LoanForSchedule & { category: string; institution: string | null };
}) {
  const { t } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const schedule = buildFullSchedule(loan);
  const totalInterest = schedule.reduce((sum, r) => sum + r.interest, 0);
  const totalPrincipal = schedule.reduce((sum, r) => sum + r.principal, 0);

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white shadow-sm"
      style={{ borderLeft: `4px solid ${loanCategoryColor(loan.category)}` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: loanCategoryColor(loan.category) }}
              aria-hidden
            />
            {loanCategoryLabelT(t, loan.category)} {loan.institution ? `· ${loan.institution}` : ""}
          </p>
          <p className="text-xs text-slate-500">
            {t("repayment.remainingMonths", {
              balance: formatKRW(loan.balance),
              rate: loan.interestRate.toFixed(2),
              months: schedule.length,
            })}
          </p>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          {expanded ? t("common.close") : t("repayment.viewSchedule")}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 p-4">
          <div className="mb-3 grid grid-cols-2 gap-3 text-xs text-slate-600 sm:grid-cols-2">
            <p>{t("repayment.totalPrincipalToPayoff", { amount: formatKRW(totalPrincipal) })}</p>
            <p>{t("repayment.totalInterestToPayoff", { amount: formatKRW(totalInterest) })}</p>
          </div>
          <div className="max-h-64 overflow-y-auto overflow-x-auto rounded-md border border-slate-100">
            <table className="w-full text-xs">
              <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2">{t("repayment.colPeriod")}</th>
                  <th className="px-3 py-2">{t("repayment.colPrincipal")}</th>
                  <th className="px-3 py-2">{t("repayment.colInterest")}</th>
                  <th className="px-3 py-2">{t("repayment.colPayment")}</th>
                  <th className="px-3 py-2">{t("repayment.colRemainingBalance")}</th>
                </tr>
              </thead>
              <tbody>
                {schedule.slice(0, 60).map((row) => (
                  <tr key={row.period} className="border-b border-slate-50 last:border-0">
                    <td className="px-3 py-1.5">{row.period}</td>
                    <td className="px-3 py-1.5">{formatKRW(Math.round(row.principal))}</td>
                    <td className="px-3 py-1.5">{formatKRW(Math.round(row.interest))}</td>
                    <td className="px-3 py-1.5">{formatKRW(Math.round(row.payment))}</td>
                    <td className="px-3 py-1.5">{formatKRW(Math.round(row.remainingBalance))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {schedule.length > 60 && (
              <p className="p-2 text-center text-xs text-slate-400">
                {t("repayment.truncatedNote", { total: schedule.length })}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
