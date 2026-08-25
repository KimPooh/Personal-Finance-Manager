"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export function DataBackupSection() {
  const router = useRouter();
  const { t } = useLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm(t("settings.importConfirm"))) {
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const res = await fetch("/api/settings/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? t("common.saveFailed"));
        return;
      }
      setMessage(t("settings.importSuccess"));
      router.refresh();
    } catch {
      setMessage(t("settings.importInvalidFile"));
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <a
        href="/api/settings/export"
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover"
      >
        {t("settings.exportButton")}
      </a>
      <label className="cursor-pointer rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
        {loading ? t("common.loading") : t("settings.importButton")}
        <input
          ref={inputRef}
          type="file"
          accept="application/json"
          onChange={handleImportFile}
          disabled={loading}
          className="hidden"
        />
      </label>
      {message && <span className="text-xs text-slate-500">{message}</span>}
    </div>
  );
}
