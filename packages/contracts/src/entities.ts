import { z } from "zod";

/**
 * Shared entity schemas, mirroring planner.md Section 6.2 (data model).
 * These are the single source of truth for shapes used by the API and any client —
 * never redeclare these fields in an app package.
 */

export const RoleSchema = z.enum(["ADMIN", "CUSTOMER_SUPERVISOR", "OPERATOR"]);
export type Role = z.infer<typeof RoleSchema>;

export const VerdictSchema = z.enum(["PASS", "FAIL", "FIXTURE_FAULT"]);
export type Verdict = z.infer<typeof VerdictSchema>;

export const CustomerSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["ACTIVE", "SUSPENDED"]),
  createdAt: z.string().datetime(),
});
export type Customer = z.infer<typeof CustomerSchema>;

export const UserSchema = z.object({
  id: z.string(),
  customerId: z.string().nullable(),
  email: z.string().email(),
  role: RoleSchema,
});
export type User = z.infer<typeof UserSchema>;

export const StationSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  publicKey: z.string(),
  firmwareVersion: z.string(),
  lastSeen: z.string().datetime().nullable(),
  lastSeq: z.number().int().nonnegative(),
});
export type Station = z.infer<typeof StationSchema>;

export const BoardSchema = z.object({
  uid: z.string(),
  variant: z.string(),
  firstCustomerId: z.string(),
  firstTestedAt: z.string().datetime(),
  lastVerdict: VerdictSchema.nullable(),
  attemptCount: z.number().int().nonnegative(),
});
export type Board = z.infer<typeof BoardSchema>;

export const TestRunSchema = z.object({
  id: z.string(),
  stationId: z.string(),
  seq: z.number().int().nonnegative(),
  customerId: z.string(),
  boardUid: z.string(),
  serial: z.string(),
  variant: z.string(),
  attemptNo: z.number().int().positive(),
  verdict: VerdictSchema,
  locked: z.boolean(),
  startedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
  operatorId: z.string(),
  programSha256: z.string(),
  planSha256: z.string(),
  planVersion: z.string(),
  isGolden: z.boolean(),
});
export type TestRun = z.infer<typeof TestRunSchema>;

export const TestStepSchema = z.object({
  runId: z.string(),
  stepId: z.string(),
  block: z.string(),
  value: z.number(),
  unit: z.string(),
  min: z.number(),
  max: z.number(),
  verdict: VerdictSchema,
  durationMs: z.number().int().nonnegative(),
  suspects: z.array(z.string()),
});
export type TestStep = z.infer<typeof TestStepSchema>;

export const DailyStatsSchema = z.object({
  customerId: z.string(),
  day: z.string().date(),
  runs: z.number().int().nonnegative(),
  uniqueBoards: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  fixtureFaults: z.number().int().nonnegative(),
});
export type DailyStats = z.infer<typeof DailyStatsSchema>;
