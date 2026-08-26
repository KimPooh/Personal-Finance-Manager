"use client";

import { useState } from "react";
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
  const editingAsset = editingId ? initialAssets.find((a) => a.id === editingId) : undefined;
  const expandedAsset = expandedId ? initialAssets.find((a) => a.id === expandedId) : undefined;

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
    if (editingId === id) setEditingId(null);
    if (expandedId === id) setExpandedId(null);
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
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <FileImportButton endpoint="/api/assets/import" onImported={() => router.refresh()} />
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="min-h-[44px] whitespace-nowrap rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
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
        <>
          {/* 데스크톱: 표 (sm 이상) — 표시 전용, 편집 폼/이력 패널은 아래에서 단일 인스턴스로 렌더링 */}
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm sm:block">
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
                  <tr
                    key={asset.id}
                    className={`border-b border-slate-100 last:border-0 ${
                      editingId === asset.id || expandedId === asset.id ? "bg-slate-50" : ""
                    }`}
                  >
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
                ))}
              </tbody>
            </table>
          </div>

          {/* 모바일: 카드형 목록 (sm 미만) — 표시 전용 */}
          <div className="flex flex-col gap-3 sm:hidden">
            {initialAssets.map((asset) => (
              <div
                key={asset.id}
                className={`rounded-2xl border bg-white p-4 shadow-sm ${
                  editingId === asset.id || expandedId === asset.id ? "border-accent" : "border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex items-center gap-2 text-xs text-slate-500">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: assetCategoryColor(asset.category) }}
                      aria-hidden
                    />
                    {assetCategoryLabelT(t, asset.category)}
                  </span>
                  <span className="text-base font-semibold text-slate-900">
                    {formatKRW(asset.currentValue)}
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium text-slate-900">{asset.name}</p>
                <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-slate-500">
                  <div>
                    <dt className="text-slate-400">{t("assets.colAcquiredDate")}</dt>
                    <dd>{asset.acquiredDate ? formatDate(asset.acquiredDate, locale) : "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">{t("assets.colInstitution")}</dt>
                    <dd>{asset.institution ?? "-"}</dd>
                  </div>
                </dl>
                {asset.memo && <p className="mt-2 text-xs text-slate-400">{asset.memo}</p>}

                <div className="mt-3 flex justify-end gap-3 border-t border-slate-100 pt-2 text-xs">
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
              </div>
            ))}
          </div>

          {/* 편집 폼: 뷰포트와 무관하게 항목당 단일 인스턴스만 마운트 (sm 경계를 넘어도 리마운트되지 않음) */}
          {editingAsset && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
              <AssetForm
                initialValues={toFormValues(editingAsset)}
                submitLabel={t("common.save")}
                onCancel={() => setEditingId(null)}
                onSubmit={(values) => handleUpdate(editingAsset.id, values)}
              />
            </div>
          )}

          {/* 이력 패널: 선택한 자산당 단일 인스턴스만 마운트 */}
          {expandedAsset && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
              <AssetHistoryPanel assetId={expandedAsset.id} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
