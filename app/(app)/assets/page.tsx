import { prisma } from "@/lib/db";
import { decryptOptional } from "@/lib/crypto";
import { AssetsManager } from "@/components/assets/AssetsManager";
import { getServerT } from "@/lib/i18n/server";

export default async function AssetsPage() {
  const { t } = await getServerT();
  const assets = await prisma.asset.findMany({ orderBy: { createdAt: "desc" } });

  const items = assets.map((a) => ({
    id: a.id,
    category: a.category,
    name: a.name,
    currentValue: a.currentValue,
    acquiredDate: a.acquiredDate ? a.acquiredDate.toISOString().slice(0, 10) : null,
    institution: decryptOptional(a.institutionEnc),
    memo: decryptOptional(a.memoEnc),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{t("assets.title")}</h1>
        <p className="text-sm text-slate-500">{t("assets.subtitle")}</p>
      </div>
      <AssetsManager initialAssets={items} />
    </div>
  );
}
