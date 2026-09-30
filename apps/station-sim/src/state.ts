import { randomUUID, createHash } from "node:crypto";
import type { BoardReading, StationInfo, StationResultRecord, StationResultStep, StationState, TestPlan, Verdict } from "@fct/contracts";
import { EventBus } from "./events";
import { StationSigner } from "./signing";
import { SeqStore } from "./seq-store";
import { type Scenario, SCENARIO_TARGET_BLOCK } from "./scenarios";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // planner 7.2.4
const MAX_ATTEMPTS = 3; // original + 2 retests, OPS-080

interface BoardSlot {
  present: boolean;
  boardUid: string | null;
  boardIdOhms: number | null;
  variant: string | null;
}

interface Session {
  id: string;
  boardUid: string;
  attemptNo: number;
  scenario: Scenario;
  confirmTimeoutMs: number;
  plan: TestPlan | null;
  programSha256: string | null;
  startedAt: Date;
  pendingConfirm: { resolve: () => void } | null;
  aborted: boolean;
}

export class StationSim {
  readonly stationId: string;
  readonly firmwareVersion = "0.1.0-sim";
  readonly signer = new StationSigner();
  readonly bus = new EventBus();
  readonly pairingCode: string;

  private state: StationState = "IDLE";
  private board: BoardSlot = { present: false, boardUid: null, boardIdOhms: null, variant: null };
  private tokens = new Set<string>();
  private session: Session | null = null;
  private attemptCounts = new Map<string, number>();
  private failNeedsAck = false;
  private seqStore = new SeqStore();
  private records: StationResultRecord[] = [];
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(stationId: string) {
    this.stationId = stationId;
    this.pairingCode = String(Math.floor(100000 + Math.random() * 900000));
  }

  // ---- read-only ----

  info(): StationInfo {
    return {
      stationId: this.stationId,
      firmwareVersion: this.firmwareVersion,
      publicKey: this.signer.publicKeyB64,
      state: this.state,
    };
  }

  getBoard(): BoardReading {
    return { present: this.board.present, boardUid: this.board.boardUid, boardIdOhms: this.board.boardIdOhms };
  }

  getRecords(afterSeq: number): StationResultRecord[] {
    return this.records.filter((r) => r.seq > afterSeq);
  }

  debugSnapshot() {
    return {
      state: this.state,
      board: this.board,
      pairingCode: this.pairingCode,
      session: this.session
        ? { id: this.session.id, boardUid: this.session.boardUid, attemptNo: this.session.attemptNo, scenario: this.session.scenario }
        : null,
      wsClients: this.bus.clientCount,
      pendingRecords: this.records.length,
    };
  }

  // ---- auth ----

  pair(code: string): string | null {
    if (code !== this.pairingCode) return null;
    const token = randomUUID();
    this.tokens.add(token);
    return token;
  }

  isAuthorized(token: string | undefined): boolean {
    return !!token && this.tokens.has(token);
  }

  // ---- control-page-only actions (not part of the Section 7.1 app-facing contract) ----

  placeBoard(input: { boardUid?: string; boardIdOhms?: number; variant?: string }) {
    if (["LOADING", "PROGRAMMING", "RUNNING", "AWAIT_CONFIRM"].includes(this.state)) {
      throw new Error("Cannot place a board while a session is active");
    }
    if (this.state === "FIXTURE_FAULT") {
      throw new Error("Station needs supervisor unlock before a new board can be placed");
    }
    this.board = {
      present: true,
      boardUid: input.boardUid ?? randomHexUid(),
      boardIdOhms: input.boardIdOhms ?? 1200,
      variant: input.variant ?? null,
    };
    this.bus.emit({ type: "board", board: this.getBoard() });

    if (this.state === "IDLE") this.setState("ARMED");
    else if (this.state === "FAIL" && !this.failNeedsAck) this.setState("ARMED");
    // else (FAIL awaiting ack, or PASS with board already swapped): state unchanged until ack/removal handled.
  }

  removeBoard() {
    const wasMidSession = ["LOADING", "PROGRAMMING", "RUNNING", "AWAIT_CONFIRM"].includes(this.state);
    this.board = { present: false, boardUid: null, boardIdOhms: null, variant: null };
    this.bus.emit({ type: "board", board: this.getBoard() });

    if (wasMidSession) {
      this.interruptSession("Board removed mid-test");
      return;
    }
    if (this.state === "PASS" || this.state === "IDLE" || this.state === "ARMED") {
      this.setState("IDLE");
    }
    // FAIL (unacked) and FIXTURE_FAULT stay as-is until ack()/unlock().
  }

  unlock() {
    if (this.state !== "FIXTURE_FAULT") throw new Error("Station is not in FIXTURE_FAULT");
    this.setState(this.board.present ? "ARMED" : "IDLE");
  }

