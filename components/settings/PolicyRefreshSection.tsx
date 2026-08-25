"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n/LocaleProvider";

interface RefreshResultItem {
  slug: string;
  status: "unchanged" | "updated" | "ended" | "unverified" | string;
  note: string;
}

const STATUS_KEY: Record<string, string> = {
  unchanged: "settings.policyStatusUnchanged",
  updated: "settings.policyStatusUpdated",
  ended: "settings.policyStatusEnded",
  unverified: "settings.policyStatusUnverified",
};

const STATUS_STYLE: Record<string, string> = {
  unchanged: "bg-slate-100 text-slate-600",
  updated: "bg-emerald-100 text-emerald-700",
  ended: "bg-red-100 text-red-700",
  unverified: "bg-amber-100 text-amber-700",
};

export function PolicyRefreshSection({ configured }: { configured: boolean }) {
  const router = useRouter();
  const { t } = useLocale();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<RefreshResultItem[] | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  async function handleCheck() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/policies/refresh", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("common.saveFailed"));
        return;
      }
      setResults(data.results);
      setCheckedAt(data.checkedAt);
      router.refresh();
    } catch {
      setError(t("common.networkError"));
    } finally {
      setLoading(false);
    }
  }

  if (!configured) {
    return <p className="text-xs text-slate-400">{t("settings.policyRefreshNotConfigured")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={handleCheck}
        disabled={loading}
        className="w-fit rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
      >
        {loading ? t("settings.policyRefreshChecking") : t("settings.policyRefreshButton")}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {results && checkedAt && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-slate-500">
            {t("settings.policyRefreshDone", { date: checkedAt })}
          </p>
          <ul className="flex flex-col gap-1.5">
            {results.map((r) => (
              <li key={r.slug} className="flex items-start gap-2 text-xs">
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${
                    STATUS_STYLE[r.status] ?? "bg-slate-100 text-slate-600"
                  }`}
                >
                  {t(STATUS_KEY[r.status] ?? "settings.policyStatusUnverified")}
                </span>
                <span className="text-slate-600">
                  <span className="font-medium text-slate-700">{r.slug}</span> — {r.note}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
