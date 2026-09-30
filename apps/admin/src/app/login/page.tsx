import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AUTH_COOKIE } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (token) redirect("/overview");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold">FCT Admin</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Sign in to the owner&apos;s portal.
        </p>
      </div>
      <LoginForm />
    </main>
  );
}
