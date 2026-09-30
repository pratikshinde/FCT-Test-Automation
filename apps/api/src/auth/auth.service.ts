import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import type { LoginRequest, LoginResponse } from "@fct/contracts";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login({ email, password }: LoginRequest): Promise<LoginResponse> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("Invalid email or password");
    }

    // Shared login for every client (planner.md 6.5) — which roles may actually use
    // a given client is that client's own decision (see AdminRoleGuard for the admin
    // site's real per-request enforcement; the admin login action also gates by role
    // client-side for a clean error message).
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
      customerId: user.customerId,
    });

    return {
      accessToken,
      user: { id: user.id, email: user.email, role: user.role, customerId: user.customerId },
    };
  }
}
