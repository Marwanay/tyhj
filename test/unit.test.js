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

test('dessert table: renders, surfaces and the manifest agree', async () => {
  const { MENU_ITEMS } = await import('../src/services/menu.js');
  const { ZONES, acceptsFor, assetFor, displayFor, placementBox, parseDesign } = await import('../src/services/table.js');
  const manifest = JSON.parse(fs.readFileSync(new URL('../public/media/table/manifest.json', import.meta.url)));
  assert.equal(ZONES.length, 19);
  assert.equal(manifest.products.length, MENU_ITEMS.size, 'every menu item is in the manifest');
  for (const [id, item] of MENU_ITEMS) {
    const entry = manifest.products.find(p => p.id === id);
    assert.ok(acceptsFor(item).length > 0, `${id} has somewhere to go`);
    assert.deepEqual(entry.placements.map(p => p.zone), acceptsFor(item), `${id} manifest is current`);
    const a = assetFor(item);
    assert.equal(entry.status, a ? 'rendered' : 'render-pending');
    if (!a) continue;
    assert.ok(fs.existsSync(new URL(`../public${a.src}`, import.meta.url)), `${id} render exists`);
    // On the surface it was rendered on, a dessert lands exactly where it was rendered.
    if (a.surface) {
      const b = placementBox(ZONES.find(z => z.id === a.surface), displayFor(item));
      assert.ok(Math.abs(b.left * 1536 - a.rect[0]) < 0.01 && Math.abs(b.top * 1024 - a.rect[1]) < 0.01, `${id} native position`);
    }
    for (const p of entry.placements) assert.ok(p.scale >= 0.65 && p.scale <= 1.15, `${id} on ${p.zone} keeps a sensible scale`);
  }
  // Cakes only on cake stands; designs naming the wrong surface are dropped.
  assert.ok(acceptsFor(MENU_ITEMS.get('chocolate-cake')).every(z => z.startsWith('R')));
  const design = parseDesign(JSON.stringify({ items: [{ zone: 'T01', id: 'chocolate-cake' }, { zone: 'R01', id: 'chocolate-cake', qty: 2 }, { zone: 'R01', id: 'cherry-cake' }] }), MENU_ITEMS);
  assert.deepEqual(design, [{ zone: 'R01', id: 'chocolate-cake', qty: 2 }]);
});

test('dessert table: both reference arrangements are valid designs', async () => {
  const { MENU_ITEMS } = await import('../src/services/menu.js');
  const { ARRANGEMENTS, parseDesign } = await import('../src/services/table.js');
  for (const a of ARRANGEMENTS) assert.equal(parseDesign(JSON.stringify(a), MENU_ITEMS).length, a.items.length, a.id);
  const ids = ARRANGEMENTS.flatMap(a => a.items.map(i => i.id));
  assert.equal(new Set(ids).size, ids.length, 'no dessert appears in two arrangements');
});

test('.vercelignore never drops server code from the deployment', () => {
  const root = new URL('..', import.meta.url).pathname;
  const rules = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'));
  const toRe = (r) => {
    const g = r.replace(/^\//, '').replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
    return new RegExp((r.startsWith('/') ? '^' : '(^|/)') + g + '(/|$)');
  };
  const ignored = (f) => rules.reduce((out, r) => (toRe(r.replace(/^!/, '')).test(f) ? !r.startsWith('!') : out), false);
  const files = ['api', 'src'].flatMap(d => fs.readdirSync(path.join(root, d), { recursive: true }).map(f => `${d}/${f}`));
  assert.deepEqual(files.filter(ignored), []);
});