  // ---- app-facing session flow (planner 7.1) ----

  createSession(scenario: Scenario, confirmTimeoutMs = 60_000): { sessionId: string; attemptNo: number } {
    if (this.state !== "ARMED") throw new Error(`Cannot start a session in state ${this.state}`);
    const boardUid = this.board.boardUid!;
    const attemptNo = (this.attemptCounts.get(boardUid) ?? 0) + 1;
    if (attemptNo > MAX_ATTEMPTS) {
      throw new Error("Supervisor approval needed — this PCB has used its retests (OPS-080)");
    }

    this.session = {
      id: randomUUID(),
      boardUid,
      attemptNo,
      scenario,
      confirmTimeoutMs,
      plan: null,
      programSha256: null,
      startedAt: new Date(),
      pendingConfirm: null,
      aborted: false,
    };
    this.armIdleTimer();
    this.setState("LOADING");
    return { sessionId: this.session.id, attemptNo };
  }

  uploadPlan(sessionId: string, plan: TestPlan) {
    const session = this.requireSession(sessionId, ["LOADING"]);
    if (this.board.boardIdOhms! < plan.boardIdOhms.min || this.board.boardIdOhms! > plan.boardIdOhms.max) {
      this.abortInternal("Wrong variant for this plan");
      throw new Error("Wrong variant for this plan (board-ID reading outside plan window)");
    }
    session.plan = plan;
  }

  async uploadProgram(sessionId: string, programSha256: string): Promise<void> {
    const session = this.requireSession(sessionId, ["LOADING"]);
    if (!session.plan) throw new Error("Upload the plan before the program");
    session.programSha256 = programSha256;

    for (const percent of [30, 70, 100]) {
      await delay(80);
      this.bus.emit({ type: "uploadProgress", sessionId, percent });
    }

    this.setState("PROGRAMMING");
    for (const percent of [25, 60, 100]) {
      await delay(150);
      this.bus.emit({ type: "programmingProgress", sessionId, percent });
    }

    if (session.aborted) return;

    if (session.scenario === "fixture_fault") {
      this.bus.emit({ type: "wiped", what: "program" });
      await this.finishSession(session, "FIXTURE_FAULT", []);
      return;
    }
    if (session.scenario === "verify_fail") {
      this.bus.emit({ type: "wiped", what: "program" });
      await this.finishSession(session, "FAIL", []);
      return;
    }

    this.bus.emit({ type: "wiped", what: "program" });
    this.setState("PROGRAMMED");
  }

  async start(sessionId: string): Promise<void> {
    const session = this.requireSession(sessionId, ["PROGRAMMED"]);
    this.setState("RUNNING");
    void this.runSequence(session);
  }

  confirm(sessionId: string) {
    const session = this.requireSession(sessionId, ["AWAIT_CONFIRM"]);
    session.pendingConfirm?.resolve();
  }

  abort(sessionId: string) {
    this.requireSession(sessionId, ["LOADING", "PROGRAMMING", "PROGRAMMED", "RUNNING", "AWAIT_CONFIRM"]);
    this.abortInternal("Aborted by operator");
  }

  ack() {
    if (this.state !== "FAIL") throw new Error("Nothing to acknowledge");
    this.failNeedsAck = false;
    this.setState(this.board.present ? "ARMED" : "IDLE");
  }

  ackRecords(recordIds: string[]) {
    this.records = this.records.filter((r) => !recordIds.includes(r.recordId));
  }

  // ---- internals ----

  private requireSession(sessionId: string, allowedStates: StationState[]): Session {
    if (!this.session || this.session.id !== sessionId) throw new Error("No such session");
    if (!allowedStates.includes(this.state)) throw new Error(`Invalid action in state ${this.state}`);
    return this.session;
  }

