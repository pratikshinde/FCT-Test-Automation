import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE } from "@/lib/auth";
import { ApiError, fetchAdminCustomers } from "@/lib/api";
import { Header } from "@/components/Header";
import { CustomersList } from "./CustomersList";
import { ADMIN_OFFICIAL_EMAIL } from "@/lib/constants";

export default async function CustomersPage() {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!token) redirect("/login");

  let customers = [];
  try {
    customers = await fetchAdminCustomers(token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      redirect("/login");
    }
    throw err;
  }

  const userEmail = (await cookies()).get("fct_admin_email")?.value ?? ADMIN_OFFICIAL_EMAIL;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <Header userEmail={userEmail} />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <CustomersList initialCustomers={customers} />
      </main>
    </div>
  );
}
