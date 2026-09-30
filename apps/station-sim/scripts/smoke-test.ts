/**
 * Drives apps/station-sim through pair -> board -> LOAD -> program -> START -> result
 * for a representative set of Section 7.3 scenarios, non-interactively.
 * Run with the simulator already running: `pnpm --filter @fct/station-sim smoke`
 */
const BASE = process.env.SIM_URL ?? "http://localhost:4100";

const PLAN = {
  schemaVersion: "1.0",
  planVersion: "0.1.0",
  variant: "WLC-ECO",
  boardIdOhms: { min: 1000, max: 1500 },
  sequence: [
    { id: "S010", block: "LED_SCAN", unit: "V", min: 1.45, max: 2.0, ms: 60 },
    { id: "S020", block: "RELAY_TEST", unit: "ohm", min: 0, max: 0.5, ms: 60 },
    { id: "S030", block: "CONFIRM", unit: "bool", min: 1, max: 1, ms: 10 },
    { id: "S040", block: "FINAL_CHECK", unit: "V", min: 3.0, max: 3.6, ms: 60 },
  ],
};

let token = "";

async function api(path: string, opts: RequestInit = {}): Promise<{ ok: boolean; status: number; body: any }> {
  const headers: Record<string, string> = { ...(opts.headers as any) };
  if (opts.body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function waitForState(predicate: (state: string) => boolean, timeoutMs = 10_000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { body } = await api("/v1/control/state");
    if (predicate(body.state)) return body.state;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for state (last check did not match predicate)`);
}

async function pair() {
  const { body: snap } = await api("/v1/control/state");
  const { ok, body } = await api("/v1/pair", { method: "POST", body: JSON.stringify({ code: snap.pairingCode }) });
  if (!ok) throw new Error(`pair failed: ${JSON.stringify(body)}`);
  token = body.stationToken;
}

interface CaseResult {
  scenario: string;
  expectedVerdict: string | "BLOCKED";
  actual: string;
  pass: boolean;
}

async function runScenario(scenario: string, expectedVerdict: string | "BLOCKED"): Promise<CaseResult> {
  const boardIdOhms = scenario === "wrong_variant" ? 50 : 1200;
  await api("/v1/control/board/remove", { method: "POST" });
  await waitForState((s) => s === "IDLE" || s === "ARMED" || s === "FAIL" || s === "FIXTURE_FAULT");
  // Clear any stuck FAIL/FIXTURE_FAULT from a previous case before placing a fresh board.
  let { body: snap } = await api("/v1/control/state");
  if (snap.state === "FIXTURE_FAULT") await api("/v1/control/unlock", { method: "POST" });

  await api("/v1/control/board", { method: "POST", body: JSON.stringify({ boardIdOhms, variant: "WLC-ECO" }) });
  await waitForState((s) => s === "ARMED" || s === "FAIL");
  ({ body: snap } = await api("/v1/control/state"));
  if (snap.state === "FAIL") {
    await api(`/v1/sessions/${snap.session?.id}/ack`, { method: "POST" }).catch(() => {});
    await waitForState((s) => s === "ARMED");
  }

  const { body: session } = await api("/v1/sessions", {
    method: "POST",
    body: JSON.stringify({ scenario, confirmTimeoutMs: 1500 }),
  });

  const planRes = await api(`/v1/sessions/${session.sessionId}/plan`, { method: "PUT", body: JSON.stringify({ plan: PLAN }) });
  if (!planRes.ok) {
    const state = await waitForState((s) => s === "ARMED" || s === "IDLE");
    return { scenario, expectedVerdict, actual: "BLOCKED", pass: expectedVerdict === "BLOCKED" };
  }

  const programRes = await api(`/v1/sessions/${session.sessionId}/program`, {
    method: "PUT",
    body: JSON.stringify({ programSha256: "sha256:test" }),
  });
  const stateAfterProgram = programRes.body.state ?? (await api("/v1/control/state")).body.state;

  if (stateAfterProgram !== "PROGRAMMED") {
    const finalState = await waitForState((s) => ["FAIL", "FIXTURE_FAULT", "ARMED", "IDLE"].includes(s));
    const actual = finalState === "ARMED" || finalState === "IDLE" ? "FAIL" : finalState;
    if (finalState === "FAIL") await api(`/v1/sessions/${session.sessionId}/ack`, { method: "POST" }).catch(() => {});
    return { scenario, expectedVerdict, actual, pass: actual === expectedVerdict };
  }

  await api(`/v1/sessions/${session.sessionId}/start`, { method: "POST" });

  // Handle the CONFIRM step unless this scenario is specifically testing the timeout.
  // IDLE is also a valid stop here — board_removed_mid_test short-circuits straight to
  // IDLE without ever reaching the CONFIRM step.
  if (scenario !== "confirm_timeout") {
    await waitForState((s) => ["AWAIT_CONFIRM", "PASS", "FAIL", "FIXTURE_FAULT", "IDLE"].includes(s));
    const { body: mid } = await api("/v1/control/state");
    if (mid.state === "AWAIT_CONFIRM") {
      await api(`/v1/sessions/${session.sessionId}/confirm`, { method: "POST" });
    }
  }

  const finalState = await waitForState((s) => ["PASS", "FAIL", "FIXTURE_FAULT", "IDLE"].includes(s), 15_000);
  const actual = finalState === "IDLE" ? "ABORTED" : finalState;

  if (finalState === "FAIL") {
    await api(`/v1/sessions/${session.sessionId}/ack`, { method: "POST" }).catch(() => {});
  }

  return { scenario, expectedVerdict, actual, pass: actual === expectedVerdict };
}

async function main() {
  await pair();

  const cases: Array<[string, string]> = [
    ["all_pass", "PASS"],
    ["led_open", "FAIL"],
    ["relay_contact_high", "FAIL"],
    ["verify_fail", "FAIL"],
    ["fixture_fault", "FIXTURE_FAULT"],
    ["wrong_variant", "BLOCKED"],
    ["confirm_timeout", "FAIL"],
    ["board_removed_mid_test", "ABORTED"],
  ];

  const results: CaseResult[] = [];
  for (const [scenario, expected] of cases) {
    try {
      const result = await runScenario(scenario, expected);
      results.push(result);
      console.log(`${result.pass ? "PASS" : "FAIL"}  ${scenario.padEnd(24)} expected=${expected.padEnd(14)} actual=${result.actual}`);
    } catch (err) {
      results.push({ scenario, expectedVerdict: expected, actual: "ERROR", pass: false });
      console.log(`FAIL  ${scenario.padEnd(24)} expected=${expected.padEnd(14)} actual=ERROR (${(err as Error).message})`);
    }
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} scenarios matched expectations.`);
  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
