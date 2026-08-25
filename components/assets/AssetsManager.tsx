"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { AssetForm, type AssetFormValues } from "@/components/assets/AssetForm";
import { FileImportButton } from "@/components/shared/FileImportButton";
import { AssetHistoryPanel } from "@/components/assets/AssetHistoryPanel";
import { assetCategoryLabelT } from "@/lib/categories";
import { assetCategoryColor } from "@/lib/categoryColors";
import { formatKRW, formatDate } from "@/lib/format";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export interface AssetItem {
  id: string;
  category: string;
  name: string;
  currentValue: number;
  acquiredDate: string | null;
  institution: string | null;
  memo: string | null;
}

function toFormValues(item?: AssetItem): AssetFormValues | undefined {
  if (!item) return undefined;
  return {
    category: item.category,
    name: item.name,
    currentValue: String(item.currentValue),
    acquiredDate: item.acquiredDate ?? "",
    institution: item.institution ?? "",
    memo: item.memo ?? "",
  };
}

export function AssetsManager({ initialAssets }: { initialAssets: AssetItem[] }) {
  const router = useRouter();
  const { t, locale } = useLocale();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const total = initialAssets.reduce((sum, a) => sum + a.currentValue, 0);

  async function handleCreate(values: AssetFormValues): Promise<string | null> {
    const res = await fetch("/api/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: values.category,
        name: values.name,
        currentValue: Number(values.currentValue),
        acquiredDate: values.acquiredDate || null,
        institution: values.institution || null,
        memo: values.memo || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) return data.error ?? t("common.saveFailed");
    setShowAddForm(false);
    router.refresh();
    return null;
  }

  async function handleUpdate(id: string, values: AssetFormValues): Promise<string | null> {
    const res = await fetch(`/api/assets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: values.category,
        name: values.name,
        currentValue: Number(values.currentValue),
        acquiredDate: values.acquiredDate || null,
        institution: values.institution || null,
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
    if (!confirm(t("assets.confirmDelete"))) return;
    await fetch(`/api/assets/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 pl-6 shadow-sm">
        <span className="absolute inset-y-0 left-0 w-1.5 bg-accent" aria-hidden />
        <div>
          <p className="text-sm text-slate-500">{t("assets.totalAssets")}</p>
          <p className="text-lg font-semibold text-slate-900">{formatKRW(total)}</p>
        </div>
        <div className="flex gap-2">
          <FileImportButton endpoint="/api/assets/import" onImported={() => router.refresh()} />
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
          >
            {showAddForm ? t("common.close") : t("assets.addAsset")}
          </button>
        </div>
      </div>

      {showAddForm && (
        <AssetForm submitLabel={t("common.add")} onCancel={() => setShowAddForm(false)} onSubmit={handleCreate} />
      )}

      {initialAssets.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-400">
          <p>{t("assets.empty")}</p>
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
            >
              {t("assets.addAsset")}
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">{t("assets.colCategory")}</th>
                <th className="px-4 py-3">{t("assets.colName")}</th>
                <th className="px-4 py-3">{t("assets.colCurrentValue")}</th>
                <th className="px-4 py-3">{t("assets.colAcquiredDate")}</th>
                <th className="px-4 py-3">{t("assets.colInstitution")}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {initialAssets.map((asset) => (
                <Fragment key={asset.id}>
                  <tr className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 text-slate-600">
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: assetCategoryColor(asset.category) }}
                          aria-hidden
                        />
                        {assetCategoryLabelT(t, asset.category)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{asset.name}</td>
                    <td className="px-4 py-3">{formatKRW(asset.currentValue)}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {asset.acquiredDate ? formatDate(asset.acquiredDate, locale) : "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{asset.institution ?? "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2 text-xs">
                        <button
                          onClick={() => setExpandedId(expandedId === asset.id ? null : asset.id)}
                          className="text-slate-500 hover:text-slate-900"
                        >
                          {t("assets.history")}
                        </button>
                        <button
                          onClick={() => setEditingId(editingId === asset.id ? null : asset.id)}
                          className="text-slate-500 hover:text-slate-900"
                        >
                          {t("common.edit")}
                        </button>
                        <button
                          onClick={() => handleDelete(asset.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          {t("common.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editingId === asset.id && (
                    <tr>
                      <td colSpan={6} className="bg-slate-50 px-4 py-3">
                        <AssetForm
                          initialValues={toFormValues(asset)}
                          submitLabel={t("common.save")}
                          onCancel={() => setEditingId(null)}
                          onSubmit={(values) => handleUpdate(asset.id, values)}
                        />
                      </td>
                    </tr>
                  )}
                  {expandedId === asset.id && (
                    <tr>
                      <td colSpan={6} className="bg-slate-50">
                        <AssetHistoryPanel assetId={asset.id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
