import { z } from "zod";
import { VerdictSchema } from "./entities.js";

/**
 * Station interface contract — planner.md Section 7.1 (HTTP+WS calls), Section 4.2
 * (state machine) and Section 6.4 (signed result record). Shared by apps/station-sim
 * (implements it) and any future app/station-client (consumes it) so neither side
 * redeclares these shapes.
 */

export const StationStateSchema = z.enum([
  "IDLE",
  "ARMED",
  "LOADING",
  "PROGRAMMING",
  "PROGRAMMED",
  "RUNNING",
  "AWAIT_CONFIRM",
  "SAFING",
  "PASS",
  "FAIL",
  "FIXTURE_FAULT",
]);
export type StationState = z.infer<typeof StationStateSchema>;

export const StationInfoSchema = z.object({
  stationId: z.string(),
  firmwareVersion: z.string(),
  publicKey: z.string(),
  state: StationStateSchema,
});
export type StationInfo = z.infer<typeof StationInfoSchema>;

export const BoardReadingSchema = z.object({
  present: z.boolean(),
  boardUid: z.string().nullable(),
  boardIdOhms: z.number().nullable(),
});
export type BoardReading = z.infer<typeof BoardReadingSchema>;

export const PairRequestSchema = z.object({
  code: z.string().length(6),
});
export type PairRequest = z.infer<typeof PairRequestSchema>;

export const PairResponseSchema = z.object({
  stationToken: z.string(),
});
export type PairResponse = z.infer<typeof PairResponseSchema>;

/**
 * JSON test plan schema with validation per planner.md Section 4.4.1 / TFW-024 / TFW-030.
 * Enforces valid schemaVersion, min < max, unit existence, unique step IDs, and valid skip_to targets.
 */
export const TestPlanStepSchema = z
  .object({
    id: z.string().min(1, "Step ID is required"),
    block: z.string().min(1, "Block is required"),
    unit: z.string().min(1, "Unit is required"),
    min: z.number(),
    max: z.number(),
    ms: z.number().int().positive("Duration ms must be positive"),
    skipTo: z.string().optional(),
  })
  .refine(
    (s) => (s.unit === "bool" ? s.min <= s.max : s.min < s.max),
    { message: "Limit min must be strictly less than max (or equal for boolean checks)" }
  );
export type TestPlanStep = z.infer<typeof TestPlanStepSchema>;

export const TestPlanSchema = z
  .object({
    schemaVersion: z.string().regex(/^1\.\d+$/, "Unsupported schemaVersion; expected 1.x (TFW-024)"),
    planVersion: z.string().min(1, "planVersion is required"),
    variant: z.string().min(1, "variant is required"),
    boardIdOhms: z
      .object({ min: z.number().nonnegative(), max: z.number().positive() })
      .refine((b) => b.min < b.max, { message: "boardIdOhms min must be strictly less than max" }),
    sequence: z.array(TestPlanStepSchema).min(1, "Sequence must contain at least one step"),
  })
  .superRefine((plan, ctx) => {
    // TFW-030: verify step ID uniqueness and skip_to target existence forward in sequence
    const idIndices = new Map<string, number>();

    plan.sequence.forEach((step, idx) => {
      if (idIndices.has(step.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate step ID: ${step.id} (TFW-030)`,
          path: ["sequence", idx, "id"],
        });
      } else {
        idIndices.set(step.id, idx);
      }
    });

    plan.sequence.forEach((step, idx) => {
      if (step.skipTo) {
        const targetIdx = idIndices.get(step.skipTo);
        if (targetIdx === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `skipTo target '${step.skipTo}' does not exist in sequence (TFW-030)`,
            path: ["sequence", idx, "skipTo"],
          });
        } else if (targetIdx <= idx) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `skipTo target '${step.skipTo}' must point to a later step in sequence`,
            path: ["sequence", idx, "skipTo"],
          });
        }
      }
    });
  });
export type TestPlan = z.infer<typeof TestPlanSchema>;

/** Plain-language validator for the User App Run screen (planner Section 4.4.1). */
export function validateTestPlan(
  plan: unknown
): { valid: true; plan: TestPlan } | { valid: false; errors: string[] } {
  const result = TestPlanSchema.safeParse(plan);
  if (!result.success) {
    return {
      valid: false,
      errors: result.error.errors.map(
        (e) => `${e.path.length ? e.path.join(".") + ": " : ""}${e.message}`
      ),
    };
  }
  return { valid: true, plan: result.data };
}

export const StationEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("state"), state: StationStateSchema }),
  z.object({ type: z.literal("board"), board: BoardReadingSchema }),
  z.object({ type: z.literal("uploadProgress"), sessionId: z.string(), percent: z.number().min(0).max(100) }),
  z.object({ type: z.literal("programmingProgress"), sessionId: z.string(), percent: z.number().min(0).max(100) }),
  z.object({ type: z.literal("wiped"), what: z.enum(["program", "plan"]) }),
  z.object({ type: z.literal("stepStart"), sessionId: z.string(), stepId: z.string(), block: z.string() }),
  z.object({
    type: z.literal("stepResult"),
    sessionId: z.string(),
    stepId: z.string(),
    value: z.number(),
    verdict: VerdictSchema,
  }),
  z.object({ type: z.literal("confirmRequest"), sessionId: z.string(), instruction: z.string(), timeoutMs: z.number() }),
  z.object({ type: z.literal("completed"), sessionId: z.string(), verdict: VerdictSchema, recordId: z.string() }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type StationEvent = z.infer<typeof StationEventSchema>;

/** Wire shape of a signed result record — planner Section 6.4, verbatim field names. */
export const StationResultStepSchema = z.object({
  id: z.string(),
  block: z.string(),
  value: z.number(),
  unit: z.string(),
  min: z.number(),
  max: z.number(),
  verdict: VerdictSchema,
  ms: z.number().int().nonnegative(),
  suspects: z.array(z.string()),
});
export type StationResultStep = z.infer<typeof StationResultStepSchema>;

export const StationResultRecordSchema = z.object({
  recordId: z.string(),
  stationId: z.string(),
  seq: z.number().int().nonnegative(),
  boardUid: z.string(),
  serial: z.string(),
  variant: z.string(),
  attemptNo: z.number().int().positive(),
  verdict: VerdictSchema,
  locked: z.boolean(),
  isGolden: z.boolean(),
  startedAt: z.string().datetime(),
  durationMs: z.number().int().nonnegative(),
  operatorId: z.string(),
  planVersion: z.string(),
  planSha256: z.string(),
  programSha256: z.string(),
  steps: z.array(StationResultStepSchema),
  signature: z.string(),
});
export type StationResultRecord = z.infer<typeof StationResultRecordSchema>;
