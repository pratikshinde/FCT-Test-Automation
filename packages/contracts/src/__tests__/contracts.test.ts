import { describe, it, expect } from "vitest";
import {
  validateTestPlan,
  TestPlanSchema,
  StationStateSchema,
  StationResultRecordSchema,
  RoleSchema,
  VerdictSchema,
} from "../index.js";

describe("Contracts: TestPlan validation (TFW-024, TFW-030)", () => {
  const validPlan = {
    schemaVersion: "1.0",
    planVersion: "0.1.0",
    variant: "WLC-ECO",
    boardIdOhms: { min: 1000, max: 1500 },
    sequence: [
      { id: "S010", block: "LED_SCAN", unit: "V", min: 1.45, max: 2.0, ms: 60 },
      { id: "S020", block: "RELAY_TEST", unit: "ohm", min: 0, max: 0.5, ms: 60, skipTo: "S040" },
      { id: "S030", block: "CONFIRM", unit: "bool", min: 1, max: 1, ms: 10 },
      { id: "S040", block: "FINAL_CHECK", unit: "V", min: 3.0, max: 3.6, ms: 60 },
    ],
  };

  it("accepts a fully compliant test plan", () => {
    const result = validateTestPlan(validPlan);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.plan.variant).toBe("WLC-ECO");
      expect(result.plan.sequence.length).toBe(4);
    }
  });

  it("rejects unsupported schemaVersion (TFW-024)", () => {
    const invalid = { ...validPlan, schemaVersion: "2.0" };
    const result = validateTestPlan(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("schemaVersion"))).toBe(true);
    }
  });

  it("rejects step where min >= max for non-boolean checks", () => {
    const invalid = {
      ...validPlan,
      sequence: [
        { id: "S010", block: "BAD_LIMIT", unit: "V", min: 2.5, max: 2.0, ms: 50 },
      ],
    };
    const result = validateTestPlan(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("min must be strictly less than max"))).toBe(true);
    }
  });

  it("accepts step with min == max for boolean unit", () => {
    const boolStep = {
      ...validPlan,
      sequence: [
        { id: "S030", block: "CONFIRM", unit: "bool", min: 1, max: 1, ms: 10 },
      ],
    };
    const result = validateTestPlan(boolStep);
    expect(result.valid).toBe(true);
  });

  it("rejects invalid boardIdOhms window", () => {
    const invalid = {
      ...validPlan,
      boardIdOhms: { min: 2000, max: 1000 },
    };
    const result = validateTestPlan(invalid);
    expect(result.valid).toBe(false);
  });

  it("rejects duplicate step IDs (TFW-030)", () => {
    const invalid = {
      ...validPlan,
      sequence: [
        { id: "S010", block: "LED_SCAN", unit: "V", min: 1.45, max: 2.0, ms: 60 },
        { id: "S010", block: "ANOTHER", unit: "V", min: 1.0, max: 2.0, ms: 60 },
      ],
    };
    const result = validateTestPlan(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("Duplicate step ID"))).toBe(true);
    }
  });

  it("rejects skipTo targeting a non-existent step (TFW-030)", () => {
    const invalid = {
      ...validPlan,
      sequence: [
        { id: "S010", block: "TEST", unit: "V", min: 1, max: 2, ms: 50, skipTo: "DOES_NOT_EXIST" },
      ],
    };
    const result = validateTestPlan(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("does not exist in sequence"))).toBe(true);
    }
  });

  it("rejects skipTo targeting an earlier step in sequence (cycles prohibited)", () => {
    const invalid = {
      ...validPlan,
      sequence: [
        { id: "S010", block: "TEST1", unit: "V", min: 1, max: 2, ms: 50 },
        { id: "S020", block: "TEST2", unit: "V", min: 1, max: 2, ms: 50, skipTo: "S010" },
      ],
    };
    const result = validateTestPlan(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.includes("point to a later step"))).toBe(true);
    }
  });
});

describe("Contracts: Station states and result records", () => {
  it("validates all defined station states per planner 4.2", () => {
    const expectedStates = [
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
    ];
    for (const state of expectedStates) {
      expect(StationStateSchema.parse(state)).toBe(state);
    }
  });

  it("validates StationResultRecord wire shape per planner 6.4", () => {
    const record = {
      recordId: "550e8400-e29b-41d4-a716-446655440000",
      stationId: "FCT-0007",
      seq: 1042,
      boardUid: "4D53513100A1B2C3D4E5F601",
      serial: "WLC24090001",
      variant: "WLC-ECO",
      attemptNo: 1,
      verdict: "PASS",
      locked: true,
      isGolden: false,
      startedAt: "2026-09-23T10:41:07.000Z",
      durationMs: 71240,
      operatorId: "OP-12",
      planVersion: "0.1.0",
      planSha256: "sha256:abcd",
      programSha256: "sha256:1234",
      steps: [
        {
          id: "S010",
          block: "LED_SCAN",
          value: 1.72,
          unit: "V",
          min: 1.45,
          max: 2.0,
          verdict: "PASS",
          ms: 40,
          suspects: [],
        },
      ],
      signature: "ed25519:abcdef",
    };
    expect(StationResultRecordSchema.parse(record)).toEqual(record);
  });

  it("validates roles and verdicts", () => {
    expect(RoleSchema.parse("ADMIN")).toBe("ADMIN");
    expect(RoleSchema.parse("CUSTOMER_SUPERVISOR")).toBe("CUSTOMER_SUPERVISOR");
    expect(RoleSchema.parse("OPERATOR")).toBe("OPERATOR");
    expect(VerdictSchema.parse("PASS")).toBe("PASS");
    expect(VerdictSchema.parse("FAIL")).toBe("FAIL");
    expect(VerdictSchema.parse("FIXTURE_FAULT")).toBe("FIXTURE_FAULT");
  });
});
