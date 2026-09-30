import { join } from "node:path";
import Fastify, { type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import { PairRequestSchema, TestPlanSchema } from "@fct/contracts";
import { StationSim } from "./state";
import { SCENARIOS, type Scenario } from "./scenarios";

const PORT = process.env.PORT ? Number(process.env.PORT) : 4100;
const STATION_ID = process.env.STATION_ID ?? "FCT-SIM-01";

const sim = new StationSim(STATION_ID);

function bearerToken(req: FastifyRequest): string | undefined {
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
}

function requireAuth(req: FastifyRequest, reply: { code: (n: number) => any }) {
  if (!sim.isAuthorized(bearerToken(req))) {
    reply.code(401).send({ error: "Not paired with this station" });
    return false;
  }
  return true;
}

async function main() {
  const app = Fastify({ logger: { level: "info" } });

  // Tolerate `Content-Type: application/json` with no/empty body (e.g. parameterless
  // action calls like start/confirm/abort/ack) instead of Fastify's default 400.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    if (!body) return done(null, {});
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  await app.register(cors, { origin: true });
  await app.register(fastifyWebsocket);
  await app.register(fastifyStatic, { root: join(__dirname, "..", "public"), prefix: "/" });

  app.get("/", async (_req, reply) => reply.redirect("/control.html"));

  app.get("/v1/info", async () => sim.info());

  app.post("/v1/pair", async (req, reply) => {
    const parsed = PairRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const token = sim.pair(parsed.data.code);
    if (!token) return reply.code(401).send({ error: "Invalid pairing code" });
    return { stationToken: token };
  });

  app.get("/v1/board", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    return sim.getBoard();
  });

  app.post("/v1/sessions", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const body = req.body as { scenario?: Scenario; confirmTimeoutMs?: number };
    const scenario = body.scenario ?? "all_pass";
    if (!SCENARIOS.includes(scenario)) return reply.code(400).send({ error: `Unknown scenario: ${scenario}` });
    try {
      return sim.createSession(scenario, body.confirmTimeoutMs);
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message });
    }
  });

  app.put("/v1/sessions/:id/plan", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { id } = req.params as { id: string };
    const parsed = TestPlanSchema.safeParse((req.body as any)?.plan);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    try {
      sim.uploadPlan(id, parsed.data);
      return { ok: true };
    } catch (err) {
      return reply.code(422).send({ error: (err as Error).message });
    }
  });

  app.put("/v1/sessions/:id/program", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { id } = req.params as { id: string };
    const { programSha256 } = req.body as { programSha256?: string };
    if (!programSha256) return reply.code(400).send({ error: "programSha256 required" });
    try {
      await sim.uploadProgram(id, programSha256);
      return { ok: true, state: sim.info().state };
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message });
    }
  });

  app.post("/v1/sessions/:id/start", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { id } = req.params as { id: string };
    try {
      await sim.start(id);
      return reply.code(202).send({ ok: true });
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message });
    }
  });

  app.post("/v1/sessions/:id/confirm", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { id } = req.params as { id: string };
    try {
      sim.confirm(id);
      return { ok: true };
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message });
    }
  });

  app.post("/v1/sessions/:id/abort", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { id } = req.params as { id: string };
    try {
      sim.abort(id);
      return { ok: true };
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message });
    }
  });

  app.post("/v1/sessions/:id/ack", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    try {
      sim.ack();
      return { ok: true };
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message });
    }
  });

  app.get("/v1/records", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const afterSeq = Number((req.query as { afterSeq?: string }).afterSeq ?? 0);
    return sim.getRecords(afterSeq);
  });

  app.post("/v1/records/ack", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const { recordIds } = req.body as { recordIds?: string[] };
    sim.ackRecords(recordIds ?? []);
    return { ok: true };
  });

  // Control-page-only actions — not part of the Section 7.1 app-facing contract.
  app.get("/v1/control/state", async () => sim.debugSnapshot());
  app.get("/v1/control/scenarios", async () => SCENARIOS);

  app.post("/v1/control/board", async (req, reply) => {
    const body = req.body as { boardUid?: string; boardIdOhms?: number; variant?: string };
    try {
      sim.placeBoard(body);
      return { ok: true };
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message });
    }
  });

  app.post("/v1/control/board/remove", async () => {
    sim.removeBoard();
    return { ok: true };
  });

  app.post("/v1/control/unlock", async (req, reply) => {
    try {
      sim.unlock();
      return { ok: true };
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message });
    }
  });

  app.register(async (instance) => {
    instance.get("/v1/events", { websocket: true }, (socket, req) => {
      const token = (req.query as { token?: string }).token;
      if (!sim.isAuthorized(token)) {
        socket.close(4401, "Not paired with this station");
        return;
      }
      sim.bus.add(socket);
      socket.send(JSON.stringify({ type: "state", state: sim.info().state }));
    });
  });

  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`\n[station-sim] ${STATION_ID} listening on http://localhost:${PORT}`);
  console.log(`[station-sim] control page: http://localhost:${PORT}/control.html`);
  console.log(`[station-sim] pairing code: ${sim.pairingCode}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
