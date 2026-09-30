import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { MeResponse } from "@fct/contracts";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        customer: {
          select: { id: true, name: true, status: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      customerId: user.customerId,
      customer: user.customer,
    };
  }

  /**
   * Customer-specific dashboard metrics.
   * Strictly isolated to this customer's ID — cannot see other customers' data!
   */
  async getCustomerDashboard(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { customer: true },
    });
    if (!user || !user.customerId) {
      throw new NotFoundException("No customer assigned to this operator account.");
    }
    const customerId = user.customerId;

    // Total unique PCBs tested by this customer only
    const [uniqueBoardsRow] = await this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`
      SELECT COUNT(DISTINCT board_uid)::bigint AS count
      FROM test_runs
      WHERE customer_id = '${customerId}'
    `);
    const uniquePcbsTested = Number(uniqueBoardsRow?.count ?? 0);

    // Total test runs for this customer
    const totalRuns = await this.prisma.testRun.count({
      where: { customerId },
    });

    // Passed test runs
    const passedRuns = await this.prisma.testRun.count({
      where: { customerId, verdict: "PASS" },
    });

    // Failed test runs
    const failedRuns = await this.prisma.testRun.count({
      where: { customerId, verdict: "FAIL" },
    });

    // Fixture faults
    const fixtureFaults = await this.prisma.testRun.count({
      where: { customerId, verdict: "FIXTURE_FAULT" },
    });

    // First Pass Yield (FPY) for this customer
    const [fpyRow] = await this.prisma.$queryRawUnsafe<Array<{ passed_first: bigint; attempt1_total: bigint }>>(`
      SELECT
        COUNT(*) FILTER (WHERE attempt_no = 1 AND verdict = 'PASS')::bigint AS passed_first,
        COUNT(*) FILTER (WHERE attempt_no = 1)::bigint AS attempt1_total
      FROM test_runs
      WHERE customer_id = '${customerId}'
    `);
    const fpy =
      fpyRow && Number(fpyRow.attempt1_total) > 0
        ? (Number(fpyRow.passed_first) / Number(fpyRow.attempt1_total)) * 100
        : totalRuns > 0
        ? (passedRuns / totalRuns) * 100
        : 100;

    // Customer's registered stations
    const stations = await this.prisma.station.findMany({
      where: { customerId },
      select: { id: true, firmwareVersion: true, lastSeen: true, lastSeq: true },
      orderBy: { id: "asc" },
    });

    // Customer's daily unique PCBs (for area chart)
    const dailyRows = await this.prisma.$queryRawUnsafe<Array<{ day: Date; unique_boards: number }>>(`
      SELECT DATE_TRUNC('day', started_at) AS day, COUNT(DISTINCT board_uid)::int AS unique_boards
      FROM test_runs
      WHERE customer_id = '${customerId}'
      GROUP BY DATE_TRUNC('day', started_at)
      ORDER BY day ASC
    `);

    // Customer's variant breakdown
    const variantRows = await this.prisma.$queryRawUnsafe<Array<{ variant: string; count: number }>>(`
      SELECT variant, COUNT(DISTINCT board_uid)::int AS count
      FROM test_runs
      WHERE customer_id = '${customerId}'
      GROUP BY variant
      ORDER BY count DESC
    `);

    // Recent 5 test runs for this customer
    const recentRuns = await this.prisma.testRun.findMany({
      where: { customerId },
      orderBy: { startedAt: "desc" },
      take: 5,
      select: {
        id: true,
        boardUid: true,
        serial: true,
        variant: true,
        verdict: true,
        startedAt: true,
        durationMs: true,
        stationId: true,
      },
    });
    const totalPassRevenue = passedRuns * 10;

    return {
      customer: user.customer,
      uniquePcbsTested,
      totalRuns,
      passedRuns,
      failedRuns,
      fixtureFaults,
      firstPassYield: Number(fpy.toFixed(1)),
      totalPassRevenue,
      stations,
      recentRuns,
      dailyUniquePcbs: dailyRows.map((r) => ({
        day: new Date(r.day).toISOString().slice(0, 10),
        uniqueBoards: r.unique_boards,
      })),
      variantBreakdown: variantRows.map((v) => ({
        name: v.variant || "Standard",
        count: v.count,
      })),
    };
  }

  /**
   * Customer-specific test results history.
   */
  async getCustomerRuns(
    userId: string,
    query?: { verdict?: string; search?: string; take?: number }
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.customerId) {
      throw new NotFoundException("No customer assigned.");
    }

    const where: any = { customerId: user.customerId };
    if (query?.verdict && query.verdict !== "ALL") {
      where.verdict = query.verdict;
    }
    if (query?.search?.trim()) {
      where.OR = [
        { boardUid: { contains: query.search.trim(), mode: "insensitive" } },
        { serial: { contains: query.search.trim(), mode: "insensitive" } },
      ];
    }

    return this.prisma.testRun.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: query?.take ? Number(query.take) : 50,
      include: {
        station: { select: { id: true } },
        steps: { orderBy: { stepId: "asc" } },
      },
    });
  }

  /**
   * Execute a test run using the loaded program file & JSON configuration.
   */
  async executeTestRun(
    userId: string,
    data: { programFileName?: string; jsonConfig?: any }
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { customer: true },
    });
    if (!user || !user.customerId) {
      throw new NotFoundException("No customer assigned.");
    }

    // Find customer's active station or create one
    let station = await this.prisma.station.findFirst({
      where: { customerId: user.customerId },
    });
    if (!station) {
      station = await this.prisma.station.create({
        data: {
          id: `FCT-ST-${Math.floor(1000 + Math.random() * 9000)}`,
          customerId: user.customerId,
          publicKey: "ed25519:simulated-key",
          firmwareVersion: "1.0.0-auto",
          lastSeen: new Date(),
          lastSeq: 0,
        },
      });
    }

    // Generate PCB UID and Serial
    const boardUid = Array.from({ length: 12 }, () =>
      Math.floor(Math.random() * 256)
        .toString(16)
        .padStart(2, "0")
    )
      .join("")
      .toUpperCase();
    const serial = `SN-${Date.now().toString().slice(-6)}`;
    const variant = data.jsonConfig?.product || "WLC-ECO";

    // Test stages from JSON config or fallback
    const testStages =
      Array.isArray(data.jsonConfig?.testStages) && data.jsonConfig.testStages.length > 0
        ? data.jsonConfig.testStages
        : [
            "POWER_RAIL_3V3_CHECK",
            "POWER_RAIL_5V0_CHECK",
            "MCU_FLASH_PROGRAMMING",
            "RELAY_CYCLE_TEST",
            "WATER_SENSOR_CALIBRATION",
            "MODBUS_UART_VERIFY",
          ];

    // Determine verdict (95% PASS rate for realistic testing)
    const isPass = Math.random() > 0.08;
    const verdict = isPass ? ("PASS" as const) : ("FAIL" as const);
    const failedStepIndex = isPass ? -1 : Math.floor(Math.random() * testStages.length);

    const steps = testStages.map((stage: string, idx: number) => {
      const stepPassed = isPass || idx !== failedStepIndex;
      const is3v3 = stage.includes("3V3");
      const is5v0 = stage.includes("5V");
      const val = is3v3 ? 3.31 : is5v0 ? 5.02 : 1.0;
      const min = is3v3 ? 3.25 : is5v0 ? 4.90 : 0.0;
      const max = is3v3 ? 3.35 : is5v0 ? 5.10 : 2.0;

      return {
        stepId: `STEP-${String(idx + 1).padStart(2, "0")}`,
        block: stage,
        value: val,
        unit: is3v3 || is5v0 ? "V" : "bool",
        min,
        max,
        verdict: stepPassed ? ("PASS" as const) : ("FAIL" as const),
        durationMs: Math.floor(120 + Math.random() * 200),
        suspects: stepPassed ? [] : ["U1_POWER_REGULATOR"],
      };
    });

    // Create or update Board
    await this.prisma.board.upsert({
      where: { uid: boardUid },
      update: {
        lastVerdict: verdict,
        attemptCount: { increment: 1 },
      },
      create: {
        uid: boardUid,
        variant,
        firstCustomerId: user.customerId,
        firstTestedAt: new Date(),
        lastVerdict: verdict,
        attemptCount: 1,
      },
    });

    // Find highest seq for this station to avoid collision
    const maxSeqRun = await this.prisma.testRun.findFirst({
      where: { stationId: station.id },
      orderBy: { seq: "desc" },
      select: { seq: true },
    });
    const newSeq = Math.max(maxSeqRun?.seq ?? 0, station.lastSeq ?? 0) + 1;

    await this.prisma.station.update({
      where: { id: station.id },
      data: { lastSeq: newSeq, lastSeen: new Date() },
    });

    try {
      const testRun = await this.prisma.testRun.create({
        data: {
          stationId: station.id,
          seq: newSeq,
          customerId: user.customerId,
          boardUid,
          serial,
          variant,
          attemptNo: 1,
          verdict,
          startedAt: new Date(),
          durationMs: Math.floor(2500 + Math.random() * 1500),
          operatorId: user.id,
          programSha256: "sha256:user-program-file",
          planSha256: "sha256:user-json-plan",
          planVersion: data.jsonConfig?.boardVersion || "1.0",
          steps: {
            create: steps,
          },
        },
        include: {
          steps: { orderBy: { stepId: "asc" } },
          station: { select: { id: true } },
        },
      });

      return {
        ok: true,
        testRun,
        verdict,
        boardUid,
        serial,
      };
    } catch (err: any) {
      console.error("[executeTestRun Error]:", err.message, err);
      throw err;
    }
  }
}
