"use client";

import { useEffect, useState } from "react";
import { formatKRW, formatDate } from "@/lib/format";
import { useLocale } from "@/lib/i18n/LocaleProvider";

interface HistoryEntry {
  id: string;
  value: number;
  recordedAt: string;
}

export function AssetHistoryPanel({ assetId }: { assetId: string }) {
  const { t, locale } = useLocale();
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/assets/${assetId}/history`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setHistory(data.history ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  if (history === null) {
    return <p className="px-4 py-2 text-xs text-slate-400">{t("common.loading")}</p>;
  }
  if (history.length === 0) {
    return <p className="px-4 py-2 text-xs text-slate-400">{t("assets.noHistory")}</p>;
  }

  return (
    <ul className="flex flex-col gap-1 px-4 py-2">
      {history.map((h) => (
        <li key={h.id} className="flex justify-between text-xs text-slate-600">
          <span>{formatDate(h.recordedAt, locale)}</span>
          <span className="font-medium text-slate-900">{formatKRW(h.value)}</span>
        </li>
      ))}
    </ul>
  );
}
