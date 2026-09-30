import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { JwtPayload } from "./jwt.strategy";

/** Run after JwtAuthGuard — requires the authenticated user to be an ADMIN. */
@Injectable()
export class AdminRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;
    if (user?.role !== "ADMIN") {
      throw new ForbiddenException("Admin access required");
    }
    return true;
  }
}
