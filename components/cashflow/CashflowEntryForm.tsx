"use client";

import { useState } from "react";
import { CASHFLOW_TYPES, cashflowTypeLabelT } from "@/lib/categories";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export interface CashflowEntryFormValues {
  type: string;
  category: string;
  amount: string;
  memo: string;
}

const EMPTY_VALUES: CashflowEntryFormValues = {
  type: "INCOME",
  category: "",
  amount: "",
  memo: "",
};

export function CashflowEntryForm({
  initialValues,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initialValues?: CashflowEntryFormValues;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (values: CashflowEntryFormValues) => Promise<string | null>;
}) {
  const { t } = useLocale();
  const [values, setValues] = useState<CashflowEntryFormValues>(initialValues ?? EMPTY_VALUES);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof CashflowEntryFormValues>(
    key: K,
    value: CashflowEntryFormValues[K]
  ) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await onSubmit(values);
    setLoading(false);
    if (result) setError(result);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("cashflow.formType")}</label>
        <select
          value={values.type}
          onChange={(e) => update("type", e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {CASHFLOW_TYPES.map((c) => (
            <option key={c.value} value={c.value}>
              {cashflowTypeLabelT(t, c.value)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("cashflow.formCategory")}</label>
        <input
          required
          value={values.category}
          onChange={(e) => update("category", e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder={t("cashflow.formCategoryPlaceholder")}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("cashflow.formAmount")}</label>
        <input
          required
          type="number"
          min={0}
          value={values.amount}
          onChange={(e) => update("amount", e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("cashflow.formMemo")}</label>
        <input
          value={values.memo}
          onChange={(e) => update("memo", e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      {error && <p className="text-sm text-red-600 sm:col-span-2 lg:col-span-4">{error}</p>}

      <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? t("common.saving") : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
