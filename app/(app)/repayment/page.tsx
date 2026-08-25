import { prisma } from "@/lib/db";
import { decryptOptional } from "@/lib/crypto";
import { RepaymentPlanner } from "@/components/repayment/RepaymentPlanner";
import { getServerT } from "@/lib/i18n/server";

export default async function RepaymentPage() {
  const { t } = await getServerT();
  const loans = await prisma.loan.findMany({ orderBy: { interestRate: "desc" } });

  const items = loans.map((l) => ({
    id: l.id,
    category: l.category,
    institution: decryptOptional(l.institutionEnc),
    balance: l.balance,
    interestRate: l.interestRate,
    repaymentMethod: l.repaymentMethod as "EQUAL_PRINCIPAL_INTEREST" | "EQUAL_PRINCIPAL" | "BULLET",
    maturityDate: l.maturityDate.toISOString().slice(0, 10),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{t("repayment.title")}</h1>
        <p className="text-sm text-slate-500">{t("repayment.subtitle")}</p>
      </div>
      <RepaymentPlanner loans={items} />
    </div>
  );
}
