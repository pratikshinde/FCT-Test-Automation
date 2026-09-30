export function StatCard({
  label,
  value,
  subtext,
  highlight = false,
}: {
  label: string;
  value: string;
  subtext?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 transition-all ${
        highlight
          ? "border-emerald-500/40 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-950/30 shadow-xs"
          : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 shadow-xs"
      }`}
    >
      <p className={`text-xs font-semibold ${highlight ? "text-emerald-800 dark:text-emerald-300" : "text-neutral-500 dark:text-neutral-400"}`}>
        {label}
      </p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${highlight ? "text-emerald-950 dark:text-emerald-100" : "text-neutral-900 dark:text-neutral-100"}`}>
        {value}
      </p>
      {subtext && (
        <p className={`mt-1 text-[11px] ${highlight ? "text-emerald-700 dark:text-emerald-400" : "text-neutral-400 dark:text-neutral-500"}`}>
          {subtext}
        </p>
      )}
    </div>
  );
}
