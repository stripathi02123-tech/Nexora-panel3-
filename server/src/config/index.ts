import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

function requiredSecret(name: string, fallback: string, minLength: number): string {
  const value = process.env[name]?.trim() || '';
  if (!value) {
    if (isProduction) {
      throw new Error(`${name} must be set in production`);
    }
    return fallback;
  }
  if (value.length < minLength) {
    throw new Error(`${name} must be at least ${minLength} characters`);
  }
  return value;
}

const appUrl = process.env.APP_URL?.trim() || (isProduction ? '' : 'http://localhost:3000');
if (isProduction && !appUrl) {
  throw new Error('APP_URL must be set in production');
}

const rawCorsOrigin = process.env.CORS_ORIGIN?.trim() || (isProduction ? appUrl : '*');
const corsOrigins = rawCorsOrigin
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv,
  jwtSecret: requiredSecret('JWT_SECRET', 'development-jwt-secret-change-me-please', 32),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'noreply@example.com',
  },
  appUrl,
  proxmoxTimeout: parseInt(process.env.PROXMOX_TIMEOUT || '30000', 10),
  dockerTimeout: parseInt(process.env.DOCKER_TIMEOUT || '30000', 10),
  encryptionKey: requiredSecret('ENCRYPTION_KEY', 'development-encryption-key-change-me-please', 32),
  corsOrigin: rawCorsOrigin,
  corsOrigins,
  licenseRequired: process.env.LICENSE_REQUIRED === 'true',
  licenseServerUrl: process.env.LICENSE_SERVER_URL || 'http://localhost:8080',
};
