import { z } from "zod";

/**
 * GET /v1/admin/overview — planner.md Section 5.1 (Overview page) / 6.5 (endpoint list).
 */

export const AdminOverviewQuerySchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});
export type AdminOverviewQuery = z.infer<typeof AdminOverviewQuerySchema>;

export const DailyUniquePcbsPointSchema = z.object({
  day: z.string().date(),
  uniqueBoards: z.number().int().nonnegative(),
});
export type DailyUniquePcbsPoint = z.infer<typeof DailyUniquePcbsPointSchema>;

export const TopCustomerSchema = z.object({
  customerId: z.string(),
  name: z.string(),
  uniquePcbs: z.number().int().nonnegative(),
});
export type TopCustomer = z.infer<typeof TopCustomerSchema>;

export const PCB_PRICING = {
  SINGLE_WLC: 10, // ₹10 per passed unique PCB (Single Water Level Controller / WLC-ECO)
  DOUBLE_WLC: 15, // ₹15 per passed unique PCB (Double Water Level Controller / WLC-PRO)
} as const;

export const AdminOverviewResponseSchema = z.object({
  uniquePcbsTested: z.number().int().nonnegative(),
  testRuns: z.number().int().nonnegative(),
  activeCustomers: z.number().int().nonnegative(),
  activeStations: z.number().int().nonnegative(),
  /** 0..1 — PASS on attempt 1 / all attempt-1 runs (OPS-082). */
  firstPassYield: z.number().min(0).max(1),
  totalRevenue: z.number().int().nonnegative().default(0),
  dailyUniquePcbs: z.array(DailyUniquePcbsPointSchema),
  topCustomers: z.array(TopCustomerSchema),
});
export type AdminOverviewResponse = z.infer<typeof AdminOverviewResponseSchema>;
