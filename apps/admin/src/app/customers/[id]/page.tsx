import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AUTH_COOKIE } from "@/lib/auth";
import { ApiError, fetchAdminCustomerDetail } from "@/lib/api";
import { Header } from "@/components/Header";
import { StatCard } from "@/app/overview/StatCard";
import { DailyChart } from "@/app/overview/DailyChart";
import { CustomerBoardsList } from "./CustomerBoardsList";
import { ADMIN_OFFICIAL_EMAIL } from "@/lib/constants";

export default async function CustomerDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!token) redirect("/login");

  const { id } = await params;

  let data;
  try {
    data = await fetchAdminCustomerDetail(token, id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect("/login");
    }
    redirect("/customers");
  }

  const { customer, summary, dailyUniquePcbs, boards } = data;
  const fpyPercent = (summary.firstPassYield * 100).toFixed(1);
  const passRatePercent = (summary.passRate * 100).toFixed(1);

  // Group boards by product category
  const singleCount = boards.filter((b) => b.productName.includes("Single")).length;
  const doubleCount = boards.filter((b) => b.productName.includes("Double")).length;

  const userEmail = (await cookies()).get("fct_admin_email")?.value ?? ADMIN_OFFICIAL_EMAIL;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <Header userEmail={userEmail} />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 space-y-8">
        {/* Breadcrumb & Navigation Bar */}
        <div>
          <Link
            href="/customers"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-900 transition dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>Back to Customers</span>
          </Link>

          {/* Customer Profile Header */}
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                  {customer.name}
                </h1>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    customer.status === "ACTIVE"
                      ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20 dark:bg-emerald-950/50 dark:text-emerald-400"
                      : "bg-neutral-100 text-neutral-600 ring-1 ring-neutral-500/20 dark:bg-neutral-800 dark:text-neutral-400"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      customer.status === "ACTIVE" ? "bg-emerald-500" : "bg-neutral-400"
                    }`}
                  />
                  {customer.status}
                </span>

                {/* Product Tags */}
                {singleCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 ring-1 ring-sky-600/20 dark:bg-sky-950/60 dark:text-sky-300">
                    💧 Single WLC ({singleCount})
                  </span>
                )}
                {doubleCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 ring-1 ring-indigo-600/20 dark:bg-indigo-950/60 dark:text-indigo-300">
                    🌊 Double WLC ({doubleCount})
                  </span>
                )}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
                <span className="font-mono">{customer.id}</span>
                <span>•</span>
                <span>Customer usage dashboard & PCB test registry</span>
              </div>
            </div>

            {/* Station Badges */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-neutral-500 mr-1">Stations:</span>
              {customer.stations.length > 0 ? (
                customer.stations.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-mono font-medium text-neutral-800 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {s.id}
                  </span>
                ))
              ) : (
                <span className="text-xs text-neutral-400">No stations assigned</span>
              )}
            </div>
          </div>
        </div>

        {/* Customer Usage KPIs (Mirrors Overview Page) */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard
            label="Revenue Generated"
            value={`₹${(summary.totalRevenue ?? 0).toLocaleString()}`}
            subtext="₹10 / passed PCB (PASS only)"
            highlight={true}
          />
          <StatCard
            label="Unique PCBs tested"
            value={summary.uniquePcbsTested.toLocaleString()}
          />
          <StatCard
            label="Total test runs"
            value={summary.totalRuns.toLocaleString()}
          />
          <StatCard
            label="First-pass yield"
            value={`${fpyPercent}%`}
          />
          <StatCard
            label="Overall pass rate"
            value={`${passRatePercent}%`}
          />
          <StatCard
            label="Active stations"
            value={summary.stationsCount.toString()}
          />
        </div>

        {/* Customer Daily Chart & Station Overview */}
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="rounded-2xl border border-neutral-200/90 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Unique PCBs Tested per Day
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Daily production volume for {customer.name}
                </p>
              </div>
            </div>
            <DailyChart data={dailyUniquePcbs} />
          </section>

          {/* Test Performance Breakdown */}
          <section className="rounded-2xl border border-neutral-200/90 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 flex flex-col justify-between">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Testing Performance Summary
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Lifetime test verdicts & yields
              </p>

              <div className="mt-6 space-y-4">
                <div>
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-emerald-700 dark:text-emerald-400">Passed Runs</span>
                    <span className="text-neutral-900 dark:text-neutral-100">{summary.passedRuns} / {summary.totalRuns}</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${Math.min(100, summary.passRate * 100)}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-blue-700 dark:text-blue-400">First-Pass Yield (FPY)</span>
                    <span className="text-neutral-900 dark:text-neutral-100">{fpyPercent}%</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-600"
                      style={{ width: `${Math.min(100, summary.firstPassYield * 100)}%` }}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-neutral-100 bg-neutral-50/70 p-3.5 dark:border-neutral-800 dark:bg-neutral-800/40 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-500 dark:text-neutral-400">Total Unique PCBs:</span>
                    <span className="font-semibold text-neutral-900 dark:text-neutral-100">{boards.length}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-500 dark:text-neutral-400">Single WLC Units:</span>
                    <span className="font-semibold text-sky-600 dark:text-sky-400">{singleCount}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-500 dark:text-neutral-400">Double WLC Units:</span>
                    <span className="font-semibold text-indigo-600 dark:text-indigo-400">{doubleCount}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-neutral-100 dark:border-neutral-800 text-[11px] text-neutral-400">
              Station test sequences signed with Ed25519 hardware keys.
            </div>
          </section>
        </div>

        {/* 4. THE UNIQUE PCBs TESTED TABLE */}
        <CustomerBoardsList boards={boards} />
      </main>
    </div>
  );
}
