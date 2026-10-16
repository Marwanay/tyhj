// Integration test of the Paymob provider against a local mock of Paymob's API.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const intentions = [];
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    if (req.method === 'POST' && req.url === '/v1/intention/') {
      intentions.push({ auth: req.headers.authorization, body: JSON.parse(body) });
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'pi_test_1', client_secret: 'egy_csk_test_abc', intention_order_id: 987654321 }));
    } else { res.writeHead(404); res.end(); }
  });
});
await new Promise(r => mock.listen(0, r));

Object.assign(process.env, {
  DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'cc-paymob-')),
  PAYMENT_PROVIDER: 'paymob', PAYMENT_MODE: 'test',
  PAYMOB_BASE_URL: `http://127.0.0.1:${mock.address().port}/`,
  PAYMOB_SECRET_KEY: 'egy_sk_test_secret', PAYMOB_PUBLIC_KEY: 'egy_pk_test_public',
  PAYMOB_HMAC_SECRET: 'hmac_test_secret', PAYMOB_INTEGRATION_IDS: '111, 222',
});

const { createApp } = await import('../src/server.js');
const { run, one } = await import('../src/db.js');
const { computeTransactionHmac } = await import('../src/payments/hmac.js');
const { activeProviderStatus } = await import('../src/payments/index.js');
const { config } = await import('../src/config.js');
const app = createApp();
const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
const base = `http://127.0.0.1:${server.address().port}`;
after(() => { server.close(); mock.close(); });

// Fixture: a ready product, a delivery area, and an order placed through the real checkout.
run("INSERT INTO products (slug, name, description, contents, ingredients, allergens, storage, lead_time_hours, status) VALUES ('t','Test tray','d','c','i','a','s',0,'published')");
run("INSERT INTO product_images (product_id, media_key, alt, width, height, widths) VALUES (1, 'site-hero', '', 1254, 1254, '[480]')");
run("INSERT INTO variants (product_id, name, price) VALUES (1, 'Std', 150000)");
run("INSERT INTO delivery_areas (name, fee) VALUES ('Zamalek', 7500)");

test('provider reports ready in test mode with test keys', () => {
  assert.equal(activeProviderStatus().ready, true);
});

test('checkout creates a Paymob intention and redirects to Unified Checkout; signed callback confirms', async () => {
  const form = (o) => ({ method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base, ...(o.cookie ? { cookie: o.cookie } : {}) }, body: new URLSearchParams(o.body) });
  const add = await fetch(`${base}/bag/add`, form({ body: { variant_id: 1, quantity: 2 } }));
  const cookie = add.headers.get('set-cookie').split(';')[0];
  const date = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  const co = await fetch(`${base}/checkout`, form({ cookie, body: { name: 'Nour Ahmed', phone: '01012345678', email: 'n@example.test', fulfilment: 'delivery', area_id: 1, street: '1 St', building: '2', date, agree: 'on' } }));
  assert.equal(co.status, 303);
  const payPath = co.headers.get('location');
  const t = new URL(payPath, base).searchParams.get('t');
  const pay = await fetch(`${base}${payPath.split('?')[0]}`, form({ cookie, body: { t } }));
  assert.equal(pay.status, 303);
  const checkout = new URL(pay.headers.get('location'));
  assert.equal(checkout.pathname, '/unifiedcheckout/');
  assert.equal(checkout.searchParams.get('publicKey'), 'egy_pk_test_public');
  assert.equal(checkout.searchParams.get('clientSecret'), 'egy_csk_test_abc');

  const sent = intentions.at(-1);
  assert.equal(sent.auth, 'Token egy_sk_test_secret');
  assert.equal(sent.body.amount, 307500);              // 2 × 1,500 + 75 delivery, in piastres
  assert.equal(sent.body.currency, 'EGP');
  assert.deepEqual(sent.body.payment_methods, [111, 222]);
  assert.equal(sent.body.items.reduce((s, i) => s + i.amount * i.quantity, 0), 307500);
  assert.equal(sent.body.billing_data.phone_number, '+201012345678');
  assert.match(sent.body.notification_url, /\/webhooks\/paymob$/);
  assert.match(sent.body.special_reference, /^CC-.+-P1$/);

  const obj = { id: 5551, pending: false, amount_cents: 307500, success: true, is_auth: false, is_capture: false, is_standalone_payment: true,
    is_voided: false, is_refunded: false, is_3d_secure: true, integration_id: 111, has_parent_transaction: false,
    order: { id: 987654321, merchant_order_id: sent.body.special_reference }, created_at: '2026-10-16T10:00:00', currency: 'EGP',
    error_occured: false, owner: 1, source_data: { pan: '1234', type: 'card', sub_type: 'Visa' } };
  const hook = (o, hmac) => fetch(`${base}/webhooks/paymob?hmac=${hmac}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'TRANSACTION', obj: o }) });

  // Tampered amount with the original signature → rejected.
  assert.equal((await hook({ ...obj, amount_cents: 100 }, computeTransactionHmac(obj, 'hmac_test_secret'))).status, 401);
  const ok = await hook(obj, computeTransactionHmac(obj, 'hmac_test_secret'));
  assert.equal((await ok.json()).result, 'paid');
  const replay = await hook(obj, computeTransactionHmac(obj, 'hmac_test_secret'));
  assert.equal((await replay.json()).result, 'duplicate');

  const order = one('SELECT * FROM orders ORDER BY id DESC LIMIT 1');
  assert.equal(order.payment_status, 'paid');
  assert.equal(order.total, 307500);
});

test('mismatched key and mode is refused', () => {
  const before = config.payments.paymob.secretKey;
  config.payments.paymob.secretKey = 'egy_sk_live_x';
  const s = activeProviderStatus();
  config.payments.paymob.secretKey = before;
  assert.equal(s.ready, false);
  assert.match(s.problems.join(' '), /live key/);
});
