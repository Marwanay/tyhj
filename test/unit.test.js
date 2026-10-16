// Unit tests. Run with: npm test  (uses a throwaway database)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-test-'));
process.env.PGLITE_DIR = 'memory';
process.env.PAYMENT_MODE = 'test';
process.env.PAYMENT_PROVIDER = 'sandbox';

const { computeTransactionHmac, verifyTransactionHmac, outcomeOf } = await import('../src/payments/hmac.js');
const { normalizeEgyptianMobile } = await import('../src/lib/phone.js');
const { parseEGP, formatEGP } = await import('../src/lib/money.js');
const { escape, html, markdown } = await import('../src/lib/html.js');

// Independent vector from a third-party Paymob client's test suite (computed outside that library).
const VECTOR_SECRET = 'test_hmac_secret_123';
const VECTOR_HMAC = '6d5904e591d1875918bf3a7c1889c0457d44c723c145aebdd41367c4d2c210862221f6f25198caaa7340fb2278fb04aa41929c7cc4e800470be084e837fd26b6';
const VECTOR_OBJ = {
  id: 192837465, pending: false, amount_cents: 36000, success: true, is_auth: false, is_capture: false,
  is_standalone_payment: true, is_voided: false, is_refunded: false, is_3d_secure: true, integration_id: 4512345,
  has_parent_transaction: false, order: { id: 247254613, merchant_order_id: 'order-1005' },
  created_at: '2026-10-09T13:05:12.123456', currency: 'EGP', error_occured: false, owner: 302852,
  source_data: { pan: '2346', type: 'card', sub_type: 'MasterCard' },
};

test('Paymob HMAC matches an independently computed vector', () => {
  assert.equal(computeTransactionHmac(VECTOR_OBJ, VECTOR_SECRET), VECTOR_HMAC);
  assert.ok(verifyTransactionHmac(VECTOR_OBJ, VECTOR_HMAC, VECTOR_SECRET));
  assert.ok(verifyTransactionHmac(VECTOR_OBJ, VECTOR_HMAC.toUpperCase(), VECTOR_SECRET));
});

test('Paymob HMAC rejects tampering and wrong secrets', () => {
  assert.ok(!verifyTransactionHmac({ ...VECTOR_OBJ, amount_cents: 100 }, VECTOR_HMAC, VECTOR_SECRET));
  assert.ok(!verifyTransactionHmac({ ...VECTOR_OBJ, success: false }, VECTOR_HMAC, VECTOR_SECRET));
  assert.ok(!verifyTransactionHmac(VECTOR_OBJ, VECTOR_HMAC, 'another'));
  assert.ok(!verifyTransactionHmac(VECTOR_OBJ, '', VECTOR_SECRET));
  assert.ok(!verifyTransactionHmac(VECTOR_OBJ, VECTOR_HMAC, ''));
});

test('transaction outcomes', () => {
  assert.equal(outcomeOf(VECTOR_OBJ), 'paid');
  assert.equal(outcomeOf({ ...VECTOR_OBJ, success: false }), 'failed');
  assert.equal(outcomeOf({ ...VECTOR_OBJ, pending: true, success: false }), 'pending');
  assert.equal(outcomeOf({ ...VECTOR_OBJ, is_refunded: true }), 'refunded');
});

test('Egyptian mobile numbers', () => {
  for (const ok of ['01012345678', '010 1234 5678', '+201012345678', '00201012345678', '201112345678', '1512345678', '٠١٠١٢٣٤٥٦٧٨'])
    assert.ok(normalizeEgyptianMobile(ok)?.startsWith('+20'), ok);
  assert.equal(normalizeEgyptianMobile('0122-345-6789'), '+201223456789');
  for (const bad of ['', '0101234567', '01312345678', '0201234567', '+441234567890', 'abc']) assert.equal(normalizeEgyptianMobile(bad), null, bad);
});

test('money parsing and formatting', () => {
  assert.equal(parseEGP('1,250'), 125000);
  assert.equal(parseEGP('1250.5'), 125050);
  assert.equal(parseEGP('EGP 99.99'), 9999);
  assert.equal(parseEGP(''), null);
  assert.ok(Number.isNaN(parseEGP('12.345')));
  assert.ok(Number.isNaN(parseEGP('-5')));
  assert.equal(formatEGP(125000), 'EGP 1,250');
});

test('templates escape user content', () => {
  assert.equal(String(html`<p>${'<script>x</script>'}</p>`), '<p>&lt;script&gt;x&lt;/script&gt;</p>');
  assert.equal(escape(`"'&`), '&quot;&#39;&amp;');
  assert.ok(!String(markdown('[x](javascript:alert(1)) <b>hi</b>')).includes('href="javascript'));
});

test('webhook processing is idempotent and amount-checked', async () => {
  const { run, one, insert } = await import('../src/db.js');
  const { processEvent } = await import('../src/services/payments.js');
  const orderId = await insert(`INSERT INTO orders (ref, access_hash, access_enc, customer_name, customer_phone, customer_email, fulfilment, requested_date, subtotal, delivery_fee, total, payment_mode)
    VALUES ('CC-TEST-0001','h','e','A','+201012345678','a@b.co','delivery','2030-01-01',10000,0,10000,'test')`);
  await run(`INSERT INTO payments (subject_type, subject_id, provider, mode, merchant_reference, provider_order_id, amount)
    VALUES ('order', ?, 'sandbox', 'test', 'CC-TEST-0001-P1', 'sbx_1', 10000)`, orderId);
  const evt = (o) => ({ eventKey: `t1:${o.outcome}`, providerOrderId: 'sbx_1', txnId: 't1', amount: 10000, currency: 'EGP', outcome: 'paid', detail: '', ...o });

  assert.equal((await processEvent('sandbox', evt({ amount: 1, eventKey: 'bad:paid' }), {})).result, 'amount_mismatch');
  assert.equal((await one('SELECT payment_status FROM orders WHERE id=?', orderId)).payment_status, 'unpaid');

  assert.equal((await processEvent('sandbox', evt({}), {})).result, 'paid');
  assert.equal((await processEvent('sandbox', evt({}), {})).result, 'duplicate');
  // A late failure for the same order never downgrades a verified payment.
  assert.equal((await processEvent('sandbox', evt({ outcome: 'failed', eventKey: 't2:failed', txnId: 't2' }), {})).result, 'ignored');
  const o = await one('SELECT * FROM orders WHERE id=?', orderId);
  assert.equal(o.payment_status, 'paid');
  assert.equal(o.status, 'confirmed');
  assert.equal((await processEvent('sandbox', evt({ providerOrderId: 'nope', eventKey: 'x:paid' }), {})).result, 'unknown_payment');
});
