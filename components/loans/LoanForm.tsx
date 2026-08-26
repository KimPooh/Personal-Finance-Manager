"use client";

import { useState } from "react";
import {
  LOAN_CATEGORIES,
  RATE_TYPES,
  REPAYMENT_METHODS,
  loanCategoryLabelT,
  rateTypeLabelT,
  repaymentMethodLabelT,
} from "@/lib/categories";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { InstitutionInput } from "@/components/shared/InstitutionInput";

export interface LoanFormValues {
  category: string;
  institution: string;
  principal: string;
  balance: string;
  interestRate: string;
  rateType: string;
  repaymentMethod: string;
  monthlyPayment: string;
  startDate: string;
  maturityDate: string;
  rateChangeDate: string;
  memo: string;
}

const EMPTY_VALUES: LoanFormValues = {
  category: "CREDIT",
  institution: "",
  principal: "",
  balance: "",
  interestRate: "",
  rateType: "FIXED",
  repaymentMethod: "EQUAL_PRINCIPAL_INTEREST",
  monthlyPayment: "",
  startDate: "",
  maturityDate: "",
  rateChangeDate: "",
  memo: "",
};

export function LoanForm({
  initialValues,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initialValues?: LoanFormValues;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (values: LoanFormValues) => Promise<string | null>;
}) {
  const { t } = useLocale();
  const [values, setValues] = useState<LoanFormValues>(initialValues ?? EMPTY_VALUES);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof LoanFormValues>(key: K, value: LoanFormValues[K]) {
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
      className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("loans.formCategory")}</label>
        <select
          value={values.category}
          onChange={(e) => update("category", e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {LOAN_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {loanCategoryLabelT(t, c.value)}
            </option>
          ))}
        </select>
        <p className="text-xs leading-5 text-slate-500">{t("loans.helpCategory")}</p>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("loans.formInstitution")}</label>
        <InstitutionInput
          id="loan-institution"
          value={values.institution}
          onChange={(value) => update("institution", value)}
          placeholder={t("loans.institutionPlaceholder")}
        />
        <p className="text-xs leading-5 text-slate-500">{t("loans.helpInstitution")}</p>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("loans.formPrincipal")}</label>
        <input
          required
          type="number"
          min={0}
          value={values.principal}
          onChange={(e) => update("principal", e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="text-xs leading-5 text-slate-500">{t("loans.helpPrincipal")}</p>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("loans.formBalance")}</label>
        <input
          required
          type="number"
          min={0}
          value={values.balance}
          onChange={(e) => update("balance", e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="text-xs leading-5 text-slate-500">{t("loans.helpBalance")}</p>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("loans.formInterestRate")}</label>
        <input
          required
          type="number"
          min={0}
          max={100}
          step="0.01"
          value={values.interestRate}
          onChange={(e) => update("interestRate", e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="text-xs leading-5 text-slate-500">{t("loans.helpInterestRate")}</p>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("loans.formRateType")}</label>
        <select
          value={values.rateType}
          onChange={(e) => update("rateType", e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {RATE_TYPES.map((c) => (
            <option key={c.value} value={c.value}>
              {rateTypeLabelT(t, c.value)}
            </option>
          ))}
        </select>
        <p className="text-xs leading-5 text-slate-500">{t("loans.helpRateType")}</p>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("loans.formRepaymentMethod")}</label>
        <select
          value={values.repaymentMethod}
          onChange={(e) => update("repaymentMethod", e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {REPAYMENT_METHODS.map((c) => (
            <option key={c.value} value={c.value}>
              {repaymentMethodLabelT(t, c.value)}
            </option>
          ))}
        </select>
        <p className="mt-0.5 rounded bg-accent/10 px-2 py-1 text-xs text-slate-600">
          💡 {t(`loans.repaymentHint${values.repaymentMethod}`)}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("loans.formMonthlyPayment")}</label>
        <input
          type="number"
          min={0}
          value={values.monthlyPayment}
          onChange={(e) => update("monthlyPayment", e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="text-xs leading-5 text-slate-500">{t("loans.helpMonthlyPayment")}</p>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("loans.formStartDate")}</label>
        <input
          required
          type="date"
          value={values.startDate}
          onChange={(e) => update("startDate", e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="text-xs leading-5 text-slate-500">{t("loans.helpStartDate")}</p>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("loans.formMaturityDate")}</label>
        <input
          required
          type="date"
          value={values.maturityDate}
          onChange={(e) => update("maturityDate", e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="text-xs leading-5 text-slate-500">{t("loans.helpMaturityDate")}</p>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("loans.formRateChangeDate")}</label>
        <input
          type="date"
          value={values.rateChangeDate}
          onChange={(e) => update("rateChangeDate", e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="text-xs leading-5 text-slate-500">{t("loans.helpRateChangeDate")}</p>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-slate-600">{t("loans.formMemo")}</label>
        <input
          value={values.memo}
          onChange={(e) => update("memo", e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <p className="text-xs leading-5 text-slate-500">{t("loans.helpMemo")}</p>
      </div>

      {error && <p className="text-sm text-red-600 sm:col-span-2 lg:col-span-3">{error}</p>}

      <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
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
