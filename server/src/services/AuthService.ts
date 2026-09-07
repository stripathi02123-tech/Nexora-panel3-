import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../utils/database';
import { config } from '../config';
import { logger } from '../utils/logger';
import { generateApiKey } from '../utils/helpers';
import { NotificationService } from './NotificationService';

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = input.toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
  let bits = '';
  for (const char of normalized) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error('Invalid 2FA secret');
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function verifyTotp(secret: string, token: string): boolean {
  const cleanToken = String(token || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleanToken)) return false;

  const key = base32Decode(secret);
  const currentCounter = Math.floor(Date.now() / 1000 / 30);

  for (let offset = -1; offset <= 1; offset += 1) {
    const counter = currentCounter + offset;
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));
    const digest = crypto.createHmac('sha1', key).update(counterBuffer).digest();
    const index = digest[digest.length - 1] & 0x0f;
    const binary = ((digest[index] & 0x7f) << 24)
      | ((digest[index + 1] & 0xff) << 16)
      | ((digest[index + 2] & 0xff) << 8)
      | (digest[index + 3] & 0xff);
    const expected = String(binary % 1_000_000).padStart(6, '0');
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(cleanToken))) return true;
  }
  return false;
}

export interface LoginResult {
  user: { id: string; email: string; name: string; role: string; isActive: boolean };
  token?: string;
  requires2FA: boolean;
  challengeUserId?: string;
}

export class AuthService {
  static async register(email: string, password: string, name: string): Promise<any> {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new Error('Email already registered');

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
    });

    const token = this.generateToken(user);
    return { user, token };
  }

  static async login(email: string, password: string): Promise<LoginResult> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error('Invalid credentials');
    if (!user.isActive) throw new Error('Account is disabled');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new Error('Invalid credentials');

    const safeUser = { id: user.id, email: user.email, name: user.name, role: user.role, isActive: user.isActive };
    if (user.twoFactorSecret) {
      return { user: safeUser, requires2FA: true, challengeUserId: user.id };
    }

    return { user: safeUser, token: this.generateToken(user), requires2FA: false };
  }

  static async verify2FA(userId: string, token: string): Promise<any> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorSecret) throw new Error('2FA not configured');
    if (!user.isActive) throw new Error('Account is disabled');
    if (!verifyTotp(user.twoFactorSecret, token)) throw new Error('Invalid 2FA token');

    return {
      token: this.generateToken(user),
      user: { id: user.id, email: user.email, name: user.name, role: user.role, isActive: user.isActive },
    };
  }

  static async forgotPassword(email: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) return;

    const resetToken = jwt.sign(
      { sub: user.id, email: user.email, purpose: 'password-reset' },
      user.password,
      { expiresIn: '1h' },
    );

    const sent = await NotificationService.sendPasswordReset(user.email, resetToken);
    if (!sent) logger.warn(`Password reset email could not be sent to ${user.email}; SMTP is not configured or failed`);
  }

  static async resetPassword(email: string, token: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) throw new Error('Invalid or expired reset token');

    try {
      const payload = jwt.verify(token, user.password) as { sub?: string; email?: string; purpose?: string };
      if (payload.purpose !== 'password-reset' || payload.sub !== user.id || payload.email !== user.email) {
        throw new Error('Invalid reset token');
      }
    } catch {
      throw new Error('Invalid or expired reset token');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashedPassword } });
  }

  static async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');
    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw new Error('Current password is incorrect');
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { password: hashedPassword } });
  }

  static async generateApiKey(userId: string, name: string, permissions: string = 'read'): Promise<any> {
    const key = generateApiKey();
    const apiKey = await prisma.apiKey.create({ data: { key, userId, name, permissions } });
    return apiKey;
  }

  static async revokeApiKey(userId: string, keyId: string): Promise<void> {
    const apiKey = await prisma.apiKey.findFirst({ where: { id: keyId, userId } });
    if (!apiKey) throw new Error('API key not found');
    await prisma.apiKey.delete({ where: { id: keyId } });
  }

  static async listApiKeys(userId: string): Promise<any[]> {
    return prisma.apiKey.findMany({
      where: { userId },
      select: { id: true, name: true, permissions: true, lastUsed: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private static generateToken(user: any): string {
    return jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn as any },
    );
  }
}
