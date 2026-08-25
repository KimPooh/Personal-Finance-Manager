"use client";

import { useState } from "react";
import { ASSET_CATEGORIES, assetCategoryLabelT } from "@/lib/categories";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export interface AssetFormValues {
  category: string;
  name: string;
  currentValue: string;
  acquiredDate: string;
  institution: string;
  memo: string;
}

const EMPTY_VALUES: AssetFormValues = {
  category: "DEPOSIT",
  name: "",
  currentValue: "",
  acquiredDate: "",
  institution: "",
  memo: "",
};

export function AssetForm({
  initialValues,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initialValues?: AssetFormValues;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (values: AssetFormValues) => Promise<string | null>;
}) {
  const { t } = useLocale();
  const [values, setValues] = useState<AssetFormValues>(initialValues ?? EMPTY_VALUES);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof AssetFormValues>(key: K, value: AssetFormValues[K]) {
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
      className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2"
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("assets.formCategory")}</label>
        <select
          value={values.category}
          onChange={(e) => update("category", e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {ASSET_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {assetCategoryLabelT(t, c.value)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("assets.formName")}</label>
        <input
          required
          value={values.name}
          onChange={(e) => update("name", e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder={t("assets.formNamePlaceholder")}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("assets.formCurrentValue")}</label>
        <input
          required
          type="number"
          min={0}
          step="1"
          value={values.currentValue}
          onChange={(e) => update("currentValue", e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("assets.formAcquiredDate")}</label>
        <input
          type="date"
          value={values.acquiredDate}
          onChange={(e) => update("acquiredDate", e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("assets.formInstitution")}</label>
        <input
          value={values.institution}
          onChange={(e) => update("institution", e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("assets.formMemo")}</label>
        <input
          value={values.memo}
          onChange={(e) => update("memo", e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}

      <div className="flex gap-2 sm:col-span-2">
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
