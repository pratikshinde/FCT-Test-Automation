import { describe, it, expect } from "vitest";
import { StationClient } from "../index.js";
import type { TestPlan, StationEvent } from "@fct/contracts";

const SIM_URL = "http://localhost:4100";

const TEST_PLAN: TestPlan = {
  schemaVersion: "1.0",
  planVersion: "0.1.0",
  variant: "WLC-ECO",
  boardIdOhms: { min: 1000, max: 1500 },
  sequence: [
    { id: "S010", block: "LED_SCAN", unit: "V", min: 1.45, max: 2.0, ms: 30 },
    { id: "S020", block: "FINAL_CHECK", unit: "V", min: 3.0, max: 3.6, ms: 30 },
  ],
};

describe("StationClient integration with station-sim", () => {
  const client = new StationClient({ baseUrl: SIM_URL });

  it("fetches station info (GET /v1/info)", async () => {
    const info = await client.getInfo();
    expect(info.stationId).toBeDefined();
    expect(info.firmwareVersion).toBeDefined();
    expect(info.publicKey.length).toBeGreaterThan(10);
  });

  it("pairs successfully with pairing code (POST /v1/pair)", async () => {
    const debugRes: any = await fetch(`${SIM_URL}/v1/control/state`).then((r) => r.json());
    const token = await client.pair(debugRes.pairingCode);
    expect(token).toBeDefined();
    expect(client.getToken()).toBe(token);
  });

  it("handles board reading and session lifecycle", async () => {
    // 1. Reset board in simulator
    await fetch(`${SIM_URL}/v1/control/board/remove`, { method: "POST" });
    await fetch(`${SIM_URL}/v1/control/board`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boardIdOhms: 1200, variant: "WLC-ECO" }),
    });

    const board = await client.getBoard();
    expect(board.present).toBe(true);
    expect(board.boardUid).toBeDefined();

    // 2. Start session
    const { sessionId } = await client.createSession({ scenario: "all_pass" });
    expect(sessionId).toBeDefined();

    // 3. Subscribe to events
    const receivedEvents: StationEvent[] = [];
    const unsubscribe = client.subscribeEvents((event) => {
      receivedEvents.push(event);
    });

    // 4. Load plan & program
    const planRes = await client.loadPlan(sessionId, TEST_PLAN);
    expect(planRes.ok).toBe(true);

    const programRes = await client.loadProgram(sessionId, "sha256:test1234");
    expect(programRes.ok).toBe(true);
    expect(programRes.state).toBe("PROGRAMMED");

    // 5. Start test
    await client.start(sessionId);

    // 6. Wait for completion
    let attempts = 0;
    while (attempts < 30) {
      await new Promise((r) => setTimeout(r, 200));
      const hasCompleted = receivedEvents.some((e) => e.type === "completed");
      if (hasCompleted) break;
      attempts++;
    }

    unsubscribe();

    expect(receivedEvents.some((e) => e.type === "completed")).toBe(true);

    // 7. Verify result record retrieval
    const records = await client.getRecords();
    expect(records.length).toBeGreaterThan(0);
    const latest = records[records.length - 1];
    expect(latest.verdict).toBe("PASS");
    expect(latest.signature).toMatch(/^ed25519:/);

    // 8. Ack record
    await client.ackRecords([latest.recordId]);
  });
});
