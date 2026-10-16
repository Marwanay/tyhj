// SQLite persistence using Node's built-in driver (no native build step).
// All money is stored as integer piastres (1 EGP = 100 piastres).
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

const SCHEMA = [
  // 1 — initial schema
  `
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE admins (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner','staff')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
  );

  CREATE TABLE admin_sessions (
    id_hash TEXT PRIMARY KEY,
    admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    csrf TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE login_attempts (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL,
    window_start INTEGER NOT NULL
  );

  CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    tagline TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    contents TEXT NOT NULL DEFAULT '',
    piece_count TEXT NOT NULL DEFAULT '',
    ingredients TEXT NOT NULL DEFAULT '',
    allergens TEXT NOT NULL DEFAULT '',
    storage TEXT NOT NULL DEFAULT '',
    lead_time_hours INTEGER,              -- NULL = not configured
    gift_message_enabled INTEGER NOT NULL DEFAULT 1,
    delivery_enabled INTEGER NOT NULL DEFAULT 1,
    collection_enabled INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
    featured INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE product_images (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    media_key TEXT NOT NULL,              -- files live at /media/<media_key>-<w>.<ext>
    alt TEXT NOT NULL DEFAULT '',
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    widths TEXT NOT NULL,                 -- JSON array of generated widths
    sort INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE variants (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price INTEGER,                        -- piastres; NULL = price not set
    stock INTEGER,                        -- NULL = made to order (not tracked)
    max_per_order INTEGER NOT NULL DEFAULT 10,
    active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE delivery_areas (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    fee INTEGER NOT NULL,                 -- piastres
    extra_lead_hours INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE carts (
    id TEXT PRIMARY KEY,
    order_id INTEGER,                     -- set once the cart becomes an order (idempotency)
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE cart_items (
    id INTEGER PRIMARY KEY,
    cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    variant_id INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    UNIQUE (cart_id, variant_id)
  );

  CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    ref TEXT NOT NULL UNIQUE,
    access_hash TEXT NOT NULL,
    access_enc TEXT NOT NULL,             -- AES-GCM sealed token, for links in emails
    status TEXT NOT NULL DEFAULT 'awaiting_payment'
      CHECK (status IN ('awaiting_payment','confirmed','preparing','ready','out_for_delivery','completed','cancelled')),
    payment_status TEXT NOT NULL DEFAULT 'unpaid'
      CHECK (payment_status IN ('unpaid','pending','paid','failed','refunded')),
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    fulfilment TEXT NOT NULL CHECK (fulfilment IN ('delivery','collection')),
    delivery_area_id INTEGER,
    delivery_area_name TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',     -- JSON
    requested_date TEXT NOT NULL,
    gift_message TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    subtotal INTEGER NOT NULL,
    delivery_fee INTEGER NOT NULL,
    total INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EGP',
    payment_mode TEXT NOT NULL,           -- test | live, fixed at creation
    stock_committed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE order_items (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER,
    variant_id INTEGER,
    name TEXT NOT NULL,
    variant_name TEXT NOT NULL,
    unit_price INTEGER NOT NULL,
    quantity INTEGER NOT NULL
  );

  CREATE TABLE order_events (
    id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT 'system',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE enquiries (
    id INTEGER PRIMARY KEY,
    ref TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'new'
      CHECK (status IN ('new','reviewing','quoted','accepted','confirmed','completed','declined','cancelled')),
    event_type TEXT NOT NULL,
    event_date TEXT NOT NULL,
    venue TEXT NOT NULL,
    guest_count INTEGER NOT NULL,
    services TEXT NOT NULL,               -- JSON array
    budget TEXT NOT NULL DEFAULT '',
    styling TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    internal_notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE enquiry_files (
    id INTEGER PRIMARY KEY,
    enquiry_id INTEGER NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
    stored_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    width INTEGER, height INTEGER
  );

  CREATE TABLE quotes (
    id INTEGER PRIMARY KEY,
    enquiry_id INTEGER NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
    ref TEXT NOT NULL UNIQUE,
    token_hash TEXT UNIQUE,
    token_enc TEXT,
    status TEXT NOT NULL DEFAULT 'draft'
      CHECK (status IN ('draft','sent','accepted','paid_deposit','paid_in_full','expired','withdrawn')),
    intro TEXT NOT NULL DEFAULT '',
    terms TEXT NOT NULL DEFAULT '',
    expires_at TEXT,                      -- ISO date (end of day, Cairo)
    payment_option TEXT NOT NULL DEFAULT 'deposit' CHECK (payment_option IN ('deposit','full')),
    deposit_percent INTEGER NOT NULL DEFAULT 50,
    subtotal INTEGER NOT NULL DEFAULT 0,
    discount INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    deposit_amount INTEGER NOT NULL DEFAULT 0,
    amount_paid INTEGER NOT NULL DEFAULT 0,
    allow_online_balance INTEGER NOT NULL DEFAULT 1,
    payment_mode TEXT NOT NULL DEFAULT 'test',
    sent_at TEXT, accepted_at TEXT,
    accepted_name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE quote_items (
    id INTEGER PRIMARY KEY,
    quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price INTEGER NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0
  );

  -- Every attempt to collect money, online or recorded manually by staff.
  CREATE TABLE payments (
    id INTEGER PRIMARY KEY,
    subject_type TEXT NOT NULL CHECK (subject_type IN ('order','quote')),
    subject_id INTEGER NOT NULL,
    purpose TEXT NOT NULL DEFAULT 'full' CHECK (purpose IN ('full','deposit','balance','manual')),
    provider TEXT NOT NULL,
    mode TEXT NOT NULL,
    merchant_reference TEXT NOT NULL UNIQUE,
    provider_order_id TEXT,
    provider_txn_id TEXT,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EGP',
    status TEXT NOT NULL DEFAULT 'created'
      CHECK (status IN ('created','pending','paid','failed','cancelled','refunded')),
    checkout_url TEXT,
    return_path TEXT,
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX payments_provider_order ON payments(provider, provider_order_id) WHERE provider_order_id IS NOT NULL;
  CREATE INDEX payments_subject ON payments(subject_type, subject_id);

  -- Raw, authenticated provider callbacks. The unique key makes processing idempotent.
  CREATE TABLE webhook_events (
    id INTEGER PRIMARY KEY,
    provider TEXT NOT NULL,
    event_key TEXT NOT NULL,
    payment_id INTEGER,
    outcome TEXT NOT NULL,
    payload TEXT NOT NULL,
    received_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (provider, event_key)
  );

  CREATE TABLE pages (
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    needs_review INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE outbox (
    id INTEGER PRIMARY KEY,
    channel TEXT NOT NULL DEFAULT 'email',
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','logged','failed')),
    error TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `,
];

export const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

function migrate() {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = db.prepare('SELECT version FROM schema_version').get();
  let version = row ? row.version : 0;
  if (!row) db.prepare('INSERT INTO schema_version (version) VALUES (0)').run();
  for (; version < SCHEMA.length; version++) {
    tx(() => {
      db.exec(SCHEMA[version]);
      db.prepare('UPDATE schema_version SET version = ?').run(version + 1);
    });
  }
}

let depth = 0;
/** Run fn inside a transaction (nested calls join the outer transaction). */
export function tx(fn) {
  if (depth > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  depth++;
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    depth--;
  }
}

export const one = (sql, ...p) => db.prepare(sql).get(...p);
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

migrate();
