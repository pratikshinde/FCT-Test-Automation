import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

export interface JwtPayload {
  sub: string;
  email: string;
  role: "ADMIN" | "CUSTOMER_SUPERVISOR" | "OPERATOR";
  customerId: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      // The admin site's Next.js server holds the token in an httpOnly cookie on its
      // own domain and forwards it as a Bearer header on server-to-server calls — the
      // browser never talks to this API directly, so only the header extractor is needed.
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? "dev-secret-change-me",
    });
  }

  validate(payload: JwtPayload) {
    return payload;
  }
}
