"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CashflowEntryForm,
  type CashflowEntryFormValues,
} from "@/components/cashflow/CashflowEntryForm";
import { NetWorthTrendChart } from "@/components/cashflow/NetWorthTrendChart";
import { StatCard } from "@/components/shared/StatCard";
import { cashflowTypeLabelT } from "@/lib/categories";
import { formatKRW, formatYearMonth, shiftYearMonth } from "@/lib/format";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export interface CashflowEntryItem {
  id: string;
  yearMonth: string;
  type: string;
  category: string;
  amount: number;
  memo: string | null;
}

function toFormValues(item?: CashflowEntryItem): CashflowEntryFormValues | undefined {
  if (!item) return undefined;
  return {
    type: item.type,
    category: item.category,
    amount: String(item.amount),
    memo: item.memo ?? "",
  };
}

export function CashflowManager({
  selectedMonth,
  entries,
  totalMonthlyLoanPayment,
  netWorthTrend,
}: {
  selectedMonth: string;
  entries: CashflowEntryItem[];
  totalMonthlyLoanPayment: number;
  netWorthTrend: { yearMonth: string; netWorth: number }[];
}) {
  const router = useRouter();
  const { t, locale } = useLocale();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const income = entries.filter((e) => e.type === "INCOME").reduce((s, e) => s + e.amount, 0);
  const fixedExpense = entries
    .filter((e) => e.type === "FIXED_EXPENSE")
    .reduce((s, e) => s + e.amount, 0);
  const variableExpense = entries
    .filter((e) => e.type === "VARIABLE_EXPENSE")
    .reduce((s, e) => s + e.amount, 0);
  const surplus = income - fixedExpense - variableExpense;
  const surplusAfterDebt = surplus - totalMonthlyLoanPayment;

  function goToMonth(month: string) {
    router.push(`/cashflow?month=${month}`);
  }

  async function handleCreate(values: CashflowEntryFormValues): Promise<string | null> {
    const res = await fetch("/api/cashflow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        yearMonth: selectedMonth,
        type: values.type,
        category: values.category,
        amount: Number(values.amount),
        memo: values.memo || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) return data.error ?? t("common.saveFailed");
    setShowAddForm(false);
    router.refresh();
    return null;
  }

  async function handleUpdate(
    id: string,
    values: CashflowEntryFormValues
  ): Promise<string | null> {
    const res = await fetch(`/api/cashflow/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        yearMonth: selectedMonth,
        type: values.type,
        category: values.category,
        amount: Number(values.amount),
        memo: values.memo || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) return data.error ?? t("common.saveFailed");
    setEditingId(null);
    router.refresh();
    return null;
  }

  async function handleDelete(id: string) {
    if (!confirm(t("cashflow.confirmDelete"))) return;
    await fetch(`/api/cashflow/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-center gap-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <button
          onClick={() => goToMonth(shiftYearMonth(selectedMonth, -1))}
          className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100"
        >
          {t("cashflow.prevMonth")}
        </button>
        <span className="text-sm font-semibold text-slate-900">
          {formatYearMonth(selectedMonth, locale)}
        </span>
        <button
          onClick={() => goToMonth(shiftYearMonth(selectedMonth, 1))}
          className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100"
        >
          {t("cashflow.nextMonth")}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("cashflow.income")} value={formatKRW(income)} tone="positive" />
        <StatCard
          label={t("cashflow.expenseTotal")}
          value={formatKRW(fixedExpense + variableExpense)}
        />
        <StatCard
          label={t("cashflow.surplus")}
          value={formatKRW(surplus)}
          tone={surplus >= 0 ? "positive" : "negative"}
        />
        <StatCard
          label={t("cashflow.surplusAfterDebt")}
          value={formatKRW(surplusAfterDebt)}
          tone={surplusAfterDebt >= 0 ? "positive" : "negative"}
          hint={t("cashflow.loanPaymentApplied", { amount: formatKRW(totalMonthlyLoanPayment) })}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">{t("cashflow.netWorthTrend")}</h2>
        <NetWorthTrendChart data={netWorthTrend} />
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
        >
          {showAddForm ? t("common.close") : t("cashflow.addEntry")}
        </button>
      </div>

      {showAddForm && (
        <CashflowEntryForm
          submitLabel={t("common.add")}
          onCancel={() => setShowAddForm(false)}
          onSubmit={handleCreate}
        />
      )}

      {entries.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-400">
          <p>{formatYearMonth(selectedMonth, locale) + t("cashflow.emptyMonth")}</p>
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
            >
              {t("cashflow.addEntry")}
            </button>
          )}
        </div>
      ) : (
        <>
          {/* 데스크톱: 표 (sm 이상) */}
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm sm:block">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3">{t("cashflow.colType")}</th>
                  <th className="px-4 py-3">{t("cashflow.colCategory")}</th>
                  <th className="px-4 py-3">{t("cashflow.colAmount")}</th>
                  <th className="px-4 py-3">{t("cashflow.colMemo")}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <Fragment key={entry.id}>
                    <tr className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 text-slate-600">{cashflowTypeLabelT(t, entry.type)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{entry.category}</td>
                      <td className="px-4 py-3">{formatKRW(entry.amount)}</td>
                      <td className="px-4 py-3 text-slate-500">{entry.memo ?? "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2 text-xs">
                          <button
                            onClick={() => setEditingId(editingId === entry.id ? null : entry.id)}
                            className="text-slate-500 hover:text-slate-900"
                          >
                            {t("common.edit")}
                          </button>
                          <button
                            onClick={() => handleDelete(entry.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            {t("common.delete")}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {editingId === entry.id && (
                      <tr>
                        <td colSpan={5} className="bg-slate-50 px-4 py-3">
                          <CashflowEntryForm
                            initialValues={toFormValues(entry)}
                            submitLabel={t("common.save")}
                            onCancel={() => setEditingId(null)}
                            onSubmit={(values) => handleUpdate(entry.id, values)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* 모바일: 카드형 목록 (sm 미만) */}
          <div className="flex flex-col gap-3 sm:hidden">
            {entries.map((entry) => (
              <div key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs text-slate-500">{cashflowTypeLabelT(t, entry.type)}</span>
                  <span className="text-base font-semibold text-slate-900">
                    {formatKRW(entry.amount)}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-slate-900">{entry.category}</p>
                {entry.memo && <p className="mt-1 text-xs text-slate-400">{entry.memo}</p>}

                <div className="mt-3 flex justify-end gap-3 border-t border-slate-100 pt-2 text-xs">
                  <button
                    onClick={() => setEditingId(editingId === entry.id ? null : entry.id)}
                    className="text-slate-500 hover:text-slate-900"
                  >
                    {t("common.edit")}
                  </button>
                  <button
                    onClick={() => handleDelete(entry.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    {t("common.delete")}
                  </button>
                </div>

                {editingId === entry.id && (
                  <div className="mt-3">
                    <CashflowEntryForm
                      initialValues={toFormValues(entry)}
                      submitLabel={t("common.save")}
                      onCancel={() => setEditingId(null)}
                      onSubmit={(values) => handleUpdate(entry.id, values)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
