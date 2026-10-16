import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

export function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(String(b ?? ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [alg, salt, key] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !key) return false;
  const derived = await scrypt(password, Buffer.from(salt, 'base64'), 64, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(derived, Buffer.from(key, 'base64'));
}

/** Human-friendly unique references, e.g. CC-7KQ4-M9TX (no 0/O/1/I ambiguity). */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function reference(prefix) {
  const bytes = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return `${prefix}-${s.slice(0, 4)}-${s.slice(4)}`;
}

// Symmetric sealing for secrets we must be able to show again (private links in emails).
import { config } from '../config.js';
const sealKey = () => crypto.createHash('sha256').update('seal:' + config.sessionSecret).digest();

export function seal(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', sealKey(), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map(b => b.toString('base64url')).join('.');
}

export function unseal(sealed) {
  try {
    const [iv, tag, enc] = String(sealed).split('.').map(s => Buffer.from(s, 'base64url'));
    const d = crypto.createDecipheriv('aes-256-gcm', sealKey(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch { return null; }
}
