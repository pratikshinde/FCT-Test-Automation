import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { StatsService } from "../stats/stats.service";
import { verifyStationSignature } from "../common/crypto";
import type {
  IngestRequest,
  IngestResponse,
  IngestResultItem,
  StationResultRecord,
} from "@fct/contracts";
import type { JwtPayload } from "../auth/jwt.strategy";

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stats: StatsService
  ) {}

  /**
   * Ingest a batch of up to 100 test runs per planner.md Section 6.3.
   * Returns per-record status: accepted, duplicate, or rejected.
   */
  async ingestRuns(
    req: IngestRequest,
    user: JwtPayload
  ): Promise<IngestResponse> {
    const results: IngestResultItem[] = [];

    for (const record of req.records) {
      const itemResult = await this.processSingleRecord(record, user);
      results.push(itemResult);
    }

    return { results };
  }

  private async processSingleRecord(
    record: StationResultRecord,
    user: JwtPayload
  ): Promise<IngestResultItem> {
    try {
      // 1. Look up station and verify ownership (Section 6.3.1)
      const station = await this.prisma.station.findUnique({
        where: { id: record.stationId },
      });

      if (!station) {
        return {
          recordId: record.recordId,
          status: "rejected",
          reason: `Station ${record.stationId} is not registered`,
        };
      }

      if (user.role !== "ADMIN" && station.customerId !== user.customerId) {
        return {
          recordId: record.recordId,
          status: "rejected",
          reason: `Station does not belong to user customer`,
        };
      }

      // 2. Verify digital signature (Section 6.3.2)
      const isSigValid = verifyStationSignature(record, station.publicKey);
      if (!isSigValid) {
        await this.audit.log(
          user.sub,
          "INGEST_REJECTED_SIGNATURE",
          station.id,
          {
            recordId: record.recordId,
            seq: record.seq,
            signature: record.signature,
          }
        );
        return {
          recordId: record.recordId,
          status: "rejected",
          reason: "Invalid digital signature",
        };
      }

      // 3. Check for duplicates by (station_id, seq) (Section 6.3.3)
      const existingRun = await this.prisma.testRun.findUnique({
        where: {
          stationId_seq: {
            stationId: record.stationId,
            seq: record.seq,
          },
        },
      });

      if (existingRun) {
        return {
          recordId: record.recordId,
          status: "duplicate",
          reason: "Record already ingested",
        };
      }

      // 4. Exactly-once insertion with transactional updates (Section 6.3.3 - 6.3.5)
      const startedAt = new Date(record.startedAt);

      // Verify operator exists in DB, otherwise attribute to caller
      let operatorId = user.sub;
      if (record.operatorId) {
        const opUser = await this.prisma.user.findUnique({
          where: { id: record.operatorId },
        });
        if (opUser) operatorId = opUser.id;
      }

      await this.prisma.$transaction(async (tx) => {
        // 4.1 Upsert Board (Section 6.3.4)
        await tx.board.upsert({
          where: { uid: record.boardUid },
          create: {
            uid: record.boardUid,
            variant: record.variant,
            firstCustomerId: station.customerId,
            firstTestedAt: startedAt,
            lastVerdict: record.verdict,
            attemptCount: 1,
          },
          update: {
            lastVerdict: record.verdict,
            attemptCount: { increment: 1 },
          },
        });

        // 4.2 Insert Test Run
        const run = await tx.testRun.create({
          data: {
            id: record.recordId,
            stationId: record.stationId,
            seq: record.seq,
            customerId: station.customerId,
            boardUid: record.boardUid,
            serial: record.serial,
            variant: record.variant,
            attemptNo: record.attemptNo,
            verdict: record.verdict,
            locked: record.locked,
            startedAt,
            durationMs: record.durationMs,
            operatorId,
            programSha256: record.programSha256,
            planSha256: record.planSha256,
            planVersion: record.planVersion,
            isGolden: record.isGolden,
          },
        });

        // 4.3 Insert Test Steps
        if (record.steps && record.steps.length > 0) {
          await tx.testStep.createMany({
            data: record.steps.map((s) => ({
              runId: run.id,
              stepId: s.id,
              block: s.block,
              value: s.value,
              unit: s.unit,
              min: s.min,
              max: s.max,
              verdict: s.verdict,
              durationMs: s.ms,
              suspects: s.suspects,
            })),
          });
        }

        // 4.4 Detect missing sequence numbers -> sync_gaps (Section 6.3.5)
        if (station.lastSeq > 0 && record.seq > station.lastSeq + 1) {
          await tx.syncGap.create({
            data: {
              stationId: station.id,
              fromSeq: station.lastSeq + 1,
              toSeq: record.seq - 1,
              detectedAt: new Date(),
            },
          });
          this.logger.warn(
            `Sequence gap detected for station ${station.id}: seq ${station.lastSeq + 1} to ${record.seq - 1}`
          );
        }

        // 4.5 Update station sequence and lastSeen
        await tx.station.update({
          where: { id: station.id },
          data: {
            lastSeq: Math.max(station.lastSeq, record.seq),
            lastSeen: new Date(),
          },
        });
      });

      // 5. Queue daily stats refresh (Section 6.3.7)
      await this.stats.queueDailyStatsRefresh(station.customerId, startedAt);

      return {
        recordId: record.recordId,
        status: "accepted",
      };
    } catch (err) {
      this.logger.error(`Error ingesting record ${record.recordId}: ${(err as Error).message}`);
      return {
        recordId: record.recordId,
        status: "rejected",
        reason: (err as Error).message,
      };
    }
  }
}
