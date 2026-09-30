import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from "@nestjs/common";
import { Queue, Worker, Job } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";

interface RefreshDailyStatsJob {
  customerId: string;
  day: string; // YYYY-MM-DD
}

@Injectable()
export class StatsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StatsService.name);
  private queue!: Queue<RefreshDailyStatsJob>;
  private worker?: Worker<RefreshDailyStatsJob>;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const redisHost = process.env.REDIS_HOST ?? "localhost";
    const redisPort = Number(process.env.REDIS_PORT ?? 6379);

    const connection = { host: redisHost, port: redisPort };

    this.queue = new Queue<RefreshDailyStatsJob>("daily-stats", { connection });

    try {
      this.worker = new Worker<RefreshDailyStatsJob>(
        "daily-stats",
        async (job: Job<RefreshDailyStatsJob>) => {
          await this.computeAndSaveDailyStats(job.data.customerId, job.data.day);
        },
        { connection }
      );

      this.worker.on("failed", (job, err) => {
        this.logger.error(`Daily stats job failed for ${job?.data.customerId}: ${err.message}`);
      });
    } catch (err) {
      this.logger.warn(`Failed to initialize BullMQ worker: ${(err as Error).message}. Will run inline fallback.`);
    }
  }

  async onModuleDestroy() {
    if (this.worker) await this.worker.close();
    if (this.queue) await this.queue.close();
  }

  /**
   * Enqueues a job to refresh daily_stats for a customer and date (planner Section 6.3.7).
   */
  async queueDailyStatsRefresh(customerId: string, date: Date | string) {
    const day = typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10);
    try {
      if (this.queue) {
        await this.queue.add("refresh", { customerId, day }, { jobId: `${customerId}:${day}` });
        return;
      }
    } catch (err) {
      this.logger.warn(`Could not enqueue to BullMQ (${(err as Error).message}); computing synchronously.`);
    }
    // Fallback if Redis is unavailable or disconnected
    await this.computeAndSaveDailyStats(customerId, day);
  }

  /**
   * Recomputes daily_stats row from test_runs for the given customer and day.
   */
  async computeAndSaveDailyStats(customerId: string, dayStr: string) {
    const startOfDay = new Date(`${dayStr}T00:00:00.000Z`);
    const endOfDay = new Date(`${dayStr}T23:59:59.999Z`);

    const [stats] = await this.prisma.$queryRaw<
      Array<{
        runs: number;
        unique_boards: number;
        passed: number;
        failed: number;
        fixture_faults: number;
      }>
    >`
      SELECT
        COUNT(*)::int AS runs,
        COUNT(DISTINCT board_uid) FILTER (WHERE verdict != 'FIXTURE_FAULT' AND is_golden = false)::int AS unique_boards,
        COUNT(*) FILTER (WHERE verdict = 'PASS' AND is_golden = false)::int AS passed,
        COUNT(*) FILTER (WHERE verdict = 'FAIL' AND is_golden = false)::int AS failed,
        COUNT(*) FILTER (WHERE verdict = 'FIXTURE_FAULT' AND is_golden = false)::int AS fixture_faults
      FROM test_runs
      WHERE customer_id = ${customerId}
        AND started_at >= ${startOfDay}
        AND started_at <= ${endOfDay}
    `;

    if (!stats || stats.runs === 0) return;

    await this.prisma.dailyStats.upsert({
      where: {
        customerId_day: {
          customerId,
          day: startOfDay,
        },
      },
      update: {
        runs: stats.runs,
        uniqueBoards: stats.unique_boards,
        passed: stats.passed,
        failed: stats.failed,
        fixtureFaults: stats.fixture_faults,
      },
      create: {
        customerId,
        day: startOfDay,
        runs: stats.runs,
        uniqueBoards: stats.unique_boards,
        passed: stats.passed,
        failed: stats.failed,
        fixtureFaults: stats.fixture_faults,
      },
    });
  }
}
