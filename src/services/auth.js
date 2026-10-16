// Admin authentication: scrypt passwords, server-side sessions, per-session CSRF tokens,
// and login throttling persisted in the database.
import { one, run } from '../db.js';
import { hashPassword, verifyPassword, randomToken, sha256 } from '../lib/security.js';

export const ADMIN_COOKIE = 'cc_admin';
const SESSION_TTL = 12 * 3600_000;
const MAX_ATTEMPTS = 6, WINDOW = 15 * 60_000;

export async function createAdmin({ email, name, password, role = 'staff' }) {
  if (!password || password.length < 12) throw new Error('Password must be at least 12 characters.');
  const hash = await hashPassword(password);
  run('INSERT INTO admins (email, name, password_hash, role) VALUES (?, ?, ?, ?)', email.trim().toLowerCase(), name || '', hash, role);
}

export async function setPassword(adminId, password) {
  if (!password || password.length < 12) throw new Error('Password must be at least 12 characters.');
  run('UPDATE admins SET password_hash = ? WHERE id = ?', await hashPassword(password), adminId);
  run('DELETE FROM admin_sessions WHERE admin_id = ?', adminId);
}

function throttled(key) {
  const row = one('SELECT * FROM login_attempts WHERE key = ?', key);
  return row && Date.now() - row.window_start < WINDOW && row.count >= MAX_ATTEMPTS;
}
function recordFailure(key) {
  const row = one('SELECT * FROM login_attempts WHERE key = ?', key);
  if (!row || Date.now() - row.window_start >= WINDOW) {
    run('INSERT OR REPLACE INTO login_attempts (key, count, window_start) VALUES (?, 1, ?)', key, Date.now());
  } else run('UPDATE login_attempts SET count = count + 1 WHERE key = ?', key);
}

// A fixed hash so unknown emails take as long as wrong passwords.
const DUMMY = 'scrypt$c2FsdHNhbHRzYWx0c2FsdA==$' + Buffer.alloc(64).toString('base64');

export async function login(email, password, ip) {
  const e = String(email || '').trim().toLowerCase();
  const keys = [`ip:${ip}`, `email:${e}`];
  if (keys.some(throttled)) return { error: 'Too many attempts. Please wait 15 minutes and try again.' };
  const admin = one('SELECT * FROM admins WHERE email = ?', e);
  const ok = await verifyPassword(String(password || ''), admin?.password_hash || DUMMY);
  if (!admin || !ok) { keys.forEach(recordFailure); return { error: 'That email and password do not match.' }; }
  keys.forEach(k => run('DELETE FROM login_attempts WHERE key = ?', k));
  const token = randomToken(32);
  run('INSERT INTO admin_sessions (id_hash, admin_id, csrf, expires_at) VALUES (?, ?, ?, ?)', sha256(token), admin.id, randomToken(24), Date.now() + SESSION_TTL);
  run("UPDATE admins SET last_login_at = datetime('now') WHERE id = ?", admin.id);
  run('DELETE FROM admin_sessions WHERE expires_at < ?', Date.now());
  return { token };
}

export function sessionFor(token) {
  if (!token) return null;
  const s = one(`SELECT s.*, a.email, a.name, a.role FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
                 WHERE s.id_hash = ? AND s.expires_at > ?`, sha256(token), Date.now());
  if (!s) return null;
  // Sliding expiry, refreshed at most every 10 minutes.
  if (s.expires_at - Date.now() < SESSION_TTL - 600_000) run('UPDATE admin_sessions SET expires_at = ? WHERE id_hash = ?', Date.now() + SESSION_TTL, s.id_hash);
  return { id: s.admin_id, email: s.email, name: s.name, role: s.role, csrf: s.csrf, idHash: s.id_hash };
}

export const logout = (session) => run('DELETE FROM admin_sessions WHERE id_hash = ?', session.idHash);
export const adminCount = () => one('SELECT COUNT(*) AS n FROM admins').n;
