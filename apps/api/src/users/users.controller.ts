import { Controller, Get, Post, Body, Query, UseGuards, Req } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { UsersService } from "./users.service";

@Controller("me")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async getMe(@Req() req: any) {
    return this.users.getMe(req.user.sub);
  }

  @Get("dashboard")
  async getCustomerDashboard(@Req() req: any) {
    return this.users.getCustomerDashboard(req.user.sub);
  }

  @Get("runs")
  async getCustomerRuns(@Req() req: any, @Query() query: any) {
    return this.users.getCustomerRuns(req.user.sub, query);
  }

  @Post("execute-test")
  async executeTestRun(@Req() req: any, @Body() body: any) {
    try {
      return await this.users.executeTestRun(req.user.sub, body);
    } catch (err: any) {
      return { ok: false, error: err.message, stack: err.stack };
    }
  }
}
