export function StatCard({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "negative";
  hint?: string;
}) {
  const toneTextClass =
    tone === "positive"
      ? "text-emerald-600"
      : tone === "negative"
        ? "text-red-600"
        : "text-slate-900";

  const barClass =
    tone === "positive" ? "bg-emerald-500" : tone === "negative" ? "bg-red-500" : "bg-accent";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 pl-6 shadow-sm">
      <span className={`absolute inset-y-0 left-0 w-1.5 ${barClass}`} aria-hidden />
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${toneTextClass}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
