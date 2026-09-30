import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface SendOtpResult {
  success: boolean;
  provider: string;
  message: string;
  gatewayNotice?: string;
}

export interface SendCredentialsResult {
  success: boolean;
  message: string;
  gatewayNotice?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  private getResendApiKey(): string | undefined {
    return (
      this.config.get<string>("RESEND_API_KEY") ||
      process.env.RESEND_API_KEY
    );
  }

  private getFromEmail(): string {
    return (
      this.config.get<string>("RESEND_FROM_EMAIL") ||
      process.env.RESEND_FROM_EMAIL ||
      "FCT Platform <onboarding@resend.dev>"
    );
  }

  /**
   * Sends a 6-digit OTP verification email to the customer via Resend.
   */
  async sendOtp(email: string, otp: string, customerName?: string): Promise<SendOtpResult> {
    const apiKey = this.getResendApiKey();
    const from = this.getFromEmail();
    const normalizedEmail = email.trim().toLowerCase();
    const displayName = customerName?.trim() || normalizedEmail.split("@")[0];

    if (!apiKey) {
      this.logger.warn(`[Resend] No RESEND_API_KEY configured. Falling back to dev mode OTP.`);
      return {
        success: false,
        provider: "Dev-Mode",
        message: `Verification OTP generated (Dev Mode). Use ${otp} to verify.`,
        gatewayNotice: "No RESEND_API_KEY found in server configuration. Dev OTP displayed.",
      };
    }

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f6f8; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 540px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 32px 28px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">
                FCT Test Automation
              </h1>
              <p style="margin: 6px 0 0; color: #bfdbfe; font-size: 13px;">
                Customer Account Verification
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 28px;">
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.5; color: #334155;">
                Hello <strong>${displayName}</strong>,
              </p>
              <p style="margin: 0 0 24px; font-size: 14px; line-height: 1.6; color: #475569;">
                A request was made to register your account on the <strong>FCT Automated PCB Testing Platform</strong>. Please use the 6-digit verification code below to complete registration:
              </p>

              <!-- OTP Code Display -->
              <div style="background-color: #f8fafc; border: 2px dashed #93c5fd; border-radius: 12px; padding: 22px; text-align: center; margin-bottom: 24px;">
                <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #1d4ed8; display: inline-block;">
                  ${otp}
                </span>
                <p style="margin: 8px 0 0; font-size: 12px; color: #64748b; font-weight: 500;">
                  ⏳ Code expires in <strong>10 minutes</strong>
                </p>
              </div>

              <!-- Security Information -->
              <div style="background-color: #f1f5f9; border-radius: 8px; padding: 14px; margin-bottom: 20px;">
                <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #475569;">
                  🔒 <strong>Security Notice:</strong> If you did not request this verification, please disregard this email. Never share this code with anyone.
                </p>
              </div>

              <p style="margin: 0; font-size: 13px; color: #64748b;">
                Best regards,<br>
                <strong style="color: #1e293b;">FCT Engineering Team</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 18px 28px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                Automated security message from FCT Test Automation Platform. Please do not reply directly to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    try {
      this.logger.log(`[Resend] Dispatching OTP email to ${normalizedEmail} from ${from}...`);

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [normalizedEmail],
          subject: `${otp} is your FCT Verification Code`,
          html: htmlContent,
        }),
      });

      const data: any = await response.json().catch(() => ({}));

      if (response.ok && data.id) {
        this.logger.log(`✓ Real email successfully delivered via Resend to ${normalizedEmail}! (ID: ${data.id})`);
        return {
          success: true,
          provider: "Resend",
          message: `Verification code successfully emailed to ${normalizedEmail}`,
        };
      }

      // Handle Resend restrictions / errors gracefully
      const errorMessage = data.message || `Resend returned HTTP ${response.status}`;
      this.logger.warn(`[Resend Error] ${errorMessage}`);

      return {
        success: false,
        provider: "Resend",
        message: `Failed to deliver email to ${normalizedEmail}: ${errorMessage}`,
        gatewayNotice: errorMessage,
      };
    } catch (err: any) {
      this.logger.error(`[Resend Exception] ${err?.message || err}`);
      return {
        success: false,
        provider: "Resend",
        message: err?.message || "Failed to communicate with Resend API",
        gatewayNotice: err?.message,
      };
    }
  }

  /**
   * Sends the customer login credentials (Email, Password, Portal Link) via Resend.
   */
  async sendCredentials(
    email: string,
    credentials: {
      name: string;
      email: string;
      password: string;
      product?: string;
      portalUrl?: string;
    },
  ): Promise<SendCredentialsResult> {
    const apiKey = this.getResendApiKey();
    const from = this.getFromEmail();
    const normalizedEmail = email.trim().toLowerCase();
    const portalUrl = credentials.portalUrl || "http://localhost:3000";

    if (!apiKey) {
      return {
        success: false,
        message: "No RESEND_API_KEY configured. Credentials not sent via email.",
      };
    }

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Account Credentials</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6f8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f6f8; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 540px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #0f766e 0%, #0d9488 100%); padding: 32px 28px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700; letter-spacing: 0.5px;">
                Welcome to FCT Platform
              </h1>
              <p style="margin: 6px 0 0; color: #ccfbf1; font-size: 13px;">
                Your Customer Account has been Created
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px 28px;">
              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.5; color: #334155;">
                Hello <strong>${credentials.name}</strong>,
              </p>
              <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #475569;">
                Your customer account for the <strong>FCT Automated PCB Testing Platform</strong> is now active. You can use the credentials below to log in and access your testing telemetry:
              </p>

              <!-- Credentials Box -->
              <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="6">
                  <tr>
                    <td style="font-size: 13px; color: #64748b; width: 120px; font-weight: 600;">Customer Name:</td>
                    <td style="font-size: 13px; color: #0f172a; font-weight: 700;">${credentials.name}</td>
                  </tr>
                  <tr>
                    <td style="font-size: 13px; color: #64748b; font-weight: 600;">Login Email:</td>
                    <td style="font-size: 13px; color: #0f172a; font-family: 'Courier New', monospace; font-weight: 700;">${credentials.email}</td>
                  </tr>
                  <tr>
                    <td style="font-size: 13px; color: #64748b; font-weight: 600;">Initial Password:</td>
                    <td style="font-size: 13px; color: #0f172a; font-family: 'Courier New', monospace; font-weight: 700; background-color: #e2e8f0; padding: 4px 8px; border-radius: 6px; display: inline-block;">${credentials.password}</td>
                  </tr>
                  ${
                    credentials.product
                      ? `<tr>
                    <td style="font-size: 13px; color: #64748b; font-weight: 600;">Product:</td>
                    <td style="font-size: 13px; color: #0f172a; font-weight: 600;">${credentials.product}</td>
                  </tr>`
                      : ""
                  }
                </table>
              </div>

              <!-- Recommendation -->
              <div style="background-color: #fefce8; border: 1px solid #fef08a; border-radius: 8px; padding: 14px; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #854d0e;">
                  🛡️ <strong>Security Tip:</strong> For optimal security, we advise logging in and changing your password after your initial sign-in.
                </p>
              </div>

              <p style="margin: 0; font-size: 13px; color: #64748b;">
                Best regards,<br>
                <strong style="color: #1e293b;">FCT Administrator</strong>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 18px 28px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                FCT Automated Testing Solutions • info@proembsys.in
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    try {
      this.logger.log(`[Resend] Dispatching credentials email to ${normalizedEmail}...`);

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [normalizedEmail],
          subject: "Your FCT Platform Login Credentials",
          html: htmlContent,
        }),
      });

      const data: any = await response.json().catch(() => ({}));

      if (response.ok && data.id) {
        this.logger.log(`✓ Real credentials email successfully sent via Resend to ${normalizedEmail}! (ID: ${data.id})`);
        return {
          success: true,
          message: `Credentials successfully emailed to ${normalizedEmail}`,
        };
      }

      const errorMessage = data.message || `Resend returned HTTP ${response.status}`;
      this.logger.warn(`[Resend Credentials Error] ${errorMessage}`);

      return {
        success: false,
        message: `Failed to deliver credentials email: ${errorMessage}`,
        gatewayNotice: errorMessage,
      };
    } catch (err: any) {
      this.logger.error(`[Resend Exception] ${err?.message || err}`);
      return {
        success: false,
        message: err?.message || "Failed to communicate with Resend API",
        gatewayNotice: err?.message,
      };
    }
  }
}
