import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE } from "@/lib/auth";
import { ApiError, fetchAdminOverview } from "@/lib/api";
import { Header } from "@/components/Header";
import { StatCard } from "./StatCard";
import { DailyChart } from "./DailyChart";
import { TopCustomers } from "./TopCustomers";
import { OverviewHeader } from "./OverviewHeader";
import { ADMIN_OFFICIAL_EMAIL, PRICE_PER_PASS_SINGLE_WLC } from "@/lib/constants";

export default async function OverviewPage() {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!token) redirect("/login");

  let overview;
  try {
    overview = await fetchAdminOverview(token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect("/login");
    }
    throw err;
  }

  const fpyPercent = (overview.firstPassYield * 100).toFixed(1);
  const userEmail = (await cookies()).get("fct_admin_email")?.value ?? ADMIN_OFFICIAL_EMAIL;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <Header userEmail={userEmail} />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <OverviewHeader />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="Total Revenue"
          value={`₹${(overview.totalRevenue ?? 0).toLocaleString()}`}
          subtext={`₹${PRICE_PER_PASS_SINGLE_WLC} / passed PCB (PASS only)`}
          highlight={true}
        />
        <StatCard label="Unique PCBs tested" value={overview.uniquePcbsTested.toLocaleString()} />
        <StatCard label="Test runs" value={overview.testRuns.toLocaleString()} />
        <StatCard label="Active customers" value={overview.activeCustomers.toLocaleString()} />
        <StatCard label="Active stations" value={overview.activeStations.toLocaleString()} />
        <StatCard label="First-pass yield" value={`${fpyPercent}%`} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            Unique PCBs per day
          </h2>
          <DailyChart data={overview.dailyUniquePcbs} />
        </section>

        <section className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="mb-4 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            Top customers by unique PCBs
          </h2>
          <TopCustomers customers={overview.topCustomers} />
        </section>
      </div>
    </main>
  </div>
  );
}
