"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatKRW } from "@/lib/format";
import { assetCategoryColor } from "@/lib/categoryColors";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export function AssetBreakdownChart({
  data,
}: {
  data: { category: string; name: string; value: number }[];
}) {
  const { t } = useLocale();

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-400">
        {t("dashboard.noAssetsChart")}
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={256}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}
            stroke="var(--color-surface)"
            strokeWidth={3}
          >
            {data.map((entry) => (
              <Cell key={entry.category} fill={assetCategoryColor(entry.category)} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => formatKRW(Number(value))}
            contentStyle={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border-default)",
              borderRadius: 8,
              color: "var(--color-text)",
            }}
            itemStyle={{ color: "var(--color-text)" }}
          />
          <Legend wrapperStyle={{ color: "var(--color-text-secondary)", fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-6">
        <p className="text-xs text-slate-400">{t("dashboard.totalAssets")}</p>
        <p className="text-sm font-semibold text-slate-900">{formatKRW(total)}</p>
      </div>
    </div>
  );
}
