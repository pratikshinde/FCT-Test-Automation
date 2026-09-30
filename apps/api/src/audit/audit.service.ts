import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Audit log recording service — planner.md Section 6.1 & 6.2.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(actor: string, action: string, target: string, details?: Record<string, unknown>) {
    return this.prisma.auditLog.create({
      data: {
        actor,
        action,
        target,
        details: details ? (details as any) : undefined,
      },
    });
  }
}
