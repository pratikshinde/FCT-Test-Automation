"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginRequestSchema } from "@fct/contracts";
import { apiLogin, ApiError } from "@/lib/api";
import { AUTH_COOKIE, COOKIE_OPTIONS } from "@/lib/auth";

export type LoginState = { error?: string };

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginRequestSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }

  try {
    const { accessToken, user } = await apiLogin(parsed.data);
    if (user.role !== "ADMIN") {
      return { error: "This account cannot access the admin platform." };
    }
    (await cookies()).set(AUTH_COOKIE, accessToken, COOKIE_OPTIONS);
    (await cookies()).set("fct_admin_email", user.email, COOKIE_OPTIONS);
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: "Could not reach the API. Is it running?" };
  }

  redirect("/overview");
}

export async function logout(): Promise<void> {
  (await cookies()).delete(AUTH_COOKIE);
  (await cookies()).delete("fct_admin_email");
  redirect("/login");
}
