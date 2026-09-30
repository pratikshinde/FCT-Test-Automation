import type { AdminOverviewQuery, AdminOverviewResponse, LoginRequest, LoginResponse } from "@fct/contracts";

const API_URL = process.env.API_URL ?? "http://localhost:4000/v1";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function apiLogin(body: LoginRequest): Promise<LoginResponse> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new ApiError(res.status, "Invalid email or password");
  }
  return res.json();
}

export async function fetchAdminOverview(
  token: string,
  query: AdminOverviewQuery = {},
): Promise<AdminOverviewResponse> {
  const params = new URLSearchParams();
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);

  const res = await fetch(`${API_URL}/admin/overview?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new ApiError(res.status, "Failed to load overview");
  }
  return res.json();
}

export interface AdminCustomer {
  id: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: string;
  stationCount: number;
  uniquePcbsTested: number;
  runs: number;
  passRate: number;
  firstPassYield: number;
  lastActivity: string | null;
  products?: string[];
  variants?: string[];
  revenue?: number;
}

export async function fetchAdminCustomers(
  token: string,
  query: { from?: string; to?: string } = {},
): Promise<AdminCustomer[]> {
  const params = new URLSearchParams();
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);

  const res = await fetch(`${API_URL}/admin/customers?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new ApiError(res.status, "Failed to load customers");
  }
  return res.json();
}

export interface TestedBoard {
  uid: string;
  variant: string;
  productName: string;
  lastVerdict: "PASS" | "FAIL" | "FIXTURE_FAULT";
  attemptCount: number;
  locked: boolean;
  durationMs: number | null;
  stationId: string;
  firstTestedAt: string;
  lastTestedAt: string;
}

export interface CustomerDetailResponse {
  customer: {
    id: string;
    name: string;
    status: "ACTIVE" | "SUSPENDED";
    createdAt: string;
    stations: Array<{
      id: string;
      firmwareVersion: string;
      lastSeen: string | null;
      lastSeq: number;
    }>;
    users: Array<{
      id: string;
      email: string;
      role: string;
      createdAt: string;
    }>;
  };
  summary: {
    uniquePcbsTested: number;
    totalRuns: number;
    passedRuns: number;
    passRate: number;
    firstPassYield: number;
    stationsCount: number;
    totalRevenue?: number;
  };
  dailyUniquePcbs: Array<{
    day: string;
    uniqueBoards: number;
  }>;
  boards: TestedBoard[];
  failurePareto: Array<{
    step_id: string;
    block: string;
    failure_count: number;
  }>;
  recentRuns: any[];
}

export async function fetchAdminCustomerDetail(
  token: string,
  customerId: string,
  query: { from?: string; to?: string } = {},
): Promise<CustomerDetailResponse> {
  const params = new URLSearchParams();
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);

  const res = await fetch(`${API_URL}/admin/customers/${customerId}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new ApiError(res.status, "Failed to load customer details");
  }
  return res.json();
}

export async function apiSendCustomerOtp(
  token: string,
  email: string,
  phone?: string,
  name?: string,
): Promise<{
  ok: boolean;
  message: string;
  email: string;
  phone?: string;
  devOtp?: string;
  emailDelivered?: boolean;
  smsDelivered?: boolean;
  gatewayNotice?: string;
}> {
  const res = await fetch(`${API_URL}/admin/customers/send-otp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ email, phone, name }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.message || "Failed to send OTP");
  }
  return res.json();
}

export async function apiCreateCustomer(
  token: string,
  data: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    otp: string;
    products?: string[];
  },
): Promise<{
  ok: boolean;
  customer: any;
  user: any;
  emailCredentialsSent?: boolean;
  credentialsNotice?: string;
}> {
  const res = await fetch(`${API_URL}/admin/customers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const dataRes = await res.json().catch(() => ({}));
    throw new ApiError(res.status, dataRes.message || "Failed to create customer");
  }
  return res.json();
}

export async function apiSendCustomerCredentials(
  token: string,
  customerId: string,
  password?: string,
): Promise<{ ok: boolean; message: string; gatewayNotice?: string }> {
  const res = await fetch(`${API_URL}/admin/customers/${customerId}/send-credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.message || "Failed to send credentials");
  }
  return res.json();
}

export async function apiDeleteCustomer(
  token: string,
  id: string,
): Promise<{ ok: boolean; id: string }> {
  const res = await fetch(`${API_URL}/admin/customers/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const dataRes = await res.json().catch(() => ({}));
    throw new ApiError(res.status, dataRes.message || "Failed to delete customer");
  }
  return res.json();
}

