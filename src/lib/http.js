// Small HTTP helpers: cookies, origin checks, rate limiting, security headers.
import { config } from '../config.js';

export function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore malformed */ }
  }
  return out;
}

export function setCookie(res, name, value, { maxAge, httpOnly = true, path = '/', sameSite = 'Lax' } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  if (httpOnly) parts.push('HttpOnly');
  if (config.baseUrl.startsWith('https://')) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

export const wantsJson = (req) => (req.get('accept') || '').includes('application/json');

/**
 * CSRF defence for cookie-backed POSTs: browsers send Origin on cross-site form posts,
 * so reject any POST whose Origin (or Referer) is not this site.
 */
export function sameOrigin(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const origin = req.get('origin') || (req.get('referer') ? new URL(req.get('referer')).origin : '');
  const allowed = new Set([new URL(config.baseUrl).origin, `${req.protocol}://${req.get('host')}`]);
  if (!origin || allowed.has(origin)) return next();
  res.status(403).send('Cross-site request blocked.');
}

/** In-memory fixed-window rate limiter (per process). */
export function rateLimit({ windowMs, max, key = (req) => req.ip, message = 'Too many requests — please try again shortly.' }) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    const k = key(req), now = Date.now();
    let h = hits.get(k);
    if (!h || h.reset < now) { h = { n: 0, reset: now + windowMs }; hits.set(k, h); }
    if (++h.n > max) return res.status(429).send(message);
    next();
  };
}

export function securityHeaders(req, res, next) {
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "script-src 'self'",
      "style-src-elem 'self'",
      "style-src-attr 'unsafe-inline'",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      // Payment forms post to our server, which then redirects (303) to the hosted
      // checkout; form-action also governs that redirect, so the gateway is allowed.
      `form-action 'self' ${new URL(config.payments.paymob.baseUrl).origin}`,
      "object-src 'none'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  });
  if (config.baseUrl.startsWith('https://')) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

/** Private, non-indexable responses (order pages, quote links, admin). */
export function privatePage(req, res, next) {
  res.set({ 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Cache-Control': 'no-store', 'Referrer-Policy': 'same-origin' });
  next();
}
