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

    if (!/\.(csv|xlsx)$/i.test(file.name)) {
      setMessage(t("common.uploadFileTypeHelp"));
      e.target.value = "";
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(endpoint, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        // 파서·라이브러리의 내부 영문 오류를 사용자 화면에 노출하지 않습니다.
        setMessage(t("common.uploadFailedHelp"));
        return;
      }
      const failedCount = data.failed?.length ?? 0;
      setMessage(
        t("common.importCreatedCount", { count: data.created }) +
          (failedCount > 0
            ? t("common.importFailedCount", { count: failedCount })
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
    <div className="flex min-w-0 max-w-full flex-col gap-1">
      <label className="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
        {loading ? t("common.uploading") : t("common.csvExcelUpload")}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx"
          onChange={handleFileChange}
          disabled={loading}
          className="hidden"
        />
      </label>
      {message && <p className="max-w-full break-words text-xs leading-5 text-slate-500">{message}</p>}
    </div>
  );
}
