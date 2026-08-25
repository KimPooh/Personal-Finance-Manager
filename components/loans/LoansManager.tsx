"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { LoanForm, type LoanFormValues } from "@/components/loans/LoanForm";
import { FileImportButton } from "@/components/shared/FileImportButton";
import { StatCard } from "@/components/shared/StatCard";
import { loanCategoryLabelT, rateTypeLabelT, repaymentMethodLabelT } from "@/lib/categories";
import { loanCategoryColor } from "@/lib/categoryColors";
import { formatKRW, formatDate, daysUntil } from "@/lib/format";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export interface LoanItem {
  id: string;
  category: string;
  institution: string | null;
  principal: number;
  balance: number;
  interestRate: number;
  rateType: string;
  repaymentMethod: string;
  monthlyPayment: number | null;
  startDate: string;
  maturityDate: string;
  rateChangeDate: string | null;
  memo: string | null;
}

function toFormValues(item?: LoanItem): LoanFormValues | undefined {
  if (!item) return undefined;
  return {
    category: item.category,
    institution: item.institution ?? "",
    principal: String(item.principal),
    balance: String(item.balance),
    interestRate: String(item.interestRate),
    rateType: item.rateType,
    repaymentMethod: item.repaymentMethod,
    monthlyPayment: item.monthlyPayment != null ? String(item.monthlyPayment) : "",
    startDate: item.startDate,
    maturityDate: item.maturityDate,
    rateChangeDate: item.rateChangeDate ?? "",
    memo: item.memo ?? "",
  };
}

function toPayload(values: LoanFormValues) {
  return {
    category: values.category,
    institution: values.institution || null,
    principal: Number(values.principal),
    balance: Number(values.balance),
    interestRate: Number(values.interestRate),
    rateType: values.rateType,
    repaymentMethod: values.repaymentMethod,
    monthlyPayment: values.monthlyPayment ? Number(values.monthlyPayment) : null,
    startDate: values.startDate,
    maturityDate: values.maturityDate,
    rateChangeDate: values.rateChangeDate || null,
    memo: values.memo || null,
  };
}

export function LoansManager({ initialLoans }: { initialLoans: LoanItem[] }) {
  const router = useRouter();
  const { t, locale } = useLocale();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const totalBalance = initialLoans.reduce((sum, l) => sum + l.balance, 0);
  const totalMonthlyPayment = initialLoans.reduce((sum, l) => sum + (l.monthlyPayment ?? 0), 0);

  async function handleCreate(values: LoanFormValues): Promise<string | null> {
    const res = await fetch("/api/loans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPayload(values)),
    });
    const data = await res.json();
    if (!res.ok) return data.error ?? t("common.saveFailed");
    setShowAddForm(false);
    router.refresh();
    return null;
  }

  async function handleUpdate(id: string, values: LoanFormValues): Promise<string | null> {
    const res = await fetch(`/api/loans/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toPayload(values)),
    });
    const data = await res.json();
    if (!res.ok) return data.error ?? t("common.saveFailed");
    setEditingId(null);
    router.refresh();
    return null;
  }

  async function handleDelete(id: string) {
    if (!confirm(t("loans.confirmDelete"))) return;
    await fetch(`/api/loans/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label={t("loans.totalBalance")} value={formatKRW(totalBalance)} tone="negative" />
        <StatCard label={t("loans.monthlyPaymentTotal")} value={formatKRW(totalMonthlyPayment)} />
      </div>

      <div className="flex justify-end gap-2">
        <FileImportButton endpoint="/api/loans/import" onImported={() => router.refresh()} />
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
        >
          {showAddForm ? t("common.close") : t("loans.addLoan")}
        </button>
      </div>

      {showAddForm && (
        <LoanForm submitLabel={t("common.add")} onCancel={() => setShowAddForm(false)} onSubmit={handleCreate} />
      )}

      {initialLoans.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-400">
          {t("loans.empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">{t("loans.colCategory")}</th>
                <th className="px-4 py-3">{t("loans.colInstitution")}</th>
                <th className="px-4 py-3">{t("loans.colBalance")}</th>
                <th className="px-4 py-3">{t("loans.colRate")}</th>
                <th className="px-4 py-3">{t("loans.colRepaymentMethod")}</th>
                <th className="px-4 py-3">{t("loans.colMaturityDate")}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {initialLoans.map((loan) => {
                const maturityDays = daysUntil(loan.maturityDate);
                return (
                  <Fragment key={loan.id}>
                    <tr className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 text-slate-600">
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: loanCategoryColor(loan.category) }}
                            aria-hidden
                          />
                          {loanCategoryLabelT(t, loan.category)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{loan.institution ?? "-"}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {formatKRW(loan.balance)}
                      </td>
                      <td className="px-4 py-3">
                        {loan.interestRate.toFixed(2)}% ({rateTypeLabelT(t, loan.rateType)})
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {repaymentMethodLabelT(t, loan.repaymentMethod)}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        <div className="flex items-center gap-2">
                          <span>{formatDate(loan.maturityDate, locale)}</span>
                          {maturityDays >= 0 && maturityDays <= 60 && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                maturityDays <= 7
                                  ? "bg-red-100 text-red-700"
                                  : maturityDays <= 30
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              D-{maturityDays}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2 text-xs">
                          <button
                            onClick={() => setEditingId(editingId === loan.id ? null : loan.id)}
                            className="text-slate-500 hover:text-slate-900"
                          >
                            {t("common.edit")}
                          </button>
                          <button
                            onClick={() => handleDelete(loan.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            {t("common.delete")}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {editingId === loan.id && (
                      <tr>
                        <td colSpan={7} className="bg-slate-50 px-4 py-3">
                          <LoanForm
                            initialValues={toFormValues(loan)}
                            submitLabel={t("common.save")}
                            onCancel={() => setEditingId(null)}
                            onSubmit={(values) => handleUpdate(loan.id, values)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
