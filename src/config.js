// Central configuration. Every secret is read from the environment and stays on the server.
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

loadDotEnv(path.join(root, '.env'));

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const env = process.env;
const onVercel = !!env.VERCEL;
const isProduction = env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production';
const databaseUrl = env.DATABASE_URL || env.POSTGRES_URL || '';

// Local development keeps a few generated secrets in ./data so it works out of the box.
// Deployed environments (Vercel, or any production) must configure them explicitly.
const dataDir = path.resolve(root, env.DATA_DIR || 'data');
function localSecret(name) {
  if (onVercel || isProduction) return '';
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, `.${name}`);
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const value = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, value, { mode: 0o600 });
  return value;
}

function baseUrl() {
  if (env.BASE_URL) return env.BASE_URL.replace(/\/$/, '');
  if (env.VERCEL_ENV === 'production' && env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return `http://localhost:${env.PORT || 3000}`;
}

const sessionSecret = env.SESSION_SECRET || localSecret('session-secret');
const paymentMode = (env.PAYMENT_MODE || 'test').toLowerCase();

export const config = {
  root,
  onVercel,
  isProduction,
  port: Number(env.PORT || 3000),
  baseUrl: baseUrl(),
  databaseUrl,
  // Embedded Postgres for local development and tests ("memory" = throwaway).
  pgliteDir: env.PGLITE_DIR || path.join(dataDir, 'pglite'),
  sessionSecret,
  adminSetupToken: env.ADMIN_SETUP_TOKEN || '',
  currency: 'EGP',
  payments: {
    mode: paymentMode === 'live' ? 'live' : 'test',
    provider: (env.PAYMENT_PROVIDER || (env.PAYMOB_SECRET_KEY ? 'paymob' : 'sandbox')).toLowerCase(),
    paymob: {
      baseUrl: (env.PAYMOB_BASE_URL || 'https://accept.paymob.com/').replace(/\/?$/, '/'),
      secretKey: env.PAYMOB_SECRET_KEY || '',
      publicKey: env.PAYMOB_PUBLIC_KEY || '',
      hmacSecret: env.PAYMOB_HMAC_SECRET || '',
      integrationIds: (env.PAYMOB_INTEGRATION_IDS || '').split(',').map(s => s.trim()).filter(Boolean).map(Number),
    },
    sandbox: {
      // Derived, so it needs no storage; only meaningful in test mode.
      hmacSecret: env.SANDBOX_HMAC_SECRET || crypto.createHash('sha256').update('sandbox:' + sessionSecret).digest('hex'),
    },
  },
  mail: {
    smtpUrl: env.SMTP_URL || '',
    from: env.MAIL_FROM || 'Cocoa Caramel <no-reply@localhost>',
  },
  trustProxy: env.TRUST_PROXY || (onVercel || isProduction ? '1' : ''),
};

if (!config.sessionSecret) {
  throw new Error('SESSION_SECRET must be set (a long random string, e.g. `openssl rand -hex 32`).');
}
if ((onVercel || isProduction) && !databaseUrl) {
  throw new Error('DATABASE_URL must be set — connect a Postgres database (e.g. Neon) to the project.');
}
