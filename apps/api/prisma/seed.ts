import { PrismaClient, Verdict } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DAYS = 30;
const VARIANTS = ["WLC-ECO", "WLC-PRO"];

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(items: T[]): T {
  return items[randInt(0, items.length - 1)];
}

function randomVerdict(): Verdict {
  const roll = Math.random();
  if (roll < 0.03) return "FIXTURE_FAULT";
  if (roll < 0.15) return "FAIL";
  return "PASS";
}

function boardUid(): string {
  return Array.from({ length: 12 }, () => randInt(0, 255).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

async function main() {
  console.log("Seeding admin login...");
  const adminPasswordHash = await bcrypt.hash("Proembsys@2018", 10);
  await prisma.user.upsert({
    where: { email: "info@proembsys.in" },
    update: {
      passwordHash: adminPasswordHash,
      role: "ADMIN",
    },
    create: {
      email: "info@proembsys.in",
      passwordHash: adminPasswordHash,
      role: "ADMIN",
      customerId: null,
    },
  });
  console.log("  info@proembsys.in / Proembsys@2018");

  console.log("Seeding customers, stations, operators...");
  const customerNames = ["Acme Robotics", "Bluewave Electronics", "Circuit Works", "Delta Systems"];
  const customers = [];
  for (const name of customerNames) {
    const customer = await prisma.customer.create({ data: { name, status: "ACTIVE" } });
    customers.push(customer);
  }

  const operatorPasswordHash = await bcrypt.hash("operator123", 10);
  const stationsByCustomer = new Map<string, string[]>();
  const operatorsByCustomer = new Map<string, string[]>();

  // Dedicated simple test operator for quick login
  await prisma.user.upsert({
    where: { email: "operator@fct.local" },
    update: { passwordHash: operatorPasswordHash, role: "OPERATOR", customerId: customers[0].id },
    create: { email: "operator@fct.local", passwordHash: operatorPasswordHash, role: "OPERATOR", customerId: customers[0].id },
  });
  console.log("  operator@fct.local / operator123");

  for (const [ci, customer] of customers.entries()) {
    const stationIds: string[] = [];
    const stationCount = randInt(1, 2);
    for (let s = 0; s < stationCount; s++) {
      const id = `FCT-${String(ci * 2 + s + 1).padStart(4, "0")}`;
      await prisma.station.create({
        data: {
          id,
          customerId: customer.id,
          publicKey: `ed25519:${id}-dev-key`,
          firmwareVersion: "0.1.0-sim",
          lastSeen: new Date(),
          lastSeq: 0,
        },
      });
      stationIds.push(id);
    }
    stationsByCustomer.set(customer.id, stationIds);

    const operatorIds: string[] = [];
    for (let o = 1; o <= 2; o++) {
      const operator = await prisma.user.create({
        data: {
          email: `operator${o}@${customer.name.toLowerCase().replace(/\s+/g, "-")}.example`,
          passwordHash: operatorPasswordHash,
          role: "OPERATOR",
          customerId: customer.id,
        },
      });
      operatorIds.push(operator.id);
    }
    operatorsByCustomer.set(customer.id, operatorIds);
  }

  console.log(`Seeding ~${DAYS} days of test runs...`);
  const stationSeq = new Map<string, number>();
  // boards a customer already has, so we can generate realistic retests
  const boardsByCustomer = new Map<string, { uid: string; variant: string; attemptCount: number }[]>();
  for (const c of customers) boardsByCustomer.set(c.id, []);

  const now = new Date();
  let totalRuns = 0;

  for (let dayOffset = DAYS - 1; dayOffset >= 0; dayOffset--) {
    const day = new Date(now);
    day.setDate(day.getDate() - dayOffset);

    for (const customer of customers) {
      const stationIds = stationsByCustomer.get(customer.id)!;
      const operatorIds = operatorsByCustomer.get(customer.id)!;
      const boards = boardsByCustomer.get(customer.id)!;
      const runsToday = randInt(2, 10);

      for (let r = 0; r < runsToday; r++) {
        const stationId = pick(stationIds);
        const seq = (stationSeq.get(stationId) ?? 0) + 1;
        stationSeq.set(stationId, seq);

        const reuseExisting = boards.length > 3 && Math.random() < 0.25;
        let board: { uid: string; variant: string; attemptCount: number };
        const startedAt = new Date(day);
        startedAt.setHours(randInt(8, 18), randInt(0, 59), randInt(0, 59));

        if (reuseExisting) {
          board = pick(boards.filter((b) => b.attemptCount < 3));
          if (!board) board = pick(boards);
        } else {
          board = { uid: boardUid(), variant: pick(VARIANTS), attemptCount: 0 };
          boards.push(board);
          await prisma.board.create({
            data: {
              uid: board.uid,
              variant: board.variant,
              firstCustomerId: customer.id,
              firstTestedAt: startedAt,
              lastVerdict: null,
              attemptCount: 0,
            },
          });
        }

        board.attemptCount += 1;
        const verdict = randomVerdict();
        const isGolden = Math.random() < 0.02;

        await prisma.testRun.create({
          data: {
            stationId,
            seq,
            customerId: customer.id,
            boardUid: board.uid,
            serial: `${board.variant}-${board.uid.slice(0, 8)}`,
            variant: board.variant,
            attemptNo: board.attemptCount,
            verdict,
            locked: verdict === "PASS",
            startedAt,
            durationMs: randInt(45_000, 90_000),
            operatorId: pick(operatorIds),
            programSha256: `sha256:${boardUid()}`,
            planSha256: `sha256:${boardUid()}`,
            planVersion: "0.1.0",
            isGolden,
          },
        });

        await prisma.board.update({
          where: { uid: board.uid },
          data: { lastVerdict: verdict, attemptCount: board.attemptCount },
        });

        totalRuns += 1;
      }
    }
  }
  console.log(`  created ${totalRuns} test runs`);

  console.log("Deriving daily_stats...");
  const runs = await prisma.testRun.findMany({
    where: { isGolden: false },
    select: { customerId: true, startedAt: true, verdict: true, boardUid: true },
  });

  type Bucket = { day: string; customerId: string; boards: Set<string>; passed: number; failed: number; fixtureFaults: number };
  const buckets = new Map<string, Bucket>();

  for (const run of runs) {
    const day = run.startedAt.toISOString().slice(0, 10);
    const key = `${run.customerId}:${day}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { day, customerId: run.customerId, boards: new Set(), passed: 0, failed: 0, fixtureFaults: 0 };
      buckets.set(key, bucket);
    }
    if (run.verdict === "FIXTURE_FAULT") {
      bucket.fixtureFaults += 1;
      continue;
    }
    bucket.boards.add(run.boardUid);
    if (run.verdict === "PASS") bucket.passed += 1;
    else bucket.failed += 1;
  }

  for (const bucket of buckets.values()) {
    await prisma.dailyStats.create({
      data: {
        customerId: bucket.customerId,
        day: new Date(bucket.day),
        runs: bucket.passed + bucket.failed + bucket.fixtureFaults,
        uniqueBoards: bucket.boards.size,
        passed: bucket.passed,
        failed: bucket.failed,
        fixtureFaults: bucket.fixtureFaults,
      },
    });
  }
  console.log(`  created ${buckets.size} daily_stats rows`);

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
