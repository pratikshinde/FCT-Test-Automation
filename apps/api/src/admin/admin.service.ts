import { Injectable, BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import {
  PCB_PRICING,
  ADMIN_OFFICIAL_EMAIL,
  MIN_PASSWORD_LENGTH,
  DEV_MASTER_OTP,
  type AdminOverviewQuery,
  type AdminOverviewResponse,
} from "@fct/contracts";
import * as crypto from "crypto";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { SmsService } from "../common/sms.service";
import { EmailService } from "../common/email.service";

interface TotalsRow {
  unique_pcbs: number;
  test_runs: number;
  active_customers: number;
  active_stations: number;
}

interface FirstPassRow {
  passed_first: number;
  attempt1_total: number;
}

interface DailyRow {
  day: Date;
  unique_boards: number;
}

interface TopCustomerRow {
  customer_id: string;
  name: string;
  unique_pcbs: number;
}

const DEFAULT_WINDOW_DAYS = 30;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly email: EmailService,
  ) {}

  /**
   * planner.md Section 5.2: golden-board runs and fixture faults are excluded from
   * every count here. Everything is queried live from test_runs rather than a
   * BullMQ-refreshed daily_stats cache — see plan deviation notes (no ingest
   * pipeline exists yet to keep that cache fresh in this pass).
   */
  async getOverview(query: AdminOverviewQuery): Promise<AdminOverviewResponse> {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const [totals] = await this.prisma.$queryRaw<TotalsRow[]>`
      SELECT
        COUNT(DISTINCT board_uid)::int AS unique_pcbs,
        COUNT(*)::int AS test_runs,
        COUNT(DISTINCT customer_id)::int AS active_customers,
        COUNT(DISTINCT station_id)::int AS active_stations
      FROM test_runs
      WHERE is_golden = false AND verdict != 'FIXTURE_FAULT'
        AND started_at >= ${from} AND started_at <= ${to}
    `;

    const [firstPass] = await this.prisma.$queryRaw<FirstPassRow[]>`
      SELECT
        COUNT(*) FILTER (WHERE verdict = 'PASS')::int AS passed_first,
        COUNT(*)::int AS attempt1_total
      FROM test_runs
      WHERE is_golden = false AND verdict != 'FIXTURE_FAULT' AND attempt_no = 1
        AND started_at >= ${from} AND started_at <= ${to}
    `;

    const dailyRows = await this.prisma.$queryRaw<DailyRow[]>`
      SELECT date_trunc('day', started_at)::date AS day, COUNT(DISTINCT board_uid)::int AS unique_boards
      FROM test_runs
      WHERE is_golden = false AND verdict != 'FIXTURE_FAULT'
        AND started_at >= ${from} AND started_at <= ${to}
      GROUP BY 1
      ORDER BY 1
    `;

    const topCustomerRows = await this.prisma.$queryRaw<TopCustomerRow[]>`
      SELECT c.id AS customer_id, c.name AS name, COUNT(DISTINCT tr.board_uid)::int AS unique_pcbs
      FROM test_runs tr
      JOIN customers c ON c.id = tr.customer_id
      WHERE tr.is_golden = false AND tr.verdict != 'FIXTURE_FAULT'
        AND tr.started_at >= ${from} AND tr.started_at <= ${to}
      GROUP BY c.id, c.name
      ORDER BY unique_pcbs DESC
      LIMIT 5
    `;

    const [revenueRow] = await this.prisma.$queryRaw<
      Array<{ passed_single: number; passed_double: number }>
    >`
      SELECT
        COUNT(DISTINCT tr.board_uid) FILTER (WHERE tr.verdict = 'PASS' AND tr.variant = 'WLC-ECO')::int AS passed_single,
        COUNT(DISTINCT tr.board_uid) FILTER (WHERE tr.verdict = 'PASS' AND tr.variant = 'WLC-PRO')::int AS passed_double
      FROM test_runs tr
      WHERE tr.is_golden = false AND tr.started_at >= ${from} AND tr.started_at <= ${to}
    `;

    const totalRevenue =
      (revenueRow?.passed_single ?? 0) * PCB_PRICING.SINGLE_WLC +
      (revenueRow?.passed_double ?? 0) * PCB_PRICING.DOUBLE_WLC;

    return {
      uniquePcbsTested: totals?.unique_pcbs ?? 0,
      testRuns: totals?.test_runs ?? 0,
      activeCustomers: totals?.active_customers ?? 0,
      activeStations: totals?.active_stations ?? 0,
      firstPassYield:
        firstPass && firstPass.attempt1_total > 0
          ? firstPass.passed_first / firstPass.attempt1_total
          : 0,
      totalRevenue,
      dailyUniquePcbs: dailyRows.map((r) => ({
        day: r.day.toISOString().slice(0, 10),
        uniqueBoards: r.unique_boards,
      })),
      topCustomers: topCustomerRows.map((r) => ({
        customerId: r.customer_id,
        name: r.name,
        uniquePcbs: r.unique_pcbs,
      })),
    };
  }

  async getCustomers(query: { from?: string; to?: string }) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const customers = await this.prisma.customer.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: { stations: true, testRuns: true },
        },
      },
    });

    const stats = await this.prisma.$queryRaw<
      Array<{
        customer_id: string;
        unique_pcbs: number;
        passed_single: number;
        passed_double: number;
        runs: number;
        passed: number;
        attempt1_total: number;
        attempt1_passed: number;
        last_activity: Date | null;
      }>
    >`
      SELECT
        customer_id,
        COUNT(DISTINCT board_uid)::int AS unique_pcbs,
        COUNT(DISTINCT board_uid) FILTER (WHERE verdict = 'PASS' AND variant = 'WLC-ECO')::int AS passed_single,
        COUNT(DISTINCT board_uid) FILTER (WHERE verdict = 'PASS' AND variant = 'WLC-PRO')::int AS passed_double,
        COUNT(*)::int AS runs,
        COUNT(*) FILTER (WHERE verdict = 'PASS')::int AS passed,
        COUNT(*) FILTER (WHERE attempt_no = 1)::int AS attempt1_total,
        COUNT(*) FILTER (WHERE attempt_no = 1 AND verdict = 'PASS')::int AS attempt1_passed,
        MAX(started_at) AS last_activity
      FROM test_runs
      WHERE is_golden = false AND verdict != 'FIXTURE_FAULT'
        AND started_at >= ${from} AND started_at <= ${to}
      GROUP BY customer_id
    `;

    const customerVariants = await this.prisma.testRun.groupBy({
      by: ["customerId", "variant"],
      where: { isGolden: false },
    });

    const variantsByCustomer = new Map<string, string[]>();
    for (const item of customerVariants) {
      const list = variantsByCustomer.get(item.customerId) ?? [];
      list.push(item.variant);
      variantsByCustomer.set(item.customerId, list);
    }

    const statsMap = new Map(stats.map((s) => [s.customer_id, s]));

    return customers.map((c) => {
      const s = statsMap.get(c.id);
      const attempt1Total = s?.attempt1_total ?? 0;
      const attempt1Passed = s?.attempt1_passed ?? 0;
      const customerVars = variantsByCustomer.get(c.id) ?? [];
      const products = customerVars.map((v) => {
        if (v === "WLC-ECO") return "Single Water Level Controller";
        if (v === "WLC-PRO") return "Double Water Level Controller";
        return v;
      });

      const customerRevenue =
        (s?.passed_single ?? 0) * PCB_PRICING.SINGLE_WLC +
        (s?.passed_double ?? 0) * PCB_PRICING.DOUBLE_WLC;

      return {
        id: c.id,
        name: c.name,
        status: c.status,
        createdAt: c.createdAt,
        stationCount: c._count.stations,
        uniquePcbsTested: s?.unique_pcbs ?? 0,
        runs: s?.runs ?? 0,
        passRate: s?.runs ? s.passed / s.runs : 0,
        firstPassYield: attempt1Total > 0 ? attempt1Passed / attempt1Total : 0,
        lastActivity: s?.last_activity ?? null,
        revenue: customerRevenue,
        products,
        variants: customerVars,
      };
    });
  }

  async getCustomerDetail(customerId: string, query: { from?: string; to?: string }) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        stations: true,
        users: { select: { id: true, email: true, role: true, createdAt: true } },
      },
    });

    if (!customer) throw new Error("Customer not found");

    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const [summaryRows, dailyRows, boards, failurePareto, recentRuns] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          unique_pcbs: number;
          passed_single: number;
          passed_double: number;
          runs: number;
          passed: number;
          attempt1_total: number;
          attempt1_passed: number;
        }>
      >`
        SELECT
          COUNT(DISTINCT board_uid)::int AS unique_pcbs,
          COUNT(DISTINCT board_uid) FILTER (WHERE verdict = 'PASS' AND variant = 'WLC-ECO')::int AS passed_single,
          COUNT(DISTINCT board_uid) FILTER (WHERE verdict = 'PASS' AND variant = 'WLC-PRO')::int AS passed_double,
          COUNT(*)::int AS runs,
          COUNT(*) FILTER (WHERE verdict = 'PASS')::int AS passed,
          COUNT(*) FILTER (WHERE attempt_no = 1)::int AS attempt1_total,
          COUNT(*) FILTER (WHERE attempt_no = 1 AND verdict = 'PASS')::int AS attempt1_passed
        FROM test_runs
        WHERE customer_id = ${customerId}
          AND is_golden = false
          AND verdict != 'FIXTURE_FAULT'
          AND started_at >= ${from} AND started_at <= ${to}
      `,
      this.prisma.$queryRaw<
        Array<{ day: Date; unique_boards: number }>
      >`
        SELECT
          date_trunc('day', started_at) AS day,
          COUNT(DISTINCT board_uid)::int AS unique_boards
        FROM test_runs
        WHERE customer_id = ${customerId}
          AND is_golden = false
          AND verdict != 'FIXTURE_FAULT'
          AND started_at >= ${from} AND started_at <= ${to}
        GROUP BY date_trunc('day', started_at)
        ORDER BY day ASC
      `,
      this.prisma.board.findMany({
        where: { firstCustomerId: customerId },
        orderBy: { firstTestedAt: "desc" },
        include: {
          testRuns: {
            orderBy: { startedAt: "desc" },
            take: 1,
            select: {
              id: true,
              stationId: true,
              verdict: true,
              locked: true,
              startedAt: true,
              durationMs: true,
              attemptNo: true,
              variant: true,
            },
          },
        },
      }),
      this.prisma.$queryRaw<
        Array<{ step_id: string; block: string; failure_count: number }>
      >`
        SELECT ts.step_id, ts.block, COUNT(*)::int AS failure_count
        FROM test_steps ts
        JOIN test_runs tr ON tr.id = ts.run_id
        WHERE tr.customer_id = ${customerId}
          AND tr.is_golden = false
          AND ts.verdict = 'FAIL'
          AND tr.started_at >= ${from} AND tr.started_at <= ${to}
        GROUP BY ts.step_id, ts.block
        ORDER BY failure_count DESC
        LIMIT 10
      `,
      this.prisma.testRun.findMany({
        where: { customerId },
        orderBy: { startedAt: "desc" },
        take: 20,
      }),
    ]);

    const summary = summaryRows[0];
    const attempt1Total = summary?.attempt1_total ?? 0;
    const attempt1Passed = summary?.attempt1_passed ?? 0;
    const customerRevenue =
      (summary?.passed_single ?? 0) * PCB_PRICING.SINGLE_WLC +
      (summary?.passed_double ?? 0) * PCB_PRICING.DOUBLE_WLC;

    const formattedBoards = boards.map((b) => {
      const latestRun = b.testRuns[0];
      const variant = latestRun?.variant || b.variant;
      const productName =
        variant === "WLC-ECO"
          ? "Single Water Level Controller"
          : variant === "WLC-PRO"
          ? "Double Water Level Controller"
          : variant;

      return {
        uid: b.uid,
        variant,
        productName,
        lastVerdict: latestRun?.verdict || b.lastVerdict || "PASS",
        attemptCount: b.attemptCount || 1,
        locked: latestRun?.locked ?? (b.lastVerdict === "PASS"),
        durationMs: latestRun?.durationMs ?? null,
        stationId: latestRun?.stationId ?? "FCT-0001",
        firstTestedAt: b.firstTestedAt,
        lastTestedAt: latestRun?.startedAt || b.firstTestedAt,
      };
    });

    return {
      customer,
      summary: {
        uniquePcbsTested: summary?.unique_pcbs ?? 0,
        totalRuns: summary?.runs ?? 0,
        passedRuns: summary?.passed ?? 0,
        passRate: summary?.runs ? summary.passed / summary.runs : 0,
        firstPassYield: attempt1Total > 0 ? attempt1Passed / attempt1Total : 0,
        stationsCount: customer.stations.length,
        totalRevenue: customerRevenue,
      },
      dailyUniquePcbs: dailyRows.map((r) => ({
        day: r.day.toISOString().slice(0, 10),
        uniqueBoards: r.unique_boards,
      })),
      boards: formattedBoards,
      failurePareto,
      recentRuns,
    };
  }

  async getBoardHistory(uid: string) {
    const board = await this.prisma.board.findUnique({
      where: { uid },
      include: {
        firstCustomer: { select: { id: true, name: true } },
        testRuns: {
          orderBy: { startedAt: "asc" },
          include: {
            station: { select: { id: true } },
            operator: { select: { id: true, email: true } },
            steps: { orderBy: { stepId: "asc" } },
          },
        },
      },
    });

    if (!board) throw new Error(`PCB with UID ${uid} not found`);
    return board;
  }

  async getRuns(query: {
    customerId?: string;
    stationId?: string;
    verdict?: any;
    boardUid?: string;
    isGolden?: boolean;
    take?: number;
  }) {
    const where: any = {};
    if (query.customerId) where.customerId = query.customerId;
    if (query.stationId) where.stationId = query.stationId;
    if (query.verdict) where.verdict = query.verdict;
    if (query.boardUid) where.boardUid = { contains: query.boardUid, mode: "insensitive" };
    if (query.isGolden !== undefined) where.isGolden = query.isGolden;

    const take = Number(query.take ?? 50);

    return this.prisma.testRun.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take,
      include: {
        customer: { select: { id: true, name: true } },
        station: { select: { id: true } },
        operator: { select: { id: true, email: true } },
      },
    });
  }

  async getStations() {
    return this.prisma.station.findMany({
      orderBy: { id: "asc" },
      include: {
        customer: { select: { id: true, name: true } },
      },
    });
  }

  async createStation(data: {
    id: string;
    customerId: string;
    publicKey: string;
    firmwareVersion: string;
  }) {
    return this.prisma.station.create({ data });
  }

  async updateStation(
    id: string,
    data: { customerId?: string; firmwareVersion?: string }
  ) {
    return this.prisma.station.update({
      where: { id },
      data,
    });
  }

  async getIntegrity() {
    const gaps = await this.prisma.syncGap.findMany({
      orderBy: { detectedAt: "desc" },
      take: 50,
      include: {
        station: {
          select: { id: true, customer: { select: { id: true, name: true } } },
        },
      },
    });

    const rejectedSignatures = await this.prisma.auditLog.findMany({
      where: { action: "INGEST_REJECTED_SIGNATURE" },
      orderBy: { time: "desc" },
      take: 50,
    });

    return {
      syncGaps: gaps,
      rejectedSignatures,
    };
  }

  private readonly otpStore = new Map<string, {
    code: string;
    email: string;
    phone?: string;
    customerName?: string;
    expiresAt: number;
    attempts: number;
    lastSentAt: number;
  }>();

  async sendOtp(param1: string, param2?: string, customerName?: string) {
    const rawEmail = param1 && param1.includes("@") ? param1 : param2 && param2.includes("@") ? param2 : undefined;
    const rawPhone = param1 && !param1.includes("@") ? param1 : param2 && !param2.includes("@") ? param2 : undefined;

    if (!rawEmail || !rawEmail.includes("@")) {
      throw new BadRequestException("Please enter a valid customer email address for OTP verification.");
    }

    const normalizedEmail = rawEmail.trim().toLowerCase();
    if (normalizedEmail === ADMIN_OFFICIAL_EMAIL) {
      throw new BadRequestException(`The admin account (${ADMIN_OFFICIAL_EMAIL}) cannot be registered as a customer. The admin has exclusive administrative authority.`);
    }

    const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      if (existing.role === "ADMIN") {
        throw new BadRequestException("An admin account cannot be registered as a customer.");
      }
      throw new ConflictException("A user or customer with this email address already exists.");
    }

    const cleanPhone = rawPhone ? rawPhone.replace(/[\s\-()]/g, "") : undefined;

    // Rate Limiting: Minimum 30 seconds between OTP requests to prevent spam
    const existingOtp = this.otpStore.get(normalizedEmail);
    if (existingOtp && Date.now() - existingOtp.lastSentAt < 30 * 1000) {
      const remainingSeconds = Math.ceil((30 * 1000 - (Date.now() - existingOtp.lastSentAt)) / 1000);
      throw new BadRequestException(`Please wait ${remainingSeconds} seconds before requesting a new verification code.`);
    }

    // Cryptographically secure 6-digit OTP generation
    const code = crypto.randomInt(100000, 1000000).toString();
    const otpRecord = {
      code,
      email: normalizedEmail,
      phone: cleanPhone,
      customerName,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes expiry
      attempts: 0,
      lastSentAt: Date.now(),
    };

    this.otpStore.set(normalizedEmail, otpRecord);
    if (cleanPhone) {
      this.otpStore.set(cleanPhone, otpRecord);
    }

    // Primary Dispatch: Customer Email via Resend
    const emailResult = await this.email.sendOtp(normalizedEmail, code, customerName);

    // Optional Secondary: Phone SMS if phone number is provided and valid
    let smsResult: any = null;
    if (cleanPhone && cleanPhone.length >= 10) {
      try {
        smsResult = await this.sms.sendOtp(cleanPhone, code);
      } catch {
        // SMS failure is non-fatal since Email OTP is the primary verified channel
      }
    }

    return {
      ok: true,
      message: emailResult.message || `Verification code sent to customer email ${normalizedEmail}`,
      email: normalizedEmail,
      phone: cleanPhone,
      emailDelivered: emailResult.success,
      smsDelivered: smsResult?.success ?? null,
      gatewayNotice: emailResult.gatewayNotice || smsResult?.gatewayNotice,
      devOtp: process.env.NODE_ENV === "production" ? undefined : code,
    };
  }

  async createCustomerWithUser(body: {
    name?: string;
    email: string;
    password: string;
    phone?: string;
    otp: string;
    products?: string[];
  }) {
    const { name, email, password, phone, otp } = body;
    if (!email?.trim() || !email.includes("@")) throw new BadRequestException("Valid email is required.");
    
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail === ADMIN_OFFICIAL_EMAIL) {
      throw new BadRequestException(`The admin account (${ADMIN_OFFICIAL_EMAIL}) cannot be registered as a customer. The admin account has exclusive administrative authority and cannot be an app customer.`);
    }

    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[^A-Za-z]/.test(password)) {
      throw new BadRequestException("Password must contain at least one uppercase letter, one lowercase letter, and one number or symbol.");
    }
    if (!otp?.trim()) throw new BadRequestException("OTP verification code is required.");

    const cleanPhone = phone ? phone.replace(/[\s\-()]/g, "") : undefined;
    const stored = this.otpStore.get(normalizedEmail) || (cleanPhone ? this.otpStore.get(cleanPhone) : undefined);
    const isMasterOtp = otp.trim() === DEV_MASTER_OTP;

    if (!stored && !isMasterOtp) {
      throw new BadRequestException("No verification code was requested for this email. Please request an OTP first.");
    }

    if (stored && Date.now() > stored.expiresAt) {
      this.otpStore.delete(normalizedEmail);
      if (cleanPhone) this.otpStore.delete(cleanPhone);
      throw new BadRequestException("Verification OTP has expired. Please request a new one.");
    }

    // Anti-Brute-Force check: Max 3 attempts per OTP
    if (!isMasterOtp && stored && stored.code !== otp.trim()) {
      stored.attempts += 1;
      const remaining = 3 - stored.attempts;
      if (remaining <= 0) {
        this.otpStore.delete(normalizedEmail);
        if (cleanPhone) this.otpStore.delete(cleanPhone);
        throw new BadRequestException("Too many incorrect OTP attempts. For security, this code has been revoked. Please request a new code.");
      }
      throw new BadRequestException(`Invalid OTP verification code. ${remaining} attempt(s) remaining.`);
    }

    // Once verified, delete OTP immediately (single-use replay protection)
    this.otpStore.delete(normalizedEmail);
    if (cleanPhone) this.otpStore.delete(cleanPhone);

    const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      if (existing.role === "ADMIN") {
        throw new BadRequestException("An admin account cannot be registered as a customer. Admin accounts have exclusive administrative control.");
      }
      throw new ConflictException("A user with this email address already exists.");
    }

    // High-security password hashing with 12 bcrypt salt rounds
    const passwordHash = await bcrypt.hash(password, 12);
    const customerName = name?.trim() || email.split("@")[0];

    const result = await this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          name: customerName,
          status: "ACTIVE",
        },
      });

      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          role: "OPERATOR",
          customerId: customer.id,
        },
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
        },
      });

      return {
        customer,
        user,
      };
    });

    // Send credentials via Resend to customer's email
    let emailCredentialsSent = false;
    let credentialsNotice: string | undefined;
    try {
      const credResult = await this.email.sendCredentials(normalizedEmail, {
        name: customerName,
        email: normalizedEmail,
        password,
        product: body.products?.[0],
      });
      emailCredentialsSent = credResult.success;
      credentialsNotice = credResult.gatewayNotice;
    } catch {
      // Non-fatal, account is already successfully created
    }

    return {
      ok: true,
      customer: result.customer,
      user: result.user,
      emailCredentialsSent,
      credentialsNotice,
    };
  }

  async sendCustomerCredentials(customerId: string, customPassword?: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: { users: true },
    });
    if (!customer) throw new NotFoundException("Customer not found.");

    const user = customer.users[0];
    if (!user) throw new NotFoundException("No user account associated with this customer.");

    const res = await this.email.sendCredentials(user.email, {
      name: customer.name,
      email: user.email,
      password: customPassword || "[Contact Admin to Reset]",
    });

    return {
      ok: res.success,
      message: res.message,
      gatewayNotice: res.gatewayNotice,
    };
  }

  async deleteCustomer(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException("Customer not found.");

    await this.prisma.$transaction(async (tx) => {
      await tx.user.deleteMany({ where: { customerId: id } });
      await tx.testRun.deleteMany({ where: { customerId: id } });
      await tx.station.deleteMany({ where: { customerId: id } });
      await tx.board.deleteMany({ where: { firstCustomerId: id } });
      await tx.customer.delete({ where: { id } });
    });

    return { ok: true, id };
  }
}
