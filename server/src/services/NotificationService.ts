import nodemailer from 'nodemailer';
import { config } from '../config';
import { logger } from '../utils/logger';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;
  if (!config.smtp.host) {
    logger.warn('SMTP not configured, email notifications disabled');
    return null;
  }
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
  return transporter;
}

export class NotificationService {
  static async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    const t = getTransporter();
    if (!t) return false;
    try {
      await t.sendMail({ from: config.smtp.from, to, subject, html });
      logger.info(`Email sent to ${to}: ${subject}`);
      return true;
    } catch (error) {
      logger.error(`Failed to send email to ${to}:`, error);
      return false;
    }
  }

  static async sendPasswordReset(email: string, resetToken: string): Promise<boolean> {
    const resetUrl = `${config.appUrl}/reset-password?token=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(email)}`;
    const html = `
      <h2>Password Reset</h2>
      <p>Click the link below to reset your password:</p>
      <p><a href="${resetUrl}">Reset Password</a></p>
      <p>This link expires in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `;
    return this.sendEmail(email, 'Password Reset', html);
  }

  static async sendWelcome(email: string, name: string): Promise<void> {
    const html = `
      <h2>Welcome to Nexora!</h2>
      <p>Hello ${name},</p>
      <p>Your account has been created successfully.</p>
      <p>You can now log in and start managing your virtual machines.</p>
    `;
    await this.sendEmail(email, 'Welcome to Nexora', html);
  }

  static async sendInvoice(email: string, invoiceId: string, amount: number): Promise<void> {
    const html = `
      <h2>Invoice #${invoiceId}</h2>
      <p>Amount: $${amount}</p>
      <p>Please pay by the due date to avoid service interruption.</p>
    `;
    await this.sendEmail(email, `Invoice #${invoiceId}`, html);
  }

  static async sendAlert(email: string, alertName: string, message: string): Promise<void> {
    const html = `
      <h2>Alert: ${alertName}</h2>
      <p>${message}</p>
    `;
    await this.sendEmail(email, `Alert: ${alertName}`, html);
  }
}
