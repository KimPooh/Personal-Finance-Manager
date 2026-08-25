"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatKRW, formatYearMonth } from "@/lib/format";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export function NetWorthTrendChart({
  data,
}: {
  data: { yearMonth: string; netWorth: number }[];
}) {
  const { t, locale } = useLocale();

  if (data.length < 2) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-slate-400">
        {t("cashflow.trendEmpty")}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={224}>
      <AreaChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-default)" />
        <XAxis
          dataKey="yearMonth"
          tick={{ fontSize: 12, fill: "var(--color-text-muted)" }}
          axisLine={{ stroke: "var(--color-border-default)" }}
          tickLine={{ stroke: "var(--color-border-default)" }}
          tickFormatter={(v) => formatYearMonth(String(v), locale)}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "var(--color-text-muted)" }}
          axisLine={{ stroke: "var(--color-border-default)" }}
          tickLine={{ stroke: "var(--color-border-default)" }}
          tickFormatter={(v) => `${(Number(v) / 10000).toLocaleString()}${locale === "ko" ? "만" : "0k"}`}
          width={70}
        />
        <Tooltip
          labelFormatter={(label) => formatYearMonth(String(label), locale)}
          formatter={(value) => formatKRW(Number(value))}
          contentStyle={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border-default)",
            borderRadius: 8,
            color: "var(--color-text)",
          }}
          itemStyle={{ color: "var(--color-accent)" }}
          labelStyle={{ color: "var(--color-text-secondary)" }}
        />
        <Area
          type="monotone"
          dataKey="netWorth"
          stroke="var(--color-accent)"
          strokeWidth={2.5}
          fill="url(#netWorthFill)"
          dot={{ r: 4, fill: "var(--color-accent)", strokeWidth: 0 }}
          activeDot={{ r: 6 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
