import { Platform } from "react-native";
import Constants from "expo-constants";
import { LoginRequestSchema, LoginResponseSchema, MeResponseSchema, type LoginRequest, type LoginResponse, type MeResponse } from "@fct/contracts";

export function getApiUrl(): string {
  // 1. If explicit env variable is provided and not localhost, prioritize it
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1")) {
    return envUrl;
  }

  // 2. Web browser: Use window.location.hostname
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.hostname) {
    const host = window.location.hostname;
    return `http://${host}:4000/v1`;
  }

  // 3. Physical phone / Expo Go: Extract IP of host computer serving the bundle
  const hostUri = Constants.expoConfig?.hostUri ?? (Constants as any).manifest?.debuggerHost;
  if (hostUri) {
    const ip = hostUri.split(":")[0];
    if (ip && ip !== "localhost" && ip !== "127.0.0.1") {
      return `http://${ip}:4000/v1`;
    }
  }

  // 4. Android Emulator alias for host PC localhost
  if (Platform.OS === "android") {
    return "http://10.0.2.2:4000/v1";
  }

  return envUrl || "http://192.168.68.101:4000/v1";
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function login(body: LoginRequest): Promise<LoginResponse> {
  const parsed = LoginRequestSchema.parse(body);
  const baseUrl = getApiUrl();
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed),
  });
  if (!res.ok) throw new ApiError(res.status, "Invalid email or password");
  return LoginResponseSchema.parse(await res.json());
}

export async function getMe(token: string): Promise<MeResponse> {
  const baseUrl = getApiUrl();
  const res = await fetch(`${baseUrl}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError(res.status, "Could not load profile");
  return MeResponseSchema.parse(await res.json());
}

export async function getCustomerDashboard(token: string) {
  const baseUrl = getApiUrl();
  const res = await fetch(`${baseUrl}/me/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError(res.status, "Could not load customer dashboard");
  return res.json();
}

export async function getCustomerRuns(
  token: string,
  query?: { verdict?: string; search?: string; take?: number }
) {
  const baseUrl = getApiUrl();
  const params = new URLSearchParams();
  if (query?.verdict) params.set("verdict", query.verdict);
  if (query?.search) params.set("search", query.search);
  if (query?.take) params.set("take", String(query.take));

  const res = await fetch(`${baseUrl}/me/runs?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError(res.status, "Could not load customer test results");
  return res.json();
}

export async function executeTestRun(
  token: string,
  data: { programFileName?: string; jsonConfig?: any }
) {
  const baseUrl = getApiUrl();
  const res = await fetch(`${baseUrl}/me/execute-test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new ApiError(res.status, "Failed to execute PCB test");
  return res.json();
}
