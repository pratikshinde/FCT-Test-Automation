import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from "@nestjs/common";
import { AdminOverviewQuerySchema } from "@fct/contracts";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminRoleGuard } from "../auth/admin-role.guard";
import { ZodBody } from "../common/zod-body.decorator";
import { AdminService } from "./admin.service";

@Controller("admin")
@UseGuards(JwtAuthGuard, AdminRoleGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("overview")
  overview(@Query(new ZodBody(AdminOverviewQuerySchema)) query: unknown) {
    return this.admin.getOverview(query as any);
  }

  @Get("customers")
  customers(@Query() query: any) {
    return this.admin.getCustomers(query);
  }

  @Post("customers/send-otp")
  sendCustomerOtp(@Body() body: { email: string; phone?: string; name?: string }) {
    return this.admin.sendOtp(body.email, body.phone, body.name);
  }

  @Post("customers")
  createCustomer(@Body() body: any) {
    return this.admin.createCustomerWithUser(body);
  }

  @Post("customers/:id/send-credentials")
  sendCredentials(@Param("id") id: string, @Body() body: { password?: string }) {
    return this.admin.sendCustomerCredentials(id, body?.password);
  }

  @Delete("customers/:id")
  deleteCustomer(@Param("id") id: string) {
    return this.admin.deleteCustomer(id);
  }

  @Get("customers/:id")
  customerDetail(@Param("id") id: string, @Query() query: any) {
    return this.admin.getCustomerDetail(id, query);
  }

  @Get("boards/:uid")
  boardHistory(@Param("uid") uid: string) {
    return this.admin.getBoardHistory(uid);
  }

  @Get("runs")
  runs(@Query() query: any) {
    return this.admin.getRuns(query);
  }

  @Get("stations")
  stations() {
    return this.admin.getStations();
  }

  @Post("stations")
  createStation(@Body() body: any) {
    return this.admin.createStation(body);
  }

  @Patch("stations/:id")
  updateStation(@Param("id") id: string, @Body() body: any) {
    return this.admin.updateStation(id, body);
  }

  @Get("integrity")
  integrity() {
    return this.admin.getIntegrity();
  }
}
