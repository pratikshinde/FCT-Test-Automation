import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { JwtPayload } from "../auth/jwt.strategy";

@Injectable()
export class StationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List stations available to caller, enforcing customer data separation (Section 6.6).
   */
  async listStations(user: JwtPayload) {
    const where =
      user.role === "ADMIN"
        ? {}
        : { customerId: user.customerId ?? "no-customer" };

    return this.prisma.station.findMany({
      where,
      orderBy: { id: "asc" },
      include: {
        customer: {
          select: { id: true, name: true },
        },
      },
    });
  }
}
