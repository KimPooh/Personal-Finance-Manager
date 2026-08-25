"use client";

import { LoanScheduleTable } from "@/components/repayment/LoanScheduleTable";
import { AvalancheSimulator } from "@/components/repayment/AvalancheSimulator";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export interface RepaymentLoanItem {
  id: string;
  category: string;
  institution: string | null;
  balance: number;
  interestRate: number;
  repaymentMethod: "EQUAL_PRINCIPAL_INTEREST" | "EQUAL_PRINCIPAL" | "BULLET";
  maturityDate: string;
}

export function RepaymentPlanner({ loans }: { loans: RepaymentLoanItem[] }) {
  const { t } = useLocale();

  if (loans.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-400">
        {t("repayment.empty")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <AvalancheSimulator loans={loans} />
      <div className="flex flex-col gap-3">
        {loans.map((loan) => (
          <LoanScheduleTable key={loan.id} loan={loan} />
        ))}
      </div>
    </div>
  );
}
