"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { AUTH_COOKIE } from "@/lib/auth";
import { apiSendCustomerOtp, apiCreateCustomer, apiDeleteCustomer, apiSendCustomerCredentials } from "@/lib/api";

export async function sendCustomerOtpAction(email: string, phone?: string, name?: string) {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!token) throw new Error("Unauthorized. Please sign in again.");
  return apiSendCustomerOtp(token, email, phone, name);
}

export async function createCustomerAction(data: {
  name: string;
  email: string;
  password: string;
  phone?: string;
  otp: string;
  products?: string[];
}) {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!token) throw new Error("Unauthorized. Please sign in again.");
  const res = await apiCreateCustomer(token, data);
  revalidatePath("/overview");
  revalidatePath("/customers");
  return res;
}

export async function sendCustomerCredentialsAction(customerId: string, password?: string) {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!token) throw new Error("Unauthorized. Please sign in again.");
  return apiSendCustomerCredentials(token, customerId, password);
}

export async function deleteCustomerAction(id: string) {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  if (!token) throw new Error("Unauthorized. Please sign in again.");
  const res = await apiDeleteCustomer(token, id);
  revalidatePath("/overview");
  revalidatePath("/customers");
  return res;
}
