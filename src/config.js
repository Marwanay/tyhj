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
const isProduction = env.NODE_ENV === 'production';
const dataDir = path.resolve(root, env.DATA_DIR || 'data');
fs.mkdirSync(dataDir, { recursive: true });

// A stable per-install secret is generated on first boot if none is configured, so
// development works out of the box. Production must set SESSION_SECRET explicitly.
function persistentSecret(name) {
  const file = path.join(dataDir, `.${name}`);
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const value = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, value, { mode: 0o600 });
  return value;
}

const paymentMode = (env.PAYMENT_MODE || 'test').toLowerCase();
const paymentProvider = (env.PAYMENT_PROVIDER || (env.PAYMOB_SECRET_KEY ? 'paymob' : 'sandbox')).toLowerCase();

export const config = {
  root,
  isProduction,
  port: Number(env.PORT || 3000),
  baseUrl: (env.BASE_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, ''),
  dataDir,
  dbFile: path.join(dataDir, env.DB_FILE || 'cocoa-caramel.db'),
  uploadsDir: path.join(dataDir, 'uploads'),          // private (enquiry inspiration)
  mediaDir: path.join(root, 'public', 'media'),       // public product imagery
  sessionSecret: env.SESSION_SECRET || (isProduction ? '' : persistentSecret('session-secret')),
  currency: 'EGP',
  payments: {
    mode: paymentMode === 'live' ? 'live' : 'test',
    provider: paymentProvider,
    paymob: {
      baseUrl: (env.PAYMOB_BASE_URL || 'https://accept.paymob.com/').replace(/\/?$/, '/'),
      secretKey: env.PAYMOB_SECRET_KEY || '',
      publicKey: env.PAYMOB_PUBLIC_KEY || '',
      hmacSecret: env.PAYMOB_HMAC_SECRET || '',
      integrationIds: (env.PAYMOB_INTEGRATION_IDS || '').split(',').map(s => s.trim()).filter(Boolean).map(Number),
    },
    sandbox: {
      hmacSecret: env.SANDBOX_HMAC_SECRET || persistentSecret('sandbox-hmac-secret'),
    },
  },
  mail: {
    smtpUrl: env.SMTP_URL || '',
    from: env.MAIL_FROM || 'Cocoa Caramel <no-reply@localhost>',
  },
  trustProxy: env.TRUST_PROXY || (isProduction ? '1' : ''),
};

if (isProduction && !config.sessionSecret) {
  throw new Error('SESSION_SECRET must be set in production.');
}
