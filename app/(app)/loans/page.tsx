import { prisma } from "@/lib/db";
import { decryptOptional } from "@/lib/crypto";
import { LoansManager } from "@/components/loans/LoansManager";
import { getServerT } from "@/lib/i18n/server";

export default async function LoansPage() {
  const { t } = await getServerT();
  const loans = await prisma.loan.findMany({ orderBy: { createdAt: "desc" } });

  const items = loans.map((l) => ({
    id: l.id,
    category: l.category,
    institution: decryptOptional(l.institutionEnc),
    principal: l.principal,
    balance: l.balance,
    interestRate: l.interestRate,
    rateType: l.rateType,
    repaymentMethod: l.repaymentMethod,
    monthlyPayment: l.monthlyPayment,
    startDate: l.startDate.toISOString().slice(0, 10),
    maturityDate: l.maturityDate.toISOString().slice(0, 10),
    rateChangeDate: l.rateChangeDate ? l.rateChangeDate.toISOString().slice(0, 10) : null,
    memo: decryptOptional(l.memoEnc),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{t("loans.title")}</h1>
        <p className="text-sm text-slate-500">{t("loans.subtitle")}</p>
      </div>
      <LoansManager initialLoans={items} />
    </div>
  );
}
