import { Controller, Post, Body, UseGuards, Req } from "@nestjs/common";
import { IngestRequestSchema } from "@fct/contracts";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ZodBody } from "../common/zod-body.decorator";
import { IngestService } from "./ingest.service";

@Controller("ingest")
@UseGuards(JwtAuthGuard)
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  @Post("runs")
  async ingestRuns(
    @Body(new ZodBody(IngestRequestSchema)) body: any,
    @Req() req: any
  ) {
    return this.ingest.ingestRuns(body, req.user);
  }
}
