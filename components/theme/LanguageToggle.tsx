"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";

export function LanguageToggle() {
  const { locale, setLocale } = useLocale();

  return (
    <div className="flex overflow-hidden rounded-full border border-slate-300 text-xs font-medium">
      <button
        onClick={() => setLocale("ko")}
        className={`px-2.5 py-1 transition ${
          locale === "ko" ? "bg-accent text-accent-foreground" : "text-slate-500 hover:bg-slate-100"
        }`}
      >
        한글
      </button>
      <button
        onClick={() => setLocale("en")}
        className={`px-2.5 py-1 transition ${
          locale === "en" ? "bg-accent text-accent-foreground" : "text-slate-500 hover:bg-slate-100"
        }`}
      >
        EN
      </button>
    </div>
  );
}
