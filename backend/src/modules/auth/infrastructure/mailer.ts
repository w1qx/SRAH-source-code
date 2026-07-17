import fs from 'fs';
import nodemailer from 'nodemailer';
import { logger } from '@/shared/logger';

/**
 * Delivery of the OTP email, behind an interface like everything else external.
 *
 * ConsoleMailer prints the code to the terminal in development, so the flow is testable
 * with no email provider account. It refuses to do that in production — a code on stdout is
 * a code in the logs.
 */
export interface Mailer {
  sendOtp(params: { to: string; code: string; expiresInMinutes: number }): Promise<void>;
}

export class ConsoleMailer implements Mailer {
  constructor(private readonly nodeEnv: string) {}

  async sendOtp(params: { to: string; code: string; expiresInMinutes: number }): Promise<void> {
    if (this.nodeEnv === 'production') {
      throw new Error(
        'ConsoleMailer must never run in production — it would print OTP codes to the logs. Set MAIL_TRANSPORT=smtp.',
      );
    }

    try {
      fs.writeFileSync('/Users/w/Documents/Sarat-backend/otp.txt', params.code);
    } catch (e) {
      // ignore
    }

    // eslint-disable-next-line no-console
    console.log(
      `\n  ✉️  Suraa OTP for ${params.to}: ${params.code}  (valid ${params.expiresInMinutes} min)\n`,
    );
  }
}

export class SmtpMailer implements Mailer {
  private readonly transport: nodemailer.Transporter;

  constructor(
    config: { host: string; port: number; user?: string; password?: string },
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: config.user && config.password ? { user: config.user, pass: config.password } : undefined,
    });
  }

  async sendOtp(params: { to: string; code: string; expiresInMinutes: number }): Promise<void> {
    const htmlBody = `
      <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5efeb; padding: 45px 20px; text-align: center;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 28px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.04); border: 1px solid #e8ddd5;">
          <!-- Header -->
          <div style="background-color: #fdfcfb; padding: 30px 20px; text-align: center; border-bottom: 1px solid #f0e9e2; line-height: 1;">
            <div style="display: inline-block; vertical-align: middle; text-align: center;">
              <img src="https://srah.site/logo_srah.png" alt="سراة" style="height: 38px; width: auto; vertical-align: middle; display: inline-block;" /> 
              <span style="font-weight: 300; font-size: 16px; color: #111111; opacity: 0.3; margin: 0 16px; vertical-align: middle; display: inline-block;">|</span> 
              <span style="font-size: 16px; font-weight: 600; color: #111111; opacity: 0.9; vertical-align: middle; display: inline-block; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">أكاديمية طويق</span>
            </div>
          </div>
          <!-- Content -->
          <div style="padding: 45px 35px; text-align: center;">
            <h2 style="color: #111111; font-size: 22px; margin-top: 0; margin-bottom: 16px; font-weight: bold;">رمز الدخول الخاص بك</h2>
            <p style="color: #666666; font-size: 14px; line-height: 1.6; margin-bottom: 35px; max-width: 360px; margin-left: auto; margin-right: auto;">استخدم هذا الرمز لإتمام عملية تسجيل الدخول الآمن إلى منصة سراة.</p>
            
            <!-- Code Box -->
            <div style="background-color: #fdfcfb; border: 2px dashed #00897b; border-radius: 20px; padding: 25px; margin-bottom: 35px; display: inline-block; min-width: 220px;">
              <span style="font-family: 'Courier New', Courier, monospace; font-size: 38px; font-weight: 800; color: #111111; letter-spacing: 6px; display: block; text-align: center;">${params.code}</span>
            </div>
            
            <p style="color: #888888; font-size: 13px; margin-bottom: 8px;">هذا الرمز صالح للاستخدام لمدة <strong style="color: #111111;">${params.expiresInMinutes} دقائق</strong>.</p>
            <p style="color: #aaaaaa; font-size: 11px; max-width: 300px; margin: 0 auto; line-height: 1.5;">إذا لم تطلب هذا الرمز، فيرجى تجاهل هذه الرسالة بأمان.</p>
          </div>
          <!-- Footer -->
          <div style="background-color: #fdfcfb; padding: 22px; text-align: center; border-top: 1px solid #f0e9e2;">
            <p style="color: #999999; font-size: 11px; margin: 0;">&copy; 2026 منصة سراة (Srah). جميع الحقوق محفوظة.</p>
          </div>
        </div>
      </div>
    `;

    await this.transport.sendMail({
      from: this.from,
      to: params.to,
      subject: `رمز الدخول إلى سراة: ${params.code}`,
      text: [
        `رمز الدخول الخاص بك: ${params.code}`,
        `صالح لمدة ${params.expiresInMinutes} دقائق.`,
        '',
        'إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة.',
      ].join('\n'),
      html: htmlBody,
    });

    // The recipient, never the code.
    logger.info('OTP email sent', { to: params.to });
  }
}
