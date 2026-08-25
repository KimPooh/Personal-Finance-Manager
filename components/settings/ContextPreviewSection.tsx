"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { formatKRW } from "@/lib/format";

interface FinancialContextPreview {
  asOf: string;
  totalAssets: number;
  totalLoans: number;
  netWorth: number;
  debtRatioPercent: number | null;
  assetsByCategory: { category: string; value: number }[];
  loans: {
    category: string;
    balance: number;
    interestRatePercent: number;
    rateType: string;
    repaymentMethod: string;
    monthlyPayment: number | null;
    maturityInDays: number;
    rateChangeInDays: number | null;
  }[];
  currentMonth: {
    yearMonth: string;
    income: number;
    fixedExpense: number;
    variableExpense: number;
    surplus: number;
    monthlyLoanPayment: number;
    surplusAfterDebt: number;
  };
  netWorthTrend: { yearMonth: string; netWorth: number }[];
  profile: {
    age: number | null;
    region: string | null;
    householdAnnualIncomeManwon: number | null;
    occupation: string | null;
    householdType: string | null;
    maritalStatus: string | null;
    numberOfChildren: number | null;
    homeOwnership: string | null;
  } | null;
}

export function ContextPreviewSection() {
  const { t } = useLocale();
  const [preview, setPreview] = useState<FinancialContextPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  async function loadPreview() {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/context-preview");
      const data = await res.json();
      setPreview(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={loadPreview}
        disabled={loading}
        className="w-fit rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
      >
        {loading ? t("common.loading") : preview ? t("settings.previewRefresh") : t("settings.previewButton")}
      </button>

      {preview && (
        <div className="flex flex-col gap-4 rounded-md border border-slate-200 bg-white p-4 text-sm">
          <p className="text-xs text-slate-400">{t("settings.previewAsOf")}: {preview.asOf}</p>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <dt className="text-xs text-slate-400">{t("dashboard.totalAssets")}</dt>
              <dd className="font-semibold text-slate-900">{formatKRW(preview.totalAssets)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">{t("dashboard.totalLoans")}</dt>
              <dd className="font-semibold text-slate-900">{formatKRW(preview.totalLoans)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">{t("settings.previewNetWorth")}</dt>
              <dd className="font-semibold text-slate-900">{formatKRW(preview.netWorth)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">{t("settings.previewDebtRatio")}</dt>
              <dd className="font-semibold text-slate-900">
                {preview.debtRatioPercent != null ? `${preview.debtRatioPercent}%` : "-"}
              </dd>
            </div>
          </dl>

          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">{t("settings.previewAssetsByCategory")}</p>
            {preview.assetsByCategory.length === 0 ? (
              <p className="text-xs text-slate-400">{t("settings.previewNoAssets")}</p>
            ) : (
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                {preview.assetsByCategory.map((a) => (
                  <li key={a.category}>
                    {a.category} · {formatKRW(a.value)}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">{t("settings.previewLoansTitle")}</p>
            {preview.loans.length === 0 ? (
              <p className="text-xs text-slate-400">{t("settings.previewNoLoans")}</p>
            ) : (
              <ul className="flex flex-col gap-1 text-xs text-slate-600">
                {preview.loans.map((l, i) => (
                  <li key={i}>
                    {l.category} · {formatKRW(l.balance)} · {l.interestRatePercent}% ({l.rateType}) ·{" "}
                    {l.repaymentMethod}
                    {l.monthlyPayment != null && (
                      <> · {t("settings.previewLoanMonthlyPayment")} {formatKRW(l.monthlyPayment)}</>
                    )}
                    {" · "}
                    {t("settings.previewLoanMaturityInDays", { days: l.maturityInDays })}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">{t("settings.previewCashflowTitle")}</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
              <li>
                {t("cashflow.income")} {formatKRW(preview.currentMonth.income)}
              </li>
              <li>
                {t("cashflow.expenseTotal")}{" "}
                {formatKRW(preview.currentMonth.fixedExpense + preview.currentMonth.variableExpense)}
              </li>
              <li>
                {t("cashflow.surplus")} {formatKRW(preview.currentMonth.surplus)}
              </li>
              <li>
                {t("cashflow.surplusAfterDebt")} {formatKRW(preview.currentMonth.surplusAfterDebt)}
              </li>
            </ul>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">{t("cashflow.netWorthTrend")}</p>
            <p className="text-xs text-slate-600">
              {t("settings.previewNetWorthTrendCount", { count: preview.netWorthTrend.length })}
            </p>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">{t("settings.previewProfileTitle")}</p>
            {!preview.profile ? (
              <p className="text-xs text-slate-400">{t("settings.previewNoProfile")}</p>
            ) : (
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                {preview.profile.age != null && <li>{preview.profile.age}</li>}
                {preview.profile.region && <li>{preview.profile.region}</li>}
                {preview.profile.occupation && <li>{preview.profile.occupation}</li>}
                {preview.profile.householdType && <li>{preview.profile.householdType}</li>}
                {preview.profile.maritalStatus && <li>{preview.profile.maritalStatus}</li>}
                {preview.profile.numberOfChildren != null && <li>{preview.profile.numberOfChildren}</li>}
                {preview.profile.homeOwnership && <li>{preview.profile.homeOwnership}</li>}
              </ul>
            )}
          </div>

          <div>
            <button
              onClick={() => setShowRaw((v) => !v)}
              className="text-xs font-medium text-slate-500 hover:text-slate-900"
            >
              {showRaw ? t("settings.previewHideRaw") : t("settings.previewShowRaw")} {showRaw ? "▲" : "▼"}
            </button>
            {showRaw && (
              <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-[#0f172a] p-3 text-xs text-[#e2e8f0]">
                {JSON.stringify(preview, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
