import { Body, Controller, Post } from "@nestjs/common";
import { LoginRequestSchema } from "@fct/contracts";
import { ZodBody } from "../common/zod-body.decorator";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  login(@Body(new ZodBody(LoginRequestSchema)) body: unknown) {
    return this.auth.login(body as any);
  }
}
