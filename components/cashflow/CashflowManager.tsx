"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CashflowEntryForm,
  type CashflowEntryFormValues,
} from "@/components/cashflow/CashflowEntryForm";
import { CsvImportPanel } from "@/components/cashflow/CsvImportPanel";
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
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [copyMessageMonth, setCopyMessageMonth] = useState(selectedMonth);

  // 다른 달로 이동하면 이전 달의 복사 결과 문구를 지운다 (렌더 중 상태 조정, 이펙트 사용 안 함).
  // 지연된 복사 응답이 나중에 도착해도 setCopyResult가 기록한 달과 selectedMonth가 다르면 여기서 다시 걸러진다.
  if (copyMessageMonth !== selectedMonth) {
    setCopyMessageMonth(selectedMonth);
    setCopyMessage(null);
  }

  const income = entries.filter((e) => e.type === "INCOME").reduce((s, e) => s + e.amount, 0);
  const fixedExpense = entries
    .filter((e) => e.type === "FIXED_EXPENSE")
    .reduce((s, e) => s + e.amount, 0);
  const variableExpense = entries
    .filter((e) => e.type === "VARIABLE_EXPENSE")
    .reduce((s, e) => s + e.amount, 0);
  const surplus = income - fixedExpense - variableExpense;
  const surplusAfterDebt = surplus - totalMonthlyLoanPayment;
  const editingEntry = editingId ? entries.find((e) => e.id === editingId) : undefined;

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
    if (editingId === id) setEditingId(null);
    router.refresh();
  }

  // 복사 결과 문구를 "어느 달의 요청에서 나온 결과인지"와 함께 기록한다.
  // 응답이 도착했을 때 이미 다른 달로 이동한 상태라면, 위의 렌더 중 상태 조정 로직이 즉시 지운다.
  function setCopyResult(month: string, message: string | null) {
    setCopyMessageMonth(month);
    setCopyMessage(message);
  }

  async function handleCopyPrevious() {
    const requestMonth = selectedMonth;
    const sourceMonth = shiftYearMonth(requestMonth, -1);
    const sourceLabel = formatYearMonth(sourceMonth, locale);
    const targetLabel = formatYearMonth(requestMonth, locale);
    const confirmed = confirm(
      t("cashflow.copyConfirmMessage", { sourceMonth: sourceLabel, targetMonth: targetLabel })
    );
    if (!confirmed) return;

    setCopying(true);
    setCopyResult(requestMonth, null);
    try {
      const res = await fetch("/api/cashflow/copy-previous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetMonth: requestMonth }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCopyResult(requestMonth, data.error ?? t("cashflow.copyFailed"));
        return;
      }
      if (data.sourceCount === 0) {
        setCopyResult(requestMonth, t("cashflow.previousMonthEmpty", { sourceMonth: sourceLabel }));
        return;
      }
      setCopyResult(
        requestMonth,
        [
          t("cashflow.copyCompleted"),
          t("cashflow.copiedCountLabel", { count: data.copiedCount }),
          t("cashflow.skippedCountLabel", { count: data.skippedCount }),
        ].join(" · ")
      );
      router.refresh();
    } catch {
      setCopyResult(requestMonth, t("cashflow.copyFailed"));
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-center gap-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <button
          onClick={() => goToMonth(shiftYearMonth(selectedMonth, -1))}
          disabled={copying}
          className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
        >
          {t("cashflow.prevMonth")}
        </button>
        <span className="text-sm font-semibold text-slate-900">
          {formatYearMonth(selectedMonth, locale)}
        </span>
        <button
          onClick={() => goToMonth(shiftYearMonth(selectedMonth, 1))}
          disabled={copying}
          className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
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

      <div className="flex flex-col items-end gap-1">
        <div className="flex flex-wrap justify-end gap-2">
          <button
            onClick={handleCopyPrevious}
            disabled={copying}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {copying ? t("cashflow.copyInProgress") : t("cashflow.copyPreviousButton")}
          </button>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
          >
            {showAddForm ? t("common.close") : t("cashflow.addEntry")}
          </button>
          <button
            onClick={() => setShowCsvImport((v) => !v)}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            {showCsvImport ? t("common.close") : t("cashflow.csvImportButton")}
          </button>
        </div>
        {copyMessage && <p className="text-xs text-slate-500">{copyMessage}</p>}
      </div>

      {showAddForm && (
        <CashflowEntryForm
          submitLabel={t("common.add")}
          onCancel={() => setShowAddForm(false)}
          onSubmit={handleCreate}
        />
      )}

      {showCsvImport && (
        <CsvImportPanel
          onCancel={() => setShowCsvImport(false)}
          onImported={() => router.refresh()}
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
          {/* 데스크톱: 표 (sm 이상) — 표시 전용, 편집 폼은 아래에서 단일 인스턴스로 렌더링 */}
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
                  <tr
                    key={entry.id}
                    className={`border-b border-slate-100 last:border-0 ${
                      editingId === entry.id ? "bg-slate-50" : ""
                    }`}
                  >
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
                ))}
              </tbody>
            </table>
          </div>

          {/* 모바일: 카드형 목록 (sm 미만) — 표시 전용 */}
          <div className="flex flex-col gap-3 sm:hidden">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className={`rounded-2xl border bg-white p-4 shadow-sm ${
                  editingId === entry.id ? "border-accent" : "border-slate-200"
                }`}
              >
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
              </div>
            ))}
          </div>

          {/* 편집 폼: 뷰포트와 무관하게 항목당 단일 인스턴스만 마운트 (sm 경계를 넘어도 리마운트되지 않음) */}
          {editingEntry && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
              <CashflowEntryForm
                initialValues={toFormValues(editingEntry)}
                submitLabel={t("common.save")}
                onCancel={() => setEditingId(null)}
                onSubmit={(values) => handleUpdate(editingEntry.id, values)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
