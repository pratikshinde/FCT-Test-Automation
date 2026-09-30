import type { TopCustomer } from "@fct/contracts";

export function TopCustomers({ customers }: { customers: TopCustomer[] }) {
  if (customers.length === 0) {
    return <p className="text-sm text-neutral-500 dark:text-neutral-400">No activity in this period.</p>;
  }

  const max = Math.max(...customers.map((c) => c.uniquePcbs));

  return (
    <ul className="space-y-3">
      {customers.map((c) => (
        <li key={c.customerId}>
          <div className="mb-1 flex items-baseline justify-between text-sm">
            <span className="font-medium">{c.name}</span>
            <span className="tabular-nums text-neutral-500 dark:text-neutral-400">{c.uniquePcbs}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-neutral-100 dark:bg-neutral-800">
            <div
              className="h-1.5 rounded-full bg-neutral-900 dark:bg-neutral-100"
              style={{ width: `${max > 0 ? (c.uniquePcbs / max) * 100 : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
