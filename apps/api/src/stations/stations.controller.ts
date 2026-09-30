import { Controller, Get, UseGuards, Req } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { StationsService } from "./stations.service";

@Controller("stations")
@UseGuards(JwtAuthGuard)
export class StationsController {
  constructor(private readonly stations: StationsService) {}

  @Get()
  async listStations(@Req() req: any) {
    return this.stations.listStations(req.user);
  }
}
