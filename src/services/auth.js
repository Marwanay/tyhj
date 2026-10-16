// Admin authentication: scrypt passwords, server-side sessions, per-session CSRF tokens,
// and login throttling persisted in the database (so it holds across serverless instances).
import { one, run } from '../db.js';
import { hashPassword, verifyPassword, randomToken, sha256 } from '../lib/security.js';

export const ADMIN_COOKIE = 'cc_admin';
const SESSION_TTL = 12 * 3600_000;
const MAX_ATTEMPTS = 6, WINDOW = 15 * 60_000;

export async function createAdmin({ email, name, password, role = 'staff' }) {
  if (!password || password.length < 12) throw new Error('Password must be at least 12 characters.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())) throw new Error('Please enter a valid email address.');
  const hash = await hashPassword(password);
  await run('INSERT INTO admins (email, name, password_hash, role) VALUES (?, ?, ?, ?)', email.trim().toLowerCase(), name || '', hash, role);
}

export async function setPassword(adminId, password) {
  if (!password || password.length < 12) throw new Error('Password must be at least 12 characters.');
  await run('UPDATE admins SET password_hash = ? WHERE id = ?', await hashPassword(password), adminId);
  await run('DELETE FROM admin_sessions WHERE admin_id = ?', adminId);
}

async function throttled(key) {
  const row = await one('SELECT * FROM login_attempts WHERE key = ?', key);
  return row && Date.now() - row.window_start < WINDOW && row.count >= MAX_ATTEMPTS;
}
async function recordFailure(key) {
  // Start a new window if the old one has passed, otherwise count the attempt.
  await run(`INSERT INTO login_attempts (key, count, window_start) VALUES (?, 1, ?)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN login_attempts.window_start < ? THEN 1 ELSE login_attempts.count + 1 END,
      window_start = CASE WHEN login_attempts.window_start < ? THEN excluded.window_start ELSE login_attempts.window_start END`,
  key, Date.now(), Date.now() - WINDOW, Date.now() - WINDOW);
}

// A fixed hash so unknown emails take as long as wrong passwords.
const DUMMY = 'scrypt$c2FsdHNhbHRzYWx0c2FsdA==$' + Buffer.alloc(64).toString('base64');

export async function login(email, password, ip) {
  const e = String(email || '').trim().toLowerCase();
  const keys = [`ip:${ip}`, `email:${e}`];
  for (const k of keys) if (await throttled(k)) return { error: 'Too many attempts. Please wait 15 minutes and try again.' };
  const admin = await one('SELECT * FROM admins WHERE email = ?', e);
  const ok = await verifyPassword(String(password || ''), admin?.password_hash || DUMMY);
  if (!admin || !ok) { for (const k of keys) await recordFailure(k); return { error: 'That email and password do not match.' }; }
  for (const k of keys) await run('DELETE FROM login_attempts WHERE key = ?', k);
  const token = randomToken(32);
  await run('INSERT INTO admin_sessions (id_hash, admin_id, csrf, expires_at) VALUES (?, ?, ?, ?)', sha256(token), admin.id, randomToken(24), Date.now() + SESSION_TTL);
  await run('UPDATE admins SET last_login_at = now() WHERE id = ?', admin.id);
  await run('DELETE FROM admin_sessions WHERE expires_at < ?', Date.now());
  return { token };
}

export async function sessionFor(token) {
  if (!token || typeof token !== 'string') return null;
  const s = await one(`SELECT s.*, a.email, a.name, a.role FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
                 WHERE s.id_hash = ? AND s.expires_at > ?`, sha256(token), Date.now());
  if (!s) return null;
  // Sliding expiry, refreshed at most every 10 minutes.
  if (s.expires_at - Date.now() < SESSION_TTL - 600_000) await run('UPDATE admin_sessions SET expires_at = ? WHERE id_hash = ?', Date.now() + SESSION_TTL, s.id_hash);
  return { id: s.admin_id, email: s.email, name: s.name, role: s.role, csrf: s.csrf, idHash: s.id_hash };
}

export const logout = (session) => run('DELETE FROM admin_sessions WHERE id_hash = ?', session.idHash);
export const adminCount = async () => (await one('SELECT COUNT(*)::int AS n FROM admins')).n;
