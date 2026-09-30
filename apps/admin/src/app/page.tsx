import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AUTH_COOKIE } from "@/lib/auth";

export default async function RootPage() {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  redirect(token ? "/overview" : "/login");
}
