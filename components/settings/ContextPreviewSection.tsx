"use client";

import { useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export function ContextPreviewSection() {
  const { t } = useLocale();
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadPreview() {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/context-preview");
      const data = await res.json();
      setPreview(JSON.stringify(data, null, 2));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={loadPreview}
        disabled={loading}
        className="w-fit rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
      >
        {loading ? t("common.loading") : preview ? t("settings.previewRefresh") : t("settings.previewButton")}
      </button>
      {preview && (
        <pre className="max-h-72 overflow-auto rounded-md bg-[#0f172a] p-3 text-xs text-[#e2e8f0]">
          {preview}
        </pre>
      )}
    </div>
  );
}
