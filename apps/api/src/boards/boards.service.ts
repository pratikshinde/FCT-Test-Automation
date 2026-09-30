import { Injectable, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { BoardAttemptsResponse } from "@fct/contracts";
import type { JwtPayload } from "../auth/jwt.strategy";

const MAX_ATTEMPTS = 3; // 1 initial test + max 2 retests (OPS-080)

@Injectable()
export class BoardsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves attempt count for a board UID prior to LOAD (planner Section 4.1 & 6.5).
   * Enforces customer data isolation (Section 6.6) and retest limit (OPS-080).
   */
  async getAttempts(
    uid: string,
    user: JwtPayload
  ): Promise<BoardAttemptsResponse> {
    const board = await this.prisma.board.findUnique({
      where: { uid },
    });

    if (!board) {
      return {
        uid,
        variant: null,
        attemptCount: 0,
        lastVerdict: null,
        retestAllowed: true,
      };
    }

    if (user.role !== "ADMIN" && board.firstCustomerId !== user.customerId) {
      throw new ForbiddenException("Board belongs to another customer");
    }

    const retestAllowed = board.attemptCount < MAX_ATTEMPTS;

    return {
      uid: board.uid,
      variant: board.variant,
      attemptCount: board.attemptCount,
      lastVerdict: board.lastVerdict,
      retestAllowed,
    };
  }
}