  private async runSequence(session: Session) {
    const steps = session.plan?.sequence ?? [];
    const results: StationResultStep[] = [];
    let removedMidTest = false;

    for (const [index, step] of steps.entries()) {
      if (session.aborted) return;

      if (session.scenario === "board_removed_mid_test" && index === Math.floor(steps.length / 2)) {
        removedMidTest = true;
        this.removeBoard();
        return;
      }
      if (session.scenario === "wifi_drop_mid_test" && index === Math.floor(steps.length / 2)) {
        this.bus.dropAllConnections();
      }

      if (step.block === "CONFIRM") {
        this.setState("AWAIT_CONFIRM");
        this.bus.emit({
          type: "confirmRequest",
          sessionId: session.id,
          instruction: `Visually confirm ${step.id}`,
          timeoutMs: session.confirmTimeoutMs,
        });
        const confirmed = await this.waitForConfirm(session);
        if (session.aborted) return;
        this.setState("RUNNING");
        results.push({
          id: step.id,
          block: step.block,
          value: confirmed ? 1 : 0,
          unit: "bool",
          min: 1,
          max: 1,
          verdict: confirmed ? "PASS" : "FAIL",
          ms: session.confirmTimeoutMs,
          suspects: confirmed ? [] : ["Operator did not confirm in time"],
        });
        continue;
      }

      this.bus.emit({ type: "stepStart", sessionId: session.id, stepId: step.id, block: step.block });
      await delay(step.ms);
      if (session.aborted) return;

      const value = sampleValue(step, session.scenario);
      const verdict: Verdict = value >= step.min && value <= step.max ? "PASS" : "FAIL";
      results.push({
        id: step.id,
        block: step.block,
        value,
        unit: step.unit,
        min: step.min,
        max: step.max,
        verdict,
        ms: step.ms,
        suspects: verdict === "FAIL" ? [`${step.block} out of range`] : [],
      });
      this.bus.emit({ type: "stepResult", sessionId: session.id, stepId: step.id, value, verdict });
    }

    if (removedMidTest) return;
    const overall: Verdict = results.some((r) => r.verdict === "FAIL") ? "FAIL" : "PASS";
    await this.finishSession(session, overall, results);
  }

  private waitForConfirm(session: Session): Promise<boolean> {
    if (session.scenario === "confirm_timeout") {
      return new Promise((resolve) => setTimeout(() => resolve(false), session.confirmTimeoutMs));
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), session.confirmTimeoutMs);
      session.pendingConfirm = {
        resolve: () => {
          clearTimeout(timer);
          resolve(true);
        },
      };
    });
  }

  private async finishSession(session: Session, verdict: Verdict, steps: StationResultStep[]) {
    this.clearIdleTimer();
    this.setState("SAFING");
    this.bus.emit({ type: "wiped", what: "plan" });

    if (verdict !== "FIXTURE_FAULT") {
      this.attemptCounts.set(session.boardUid, session.attemptNo);
    }

    const record: Omit<StationResultRecord, "signature"> = {
      recordId: randomUUID(),
      stationId: this.stationId,
      seq: this.seqStore.next(),
      boardUid: session.boardUid,
      serial: `${this.board.variant ?? "UNKNOWN"}-${session.boardUid.slice(0, 8)}`,
      variant: this.board.variant ?? session.plan?.variant ?? "UNKNOWN",
      attemptNo: session.attemptNo,
      verdict,
      locked: verdict === "PASS",
      isGolden: false,
      startedAt: session.startedAt.toISOString(),
      durationMs: Date.now() - session.startedAt.getTime(),
      operatorId: "sim-operator",
      planVersion: session.plan?.planVersion ?? "unknown",
      planSha256: session.plan ? sha256(JSON.stringify(session.plan)) : "unknown",
      programSha256: session.programSha256 ?? "unknown",
      steps,
    };
    const signed: StationResultRecord = { ...record, signature: this.signer.sign(record) };
    this.records.push(signed);

    this.session = null;
    this.setState(verdict);
    if (verdict === "FAIL") this.failNeedsAck = true;
    this.bus.emit({ type: "completed", sessionId: session.id, verdict, recordId: signed.recordId });
  }

  private abortInternal(reason: string) {
    if (this.session) this.session.aborted = true;
    this.clearIdleTimer();
    this.setState("SAFING");
    this.bus.emit({ type: "wiped", what: "program" });
    this.bus.emit({ type: "wiped", what: "plan" });
    this.bus.emit({ type: "error", message: reason });
    this.session = null;
    this.setState(this.board.present ? "ARMED" : "IDLE");
  }

  private interruptSession(reason: string) {
    if (this.session) this.session.aborted = true;
    this.clearIdleTimer();
    this.setState("SAFING");
    this.bus.emit({ type: "wiped", what: "program" });
    this.bus.emit({ type: "wiped", what: "plan" });
    this.bus.emit({ type: "error", message: reason });
    this.session = null;
    this.setState("IDLE");
  }

  private armIdleTimer() {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => this.interruptSession("5-minute idle timeout"), IDLE_TIMEOUT_MS);
  }

  private clearIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private setState(state: StationState) {
    this.state = state;
    this.bus.emit({ type: "state", state });
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

function randomHexUid(): string {
  return Array.from({ length: 12 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** Produces a plausible measurement: in-range unless this scenario targets the step's block. */
function sampleValue(step: { block: string; min: number; max: number }, scenario: Scenario): number {
  const targetBlock = SCENARIO_TARGET_BLOCK[scenario];
  const mid = (step.min + step.max) / 2;
  const jitter = (step.max - step.min) * 0.1;
  if (targetBlock && step.block === targetBlock) {
    return step.max + Math.abs(step.max - step.min) * 0.5 + 1; // clearly out of range
  }
  return mid + (Math.random() * 2 - 1) * jitter;
}
