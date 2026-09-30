import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { AuditModule } from "./audit/audit.module";
import { StatsModule } from "./stats/stats.module";
import { IngestModule } from "./ingest/ingest.module";
import { StationsModule } from "./stations/stations.module";
import { BoardsModule } from "./boards/boards.module";
import { UsersModule } from "./users/users.module";
import { AdminModule } from "./admin/admin.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "apps/api/.env", "../api/.env"],
    }),
    PrismaModule,
    AuditModule,
    StatsModule,
    AuthModule,
    IngestModule,
    StationsModule,
    BoardsModule,
    UsersModule,
    AdminModule,
  ],
})
export class AppModule {}
