"use client";

import { useState } from "react";
import { ProfileForm, type ProfileFormValues } from "@/components/policies/ProfileForm";
import { HighlightedText } from "@/components/policies/HighlightedText";
import type { Verdict } from "@/lib/policyMatching";
import { formatDate } from "@/lib/format";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { TFunction } from "@/lib/i18n/t";

export interface PolicyItem {
  slug: string;
  title: string;
  agency: string;
  summary: string;
  eligibilityText: string;
  simpleSummary: string | null;
  benefit: string;
  applicationPeriod: string;
  requiredDocuments: string;
  officialUrl: string;
  sourceName: string;
  verifiedDate: string;
  verdict: Verdict;
  reason: string;
}

const VERDICT_BADGE: Record<Verdict, string> = {
  HIGH: "bg-emerald-100 text-emerald-700",
  CHECK: "bg-amber-100 text-amber-700",
  LOW: "bg-slate-200 text-slate-500",
};

const VERDICT_BORDER: Record<Verdict, string> = {
  HIGH: "border-l-4 border-l-emerald-500",
  CHECK: "border-l-4 border-l-amber-500",
  LOW: "border-l-4 border-l-slate-300",
};

const REASON_BOX_STYLE: Record<Verdict, string> = {
  HIGH: "bg-emerald-50 text-emerald-800",
  CHECK: "bg-amber-50 text-amber-800",
  LOW: "bg-slate-50 text-slate-600",
};

const VERDICT_KEY: Record<Verdict, "verdictHigh" | "verdictCheck" | "verdictLow"> = {
  HIGH: "verdictHigh",
  CHECK: "verdictCheck",
  LOW: "verdictLow",
};

const GROUP_HEADER_STYLE: Record<Verdict, string> = {
  HIGH: "bg-emerald-500 text-white",
  CHECK: "bg-amber-500 text-white",
  LOW: "bg-slate-400 text-white",
};

const GROUP_ICON: Record<Verdict, string> = {
  HIGH: "✅",
  CHECK: "🔍",
  LOW: "▪",
};

const GROUP_TITLE_KEY: Record<Verdict, "groupHighTitle" | "groupCheckTitle" | "groupLowTitle"> = {
  HIGH: "groupHighTitle",
  CHECK: "groupCheckTitle",
  LOW: "groupLowTitle",
};

function PolicyCard({ policy, t, locale }: { policy: PolicyItem; t: TFunction; locale: "ko" | "en" }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${VERDICT_BORDER[policy.verdict]}`}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full flex-wrap items-center justify-between gap-2 p-4 text-left"
      >
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${VERDICT_BADGE[policy.verdict]}`}
            >
              {t(`policies.${VERDICT_KEY[policy.verdict]}`)}
            </span>
            <p className="text-sm font-semibold text-slate-900">{policy.title}</p>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {policy.agency} · {policy.summary}
          </p>
          {policy.simpleSummary && (
            <p className="mt-2 rounded-md bg-accent/10 px-3 py-2 text-xs text-slate-700">
              <span className="mr-1 font-semibold text-accent">
                💡 {t("policies.simpleSummaryLabel")}:
              </span>
              {policy.simpleSummary}
            </p>
          )}
        </div>
        <span className="text-xs text-slate-400">
          {expanded ? `${t("common.collapse")} ▲` : `${t("common.details")} ▼`}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 p-4 text-sm">
          <p className={`mb-3 rounded-md p-3 text-xs font-medium ${REASON_BOX_STYLE[policy.verdict]}`}>
            {policy.reason}
          </p>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                {t("policies.eligibility")}
              </dt>
              <dd className="text-slate-700">
                <HighlightedText text={policy.eligibilityText} />
              </dd>
            </div>
            <div>
              <dt className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
                {t("policies.benefit")}
              </dt>
              <dd className="text-slate-700">
                <HighlightedText text={policy.benefit} />
              </dd>
            </div>
            <div>
              <dt className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
                {t("policies.applicationPeriod")}
              </dt>
              <dd className="text-slate-700">
                <HighlightedText text={policy.applicationPeriod} />
              </dd>
            </div>
            <div>
              <dt className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden />
                {t("policies.requiredDocuments")}
              </dt>
              <dd className="text-slate-700">{policy.requiredDocuments}</dd>
            </div>
          </dl>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-400">
            <span>
              {t("policies.sourceAndDate", {
                source: policy.sourceName,
                date: formatDate(policy.verifiedDate, locale),
              })}
            </span>
            <a
              href={policy.officialUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-slate-900 underline"
            >
              {t("policies.officialLink")}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function PolicyGroup({
  verdict,
  items,
  t,
  locale,
}: {
  verdict: Verdict;
  items: PolicyItem[];
  t: TFunction;
  locale: "ko" | "en";
}) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div
        className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ${GROUP_HEADER_STYLE[verdict]}`}
      >
        <span>{GROUP_ICON[verdict]}</span>
        <span>{t(`policies.${GROUP_TITLE_KEY[verdict]}`)}</span>
        <span className="ml-auto rounded-full bg-white/25 px-2 py-0.5 text-xs">{items.length}</span>
      </div>
      <div className="flex flex-col gap-3">
        {items.map((p) => (
          <PolicyCard key={p.slug} policy={p} t={t} locale={locale} />
        ))}
      </div>
    </div>
  );
}

export function PolicyRecommendations({
  initialProfile,
  policies,
}: {
  initialProfile: ProfileFormValues;
  policies: PolicyItem[];
}) {
  const { t, locale } = useLocale();
  const [showLow, setShowLow] = useState(false);

  const high = policies.filter((p) => p.verdict === "HIGH");
  const check = policies.filter((p) => p.verdict === "CHECK");
  const low = policies.filter((p) => p.verdict === "LOW");

  return (
    <div className="flex flex-col gap-5">
      <ProfileForm initial={initialProfile} />

      <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-700">
        {t("policies.disclaimer")}
      </div>

      <PolicyGroup verdict="HIGH" items={high} t={t} locale={locale} />
      <PolicyGroup verdict="CHECK" items={check} t={t} locale={locale} />

      {low.length > 0 && (
        <div className="flex flex-col gap-3">
          <button
            onClick={() => setShowLow((v) => !v)}
            className="flex items-center gap-2 rounded-xl bg-slate-400 px-4 py-2.5 text-left text-sm font-semibold text-white"
          >
            <span>{GROUP_ICON.LOW}</span>
            <span>
              {showLow ? t("policies.hideLowGroup") : t("policies.showLowGroup", { count: low.length })}
            </span>
          </button>
          {showLow && (
            <div className="flex flex-col gap-3">
              {low.map((p) => (
                <PolicyCard key={p.slug} policy={p} t={t} locale={locale} />
              ))}
            </div>
          )}
        </div>
      )}

      {high.length === 0 && check.length === 0 && low.length === 0 && (
        <p className="text-sm text-slate-400">{t("policies.groupEmpty")}</p>
      )}
    </div>
  );
}
