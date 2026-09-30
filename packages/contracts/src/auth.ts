import { z } from "zod";

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    role: z.enum(["ADMIN", "CUSTOMER_SUPERVISOR", "OPERATOR"]),
    customerId: z.string().nullable().optional(),
  }),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const MeResponseSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: z.enum(["ADMIN", "CUSTOMER_SUPERVISOR", "OPERATOR"]),
  customerId: z.string().nullable(),
  customer: z
    .object({
      id: z.string(),
      name: z.string(),
      status: z.enum(["ACTIVE", "SUSPENDED"]),
    })
    .nullable(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const BoardAttemptsResponseSchema = z.object({
  uid: z.string(),
  variant: z.string().nullable(),
  attemptCount: z.number().int().nonnegative(),
  lastVerdict: z.enum(["PASS", "FAIL", "FIXTURE_FAULT"]).nullable(),
  retestAllowed: z.boolean(),
});
export type BoardAttemptsResponse = z.infer<typeof BoardAttemptsResponseSchema>;
