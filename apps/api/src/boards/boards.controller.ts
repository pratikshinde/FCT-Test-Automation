import { Controller, Get, Param, UseGuards, Req } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { BoardsService } from "./boards.service";

@Controller("boards")
@UseGuards(JwtAuthGuard)
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Get(":uid/attempts")
  async getAttempts(@Param("uid") uid: string, @Req() req: any) {
    return this.boards.getAttempts(uid, req.user);
  }
}
