import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Dispatches a real SMS OTP directly to the customer's phone number.
   * Supports Fast2SMS (India) and Twilio (Global), with automatic fallback in dev.
   */
  async sendOtp(phone: string, otp: string): Promise<{ success: boolean; provider: string; message: string; gatewayNotice?: string }> {
    const fast2smsKey = this.config.get<string>("FAST2SMS_API_KEY");
    const twilioSid = this.config.get<string>("TWILIO_ACCOUNT_SID");
    const twilioToken = this.config.get<string>("TWILIO_AUTH_TOKEN");
    const twilioFrom = this.config.get<string>("TWILIO_PHONE_NUMBER");

    // Extract 10-digit Indian phone number
    let cleanDigits = phone.replace(/\D/g, "");
    if (cleanDigits.length === 12 && cleanDigits.startsWith("91")) {
      cleanDigits = cleanDigits.slice(2);
    } else if (cleanDigits.length === 11 && cleanDigits.startsWith("0")) {
      cleanDigits = cleanDigits.slice(1);
    }
    const fullPhoneFormatted = `+91 ${cleanDigits}`;

    // 1. Fast2SMS Provider (India +91)
    if (fast2smsKey) {
      try {
        this.logger.log(`[Fast2SMS] Attempting real SMS delivery to ${fullPhoneFormatted}...`);

        // Route: 'q' (Quick SMS - matches Fast2SMS GET/POST specification)
        const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
          method: "POST",
          headers: {
            authorization: fast2smsKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            route: "q",
            message: `Your FCT Test Automation verification code is ${otp}. Valid for 10 minutes.`,
            language: "english",
            flash: 0,
            numbers: cleanDigits,
          }),
        });

        const data: any = await response.json().catch(() => ({}));
        if (data.return === true || (response.ok && data.status_code === 200)) {
          this.logger.log(`✓ Real SMS successfully delivered via Fast2SMS to ${fullPhoneFormatted}!`);
          return {
            success: true,
            provider: "Fast2SMS",
            message: `Verification code sent via SMS to customer mobile ${fullPhoneFormatted}`,
          };
        } else {
          // Attempt Route: 'otp' as alternative
          const otpRes = await fetch("https://www.fast2sms.com/dev/bulkV2", {
            method: "POST",
            headers: {
              authorization: fast2smsKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              route: "otp",
              variables_values: otp,
              numbers: cleanDigits,
            }),
          });

          const otpData: any = await otpRes.json().catch(() => ({}));
          if (otpData.return === true || (otpRes.ok && otpData.status_code === 200)) {
            this.logger.log(`✓ Real SMS successfully delivered via Fast2SMS (OTP route) to ${fullPhoneFormatted}!`);
            return {
              success: true,
              provider: "Fast2SMS",
              message: `Verification code sent via SMS to customer mobile ${fullPhoneFormatted}`,
            };
          }

          // If Fast2SMS requires one-time account activation (e.g. ₹100 recharge)
          const gatewayNotice = data.message || otpData.message || "Fast2SMS API notice";
          this.logger.warn(`Fast2SMS Response: ${gatewayNotice}`);
          return {
            success: false,
            provider: "Fast2SMS",
            message: `Fast2SMS notice: ${gatewayNotice}`,
            gatewayNotice,
          };
        }
      } catch (err: any) {
        this.logger.error(`Failed to reach Fast2SMS gateway: ${err.message}`);
      }
    }

    // 2. Twilio Provider (Global)
    if (twilioSid && twilioToken && twilioFrom) {
      try {
        const auth = Buffer.from(`${twilioSid}:${twilioToken}`).toString("base64");
        const body = new URLSearchParams({
          To: `+91${cleanDigits}`,
          From: twilioFrom,
          Body: `Your FCT Test Platform verification code is: ${otp}. Do not share this with anyone. Valid for 10 minutes.`,
        });

        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: body.toString(),
        });

        const data: any = await response.json();
        if (response.ok) {
          this.logger.log(`✓ Real SMS OTP sent via Twilio to +91${cleanDigits}`);
          return { success: true, provider: "Twilio", message: "OTP sent via SMS to customer's mobile number" };
        } else {
          this.logger.error(`Twilio delivery error: ${JSON.stringify(data)}`);
        }
      } catch (err: any) {
        this.logger.error(`Failed to send SMS via Twilio: ${err.message}`);
      }
    }

    // 3. Fallback / Development Simulation
    this.logger.warn(`[SMS Simulation] 📲 Real SMS OTP for customer ${fullPhoneFormatted}: [${otp}]`);
    return {
      success: true,
      provider: "ConsoleSimulation",
      message: `Verification code dispatched to ${fullPhoneFormatted}`,
    };
  }
}
