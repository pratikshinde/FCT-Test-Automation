import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { SmsService } from "../common/sms.service";
import { EmailService } from "../common/email.service";

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminService, SmsService, EmailService],
})
export class AdminModule {}
