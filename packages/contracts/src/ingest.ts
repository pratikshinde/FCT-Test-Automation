import { z } from "zod";
import { StationResultRecordSchema } from "./station.js";

/**
 * Ingest API schemas — planner.md Section 6.3 & 6.5 (`POST /v1/ingest/runs`).
 */

export const IngestRequestSchema = z.object({
  records: z.array(StationResultRecordSchema).min(1).max(100),
});
export type IngestRequest = z.infer<typeof IngestRequestSchema>;

export const IngestRecordStatusSchema = z.enum(["accepted", "duplicate", "rejected"]);
export type IngestRecordStatus = z.infer<typeof IngestRecordStatusSchema>;

export const IngestResultItemSchema = z.object({
  recordId: z.string(),
  status: IngestRecordStatusSchema,
  reason: z.string().optional(),
});
export type IngestResultItem = z.infer<typeof IngestResultItemSchema>;

export const IngestResponseSchema = z.object({
  results: z.array(IngestResultItemSchema),
});
export type IngestResponse = z.infer<typeof IngestResponseSchema>;
