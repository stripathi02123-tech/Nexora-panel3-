import crypto from 'crypto';

export function generatePassword(length: number = 16): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset[crypto.randomInt(0, charset.length)];
  }
  return password;
}

export function generateApiKey(): string {
  return `nexora_${crypto.randomBytes(32).toString('hex')}`;
}

export function validateIP(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){1,7}[0-9a-fA-F]{0,4}$/;
  if (!ipv4Regex.test(ip) && !ipv6Regex.test(ip)) return false;
  if (ipv4Regex.test(ip)) {
    const parts = ip.split('.').map(Number);
    return parts.every((p) => p >= 0 && p <= 255);
  }
  return true;
}

export function validateMAC(mac: string): boolean {
  return /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(mac);
}

export function calculateUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.join(' ') || '0m';
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function keyFromSecret(key: string): Buffer {
  return crypto.createHash('sha256').update(key, 'utf8').digest();
}

export function encrypt(text: string, key: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFromSecret(key), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decrypt(encryptedText: string, key: string): string {
  const parts = String(encryptedText || '').split(':');

  // Current authenticated format.
  if (parts.length === 4 && parts[0] === 'v2') {
    const [, ivHex, tagHex, encryptedHex] = parts;
    if (!ivHex || !tagHex || !encryptedHex) throw new Error('Invalid encrypted value');
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyFromSecret(key), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  // Legacy AES-256-CBC format for existing database values.
  if (parts.length === 2) {
    const [ivHex, encrypted] = parts;
    const decipher = crypto.createDecipheriv('aes-256-cbc', keyFromSecret(key), Buffer.from(ivHex, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  throw new Error('Invalid encrypted value');
}

// Returns true when a stored credential value matches one of decrypt()'s
// known ciphertext formats (current "v2:iv:tag:data" or legacy "iv:data").
// Used to distinguish "this is ciphertext that failed to decrypt (wrong
// ENCRYPTION_KEY / corruption)" from "this is a pre-encryption plaintext
// value kept for backward compatibility" — those two cases must never be
// treated the same way, since silently using undecryptable ciphertext as a
// literal secret would send garbage bytes to the Node Agent as if it were
// the real NODE_SECRET.
export function looksEncrypted(value: string): boolean {
  const parts = String(value || '').split(':');
  if (parts.length === 4 && parts[0] === 'v2') {
    const [, ivHex, tagHex, dataHex] = parts;
    return /^[0-9a-f]+$/i.test(ivHex) && /^[0-9a-f]+$/i.test(tagHex) && /^[0-9a-f]+$/i.test(dataHex);
  }
  if (parts.length === 2) {
    const [ivHex, dataHex] = parts;
    return /^[0-9a-f]+$/i.test(ivHex) && /^[0-9a-f]+$/i.test(dataHex);
  }
  return false;
}

// Safely resolve a stored node credential to its usable secret value.
// Throws a specific, non-leaky error if the value is clearly ciphertext but
// cannot be decrypted with the current ENCRYPTION_KEY (e.g. the key changed
// after the node was created) — it NEVER returns raw ciphertext.
export function decryptNodeSecret(credentials: string, key: string): string {
  const value = String(credentials || '');
  if (!looksEncrypted(value)) {
    // Not in any known encrypted format — treat as legacy plaintext,
    // preserved only for nodes created before credential encryption existed.
    return value;
  }
  try {
    return decrypt(value, key);
  } catch {
    throw new Error('AGENT credentials could not be decrypted. Verify ENCRYPTION_KEY.');
  }
}

export function parsePortMapping(ports: string): Array<{ hostPort: number; containerPort: number; protocol: string }> {
  const result: Array<{ hostPort: number; containerPort: number; protocol: string }> = [];
  if (!ports) return result;
  for (const entry of ports.split(',')) {
    const match = entry.trim().match(/^(\d+):(\d+)\/(tcp|udp)$/);
    if (match) {
      result.push({ hostPort: parseInt(match[1], 10), containerPort: parseInt(match[2], 10), protocol: match[3] });
    }
  }
  return result;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function paginate(page: number = 1, limit: number = 25): { skip: number; take: number } {
  const p = Math.max(1, page);
  const l = Math.min(Math.max(1, limit), 100);
  return { skip: (p - 1) * l, take: l };
}
