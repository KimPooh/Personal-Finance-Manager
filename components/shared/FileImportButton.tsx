"use client";

import { useRef, useState } from "react";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export function FileImportButton({
  endpoint,
  onImported,
}: {
  endpoint: string;
  onImported: () => void;
}) {
  const { t } = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(endpoint, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? t("common.uploadFailed"));
        return;
      }
      const failedCount = data.failed?.length ?? 0;
      setMessage(
        t("common.importCreatedCount", { count: data.created }) +
          (failedCount > 0
            ? t("common.importFailedCount", { count: failedCount, error: data.failed[0].error })
            : "")
      );
      onImported();
    } catch {
      setMessage(t("common.networkError"));
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
        {loading ? t("common.uploading") : t("common.csvExcelUpload")}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleFileChange}
          disabled={loading}
          className="hidden"
        />
      </label>
      {message && <p className="text-xs text-slate-500">{message}</p>}
    </div>
  );
}
