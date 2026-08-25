"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export function DataDeleteSection() {
  const router = useRouter();
  const { t } = useLocale();
  const CONFIRM_TEXT = t("settings.deleteConfirmWord");
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/data", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? t("common.saveFailed"));
        return;
      }
      setMessage(t("settings.deleted"));
      setConfirmText("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-slate-500">
        {t("settings.deleteConfirmLabel", { word: CONFIRM_TEXT })}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          onClick={handleDelete}
          disabled={confirmText !== CONFIRM_TEXT || loading}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
        >
          {loading ? t("settings.deleting") : t("settings.deleteButton")}
        </button>
      </div>
      {message && <p className="text-xs text-slate-500">{message}</p>}
    </div>
  );
}
