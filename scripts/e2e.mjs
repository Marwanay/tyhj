// End-to-end verification in a real browser against a throwaway database.
//   npm run e2e            (uses the sandbox gateway; never touches real money)
//   E2E_SHOTS=dir npm run e2e   also saves screenshots of each step
// Covers: admin product setup → shop → bag → checkout → hosted payment → verified webhook
// → confirmation; failed, cancelled and pending payments; forged webhooks; redirect-is-not-proof;
// catering enquiry → admin quote → private link → accept → deposit → balance.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.E2E_PORT || 3101);
const BASE = `http://localhost:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-e2e-'));
const shots = process.env.E2E_SHOTS;
if (shots) fs.mkdirSync(shots, { recursive: true });
const env = { ...process.env, DATA_DIR: dataDir, PORT: String(PORT), BASE_URL: BASE, PAYMENT_PROVIDER: 'sandbox', PAYMENT_MODE: 'test', SMTP_URL: '' };
const ADMIN = { email: 'e2e-owner@example.test', password: 'e2e-password-long-enough' };
const node = (args, extra = {}) => execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', ...args], { cwd: root, env: { ...env, ...extra }, stdio: 'pipe' });

const results = [];
async function step(name, fn) {
  const t = Date.now();
  try { await fn(); results.push(['✓', name, Date.now() - t]); console.log(`  ✓ ${name}`); }
  catch (err) { results.push(['✗', name, Date.now() - t]); console.error(`  ✗ ${name}\n    ${err.stack.split('\n').slice(0, 4).join('\n    ')}`); throw err; }
}
let shotN = 0;
const snap = async (page, name) => { if (shots) await page.screenshot({ path: path.join(shots, `${String(++shotN).padStart(2, '0')}-${name}.png`), fullPage: true }); };

node(['scripts/seed.js']);
node(['scripts/create-admin.js', ADMIN.email, 'E2E Owner', 'owner'], { ADMIN_PASSWORD: ADMIN.password });
const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/server.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
server.stdout.on('data', d => { log += d; }); server.stderr.on('data', d => { log += d; });
await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('server did not start\n' + log)), 10000); server.stdout.on('data', () => { if (log.includes('running at')) { clearTimeout(t); res(); } }); });

const browser = await chromium.launch();
const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const admin = await adminCtx.newPage();
admin.on('dialog', d => d.accept());
const iphone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' };
const errors = [];
const watch = (p) => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); };
watch(admin);

const see = (p, text) => p.getByText(text).first().waitFor({ state: 'visible', timeout: 10000 });
const orderState = async (page) => (await page.request.get(page.url().replace(/\/orders\/([^?]+)\?/, '/orders/$1/status?'))).json();

try {
  console.log(`\nCocoa Caramel end-to-end · ${BASE} · data ${dataDir}\n`);

  await step('Product cannot be bought before selling details are set', async () => {
    const r = await (await fetch(`${BASE}/collection/signature-chocolate-tray`)).text();
    assert.ok(r.includes('Not yet available online'));
    assert.ok(!r.includes('data-add-form'));
    const add = await fetch(`${BASE}/bag/add`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', origin: BASE }, body: 'variant_id=1&quantity=1' });
    assert.equal(add.status, 409);
  });

  await step('Admin requires sign-in and rejects a wrong password', async () => {
    await admin.goto(`${BASE}/admin`);
    assert.ok(admin.url().endsWith('/admin/login'));
    await admin.fill('#email', ADMIN.email); await admin.fill('#password', 'wrong-password-123');
    await admin.click('button[type=submit]');
    await see(admin, 'do not match');
    await admin.fill('#password', ADMIN.password); await admin.click('button[type=submit]');
    await admin.waitForURL(`${BASE}/admin`);
    await snap(admin, 'admin-dashboard');
  });

  await step('Admin configures delivery area, price and selling details (test data)', async () => {
    await admin.goto(`${BASE}/admin/delivery`);
    await admin.fill('#a-name', 'Test Area (e2e)'); await admin.fill('#a-fee', '100');
    await admin.click('text=Add area');
    await admin.goto(`${BASE}/admin/products/1`);
    await admin.fill('#v1-price', '1500');
    await admin.locator('#v1-price').locator('xpath=ancestor::form').locator('button:has-text("Save")').click();
    await admin.fill('#a-piece_count', '[TEST DATA] 48 pieces');
    await admin.fill('#a-contents', '[TEST DATA] Contents placeholder for automated testing');
    await admin.fill('#a-ingredients', '[TEST DATA] Ingredients placeholder');
    await admin.fill('#a-allergens', '[TEST DATA] Allergens placeholder');
    await admin.fill('#a-storage', '[TEST DATA] Storage placeholder');
    await admin.fill('#a-lead_time_hours', '48');
    await admin.click('text=Save product');
    await see(admin, 'Ready to sell');
    await snap(admin, 'admin-product');
  });

  await step('Admin uploads a product photo; it is stored and served with long caching', async () => {
    await admin.goto(`${BASE}/admin/products/1`);
    await admin.setInputFiles('input[name=images]', path.join(root, 'assets/source/signature-tray-studio.png'));
    await admin.waitForFunction(() => !document.querySelector('input[name=images]').dataset.resizing);
    await admin.click('button:has-text("Upload")');
    await see(admin, '1 image added.');
    const src = await admin.locator('.img-item img').last().getAttribute('src');
    assert.match(src, /^\/m\/signature-chocolate-tray-[a-z0-9]+-480\.jpg$/);
    const r = await fetch(BASE + src);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/jpeg');
    assert.match(r.headers.get('cache-control'), /immutable/);
    // Remove it again so the shopper sees the approved gallery only.
    await admin.locator('.img-item').last().locator('button[value=delete]').click();
    await see(admin, 'Images updated.');
    assert.equal((await fetch(BASE + src)).status, 404);
  });

  const shopper = await browser.newContext({ ...iphone });
  const page = await shopper.newPage(); watch(page);

  async function buyToSandbox({ qty = 1 } = {}) {
    await page.goto(`${BASE}/collection/signature-chocolate-tray`);
    if (qty > 1) await page.fill('input[name=quantity]', String(qty));
    await page.click('[data-add-button]');
    await page.waitForSelector('.toast.is-visible');
    await page.goto(`${BASE}/bag`);
    await page.click('text=Continue to delivery');
    await page.fill('#f-name', 'Test Customer');
    await page.fill('#f-phone', '010 1234 5678');
    await page.fill('#f-email', 'customer@example.test');
    await page.selectOption('#f-area_id', { label: 'Test Area (e2e) — EGP 100' });
    await page.fill('#f-street', '12 Test Street');
    await page.fill('#f-building', '7');
    if (await page.locator('#f-gift_message').count()) await page.fill('#f-gift_message', 'Congratulations, with love.');
    await page.check('input[name=agree]');
    await page.click('text=Review & pay');
    await page.waitForURL(/\/checkout\/pay\//);
    const payUrl = page.url();
    await page.click('text=/Pay EGP .* securely/');
    await page.waitForURL(/\/sandbox-gateway\//);
    return payUrl;
  }

  await step('Mobile shopper: product → bag → delivery → hosted payment → verified confirmation', async () => {
    await page.goto(`${BASE}/collection/signature-chocolate-tray`);
    await snap(page, 'product-mobile');
    await page.click('[data-add-button]');
    await page.waitForSelector('.toast.is-visible');
    assert.equal(await page.textContent('[data-bag-count]'), '1');
    await page.goto(`${BASE}/bag`);
    await snap(page, 'bag-mobile');
    await page.click('text=Continue to delivery');
    // Server-side validation: an invalid phone is rejected with a helpful message.
    await page.fill('#f-name', 'Test Customer'); await page.fill('#f-phone', '12345'); await page.fill('#f-email', 'customer@example.test');
    await page.selectOption('#f-area_id', { label: 'Test Area (e2e) — EGP 100' });
    await page.fill('#f-street', '12 Test Street'); await page.fill('#f-building', '7');
    await page.check('input[name=agree]');
    assert.equal(await page.textContent('[data-total]'), 'EGP 1,600');
    await page.click('text=Review & pay');
    await see(page, 'Egyptian mobile number');
    await page.fill('#f-phone', '010 1234 5678');
    await page.fill('#f-gift_message', 'Congratulations, with love.');
    await page.click('text=Review & pay');
    await page.waitForURL(/\/checkout\/pay\//);
    await snap(page, 'review-pay-mobile');
    await see(page, 'EGP 1,600');
    await page.click('text=/Pay EGP 1,600 securely/');
    await page.waitForURL(/\/sandbox-gateway\//);
    await snap(page, 'sandbox-gateway');
    await page.click('text=Approve payment');
    await page.waitForURL(/\/orders\//);
    await page.waitForSelector('text=Your order is confirmed');
    await snap(page, 'order-confirmed');
    const s = await orderState(page);
    assert.equal(s.payment, 'paid'); assert.equal(s.status, 'confirmed');
    assert.equal(await page.textContent('[data-bag-count]'), '0', 'bag is emptied after verified payment');
  });

  await step('Forged or unsigned webhooks are rejected', async () => {
    const body = JSON.stringify({ type: 'TRANSACTION', obj: { id: 1, success: true, amount_cents: 1, order: { id: 'x' } } });
    const r1 = await fetch(`${BASE}/webhooks/sandbox?hmac=deadbeef`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    assert.equal(r1.status, 401);
    const r2 = await fetch(`${BASE}/webhooks/paymob`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    assert.equal(r2.status, 401);
  });

  await step('A redirect back from the gateway is not treated as payment', async () => {
    const payUrl = await buyToSandbox();
    const [, ref] = payUrl.match(/pay\/([^?]+)/); const t = new URL(payUrl).searchParams.get('t');
    // Skip the gateway entirely and land on the "success" return URL.
    await page.goto(`${BASE}/orders/${ref}?t=${encodeURIComponent(t)}&return=1`);
    await see(page, 'confirming your payment');
    assert.equal((await orderState(page)).payment, 'unpaid');
    await snap(page, 'order-awaiting-confirmation');
  });

  await step('Declined payment → clear message → retry succeeds', async () => {
    await page.goto(`${BASE}/bag`);
    await page.click('text=Continue to delivery');
    await page.check('input[name=agree]');
    await page.click('text=Review & pay');
    await page.click('text=/Pay EGP .* securely/');
    await page.click('text=Decline (card declined)');
    await page.waitForSelector('text=did not go through');
    assert.equal((await orderState(page)).payment, 'failed');
    await snap(page, 'order-failed');
    await page.click('text=Try payment again');
    await page.click('text=/Pay EGP .* securely/');
    await page.click('text=Approve payment');
    await page.waitForSelector('text=Your order is confirmed');
    assert.equal((await orderState(page)).payment, 'paid');
  });

  await step('Cancelled payment leaves the order unpaid and resumable', async () => {
    await buyToSandbox();
    await page.click('text=Cancel and return to store');
    await page.waitForSelector('text=Payment not completed');
    assert.equal((await orderState(page)).payment, 'unpaid');
    await see(page, 'Try payment again');
    await snap(page, 'order-cancelled');
  });

  await step('Pending payment updates automatically when the bank confirms', async () => {
    await page.click('text=Try payment again');
    await page.click('text=/Pay EGP .* securely/');
    const gateway = page.url();
    await page.click('text=Leave pending (bank processing)');
    await page.waitForSelector('text=being confirmed');
    assert.equal((await orderState(page)).payment, 'pending');
    // A second payment attempt is refused while one is pending.
    const ref = page.url().match(/orders\/([^?]+)/)[1]; const t = new URL(page.url()).searchParams.get('t');
    const retry = await page.request.post(`${BASE}/checkout/pay/${ref}`, { form: { t }, headers: { origin: BASE }, maxRedirects: 0 });
    assert.equal(retry.status(), 409);
    // The bank settles: the gateway sends a signed "paid" callback for the same transaction.
    const other = await shopper.newPage();
    await other.goto(gateway); await other.click('text=Approve payment'); await other.close();
    await page.waitForSelector('text=Your order is confirmed', { timeout: 20000 });
  });

  await step('Admin sees verified orders with payment ledger and can progress fulfilment', async () => {
    await admin.goto(`${BASE}/admin/orders?f=paid`);
    const rows = await admin.locator('table.table tbody tr').count();
    assert.equal(rows, 3);
    await admin.locator('table.table tbody tr a').first().click();
    await see(admin, 'verified');
    await admin.selectOption('#a-status', 'preparing');
    await admin.click('text=Update');
    await see(admin, 'Being prepared');
    await snap(admin, 'admin-order');
  });

  let quoteUrl;
  const client = await browser.newContext({ ...iphone });
  const cp = await client.newPage(); watch(cp);

  await step('Catering: multi-step enquiry with inspiration upload returns a reference', async () => {
    await cp.goto(`${BASE}/catering`);
    await snap(cp, 'catering-mobile');
    await cp.locator('#enquire').scrollIntoViewIfNeeded();
    await cp.click('[data-step="1"] [data-next]'); // validation keeps us on step 1
    await see(cp, 'Please choose one.');
    await cp.check('input[value="Engagement"]', { force: true });
    const d = new Date(Date.now() + 40 * 864e5).toISOString().slice(0, 10);
    await cp.fill('#f-event_date', d);
    await cp.click('[data-step="1"] [data-next]');
    await cp.fill('#f-venue', 'Test Venue, New Cairo');
    await cp.fill('#f-guests', '120');
    await cp.check('input[value="Dessert tables"]', { force: true });
    await cp.check('input[value="Chocolate trays"]', { force: true });
    await cp.click('[data-step="2"] [data-next]');
    // Menu: the selection table appears only once something is chosen; chocolates go in half kilos.
    assert.equal(await cp.locator('[data-menu-summary]').isVisible(), false);
    const cake = cp.locator('[data-menu-item="chocolate-cake"]');
    await cake.locator('[data-menu-inc]').click(); await cake.locator('[data-menu-inc]').click();
    await cp.click('[data-menu-tab="chocolate-delights"]');
    const choc = cp.locator('[data-menu-item="chocolate-pieces"]');
    for (let i = 0; i < 3; i++) await choc.locator('[data-menu-inc]').click();
    await cp.locator('[data-menu-summary]').waitFor({ state: 'visible' });
    await see(cp, '1.5 kg');
    assert.equal(await cp.locator('[data-menu-rows] tr').count(), 2);
    assert.equal(await cp.locator('[data-menu-count="chocolate-delights"]').innerText(), '1');
    await snap(cp, 'catering-menu');
    await cp.click('[data-step="3"] [data-next]');
    await cp.fill('#f-styling', 'Blush and ivory palette, gold accents.');
    await cp.setInputFiles('[data-file-input]', path.join(root, 'public/media/site-detail-gold-480.jpg'));
    await cp.click('[data-step="4"] [data-next]');
    await cp.fill('#f-name', 'Test Client'); await cp.fill('#f-phone', '+20 122 345 6789'); await cp.fill('#f-email', 'client@example.test');
    await snap(cp, 'catering-step4');
    await cp.getByRole('button', { name: 'Request a Quote' }).click();
    await cp.waitForURL(/\/catering\/received/);
    await see(cp, /Reference EV-/);
    await see(cp, 'Your date is not reserved yet');
    await see(cp, 'Your selection'); await see(cp, 'Chocolate Pieces'); await see(cp, '2 cakes');
    // The client can forward the summary to the business WhatsApp themselves.
    const wa = decodeURIComponent(await cp.locator('[data-whatsapp-send]').getAttribute('href'));
    assert.match(wa, /^https:\/\/wa\.me\/201222111681\?text=/);
    assert.match(wa, /reference EV-/); assert.match(wa, /Chocolate Pieces — 1\.5 kg/);
    await snap(cp, 'enquiry-received');
  });

  await step('Admin prepares an itemised quote with expiry, terms and deposit, and sends it', async () => {
    await admin.goto(`${BASE}/admin/enquiries`);
    await admin.locator('table.table tbody tr a').first().click();
    await admin.locator('.img-list img').first().waitFor({ state: 'visible' });
    await see(admin, 'Menu selection');
    await admin.click('text=Prepare a quote');
    const rows = admin.locator('[data-row]');
    // Lines arrive pre-filled from the client's menu selection; the team adds prices.
    assert.equal(await rows.nth(0).locator('[name=item_description]').inputValue(), 'Chocolate Cake');
    assert.equal(await rows.nth(0).locator('[name=item_quantity]').inputValue(), '2');
    assert.equal(await rows.nth(1).locator('[name=item_description]').inputValue(), 'Chocolate Pieces — 1.5 kg');
    await rows.nth(0).locator('[name=item_quantity]').fill('1');
    await rows.nth(0).locator('[name=item_description]').fill('[TEST] Dessert table for 120 guests');
    await rows.nth(0).locator('[name=item_price]').fill('20000');
    await rows.nth(1).locator('[name=item_description]').fill('[TEST] Signature chocolate trays');
    await rows.nth(1).locator('[name=item_quantity]').fill('4');
    await rows.nth(1).locator('[name=item_price]').fill('1500');
    await admin.fill('#a-terms', '## Test terms\n- This is automated test data.');
    await admin.selectOption('#a-payment_option', 'deposit'); await admin.fill('#a-deposit_percent', '50');
    await admin.click('text=Save quote');
    await see(admin, 'Total EGP 26,000');
    await admin.click('text=Save & send to client');
    quoteUrl = await admin.inputValue('[data-copy-source]');
    assert.match(quoteUrl, /\/q\/[A-Za-z0-9_-]{40,}$/);
    await snap(admin, 'admin-quote');
  });

  await step('Quote link is private and non-indexable', async () => {
    const r = await fetch(quoteUrl);
    assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
    assert.equal(r.headers.get('referrer-policy'), 'same-origin');
    assert.equal((await fetch(`${BASE}/q/not-a-real-token-but-long-enough-xyz`)).status, 404);
    assert.ok((await (await fetch(`${BASE}/robots.txt`)).text()).includes('Disallow: /q/'));
  });

  await step('Client accepts, pays the deposit → booking confirmed; then pays the balance', async () => {
    await cp.goto(quoteUrl);
    await snap(cp, 'quote-mobile');
    await cp.fill('#f-accepted_name', 'Test Client');
    await cp.check('input[name=agree]');
    await cp.click('text=Accept proposal');
    await cp.click('text=/Pay deposit EGP 13,000 securely/');
    await cp.click('text=Approve payment');
    await cp.waitForSelector('text=your date is reserved');
    await snap(cp, 'quote-deposit-paid');
    await admin.reload();
    await see(admin, 'Confirmed (payment received)');
    await cp.click('text=/Pay balance EGP 13,000 securely/');
    await cp.click('text=Approve payment');
    await cp.waitForSelector('text=paid in full');
    await admin.reload();
    await see(admin, 'Paid in full');
  });

  await step('Customer & team notifications were recorded', async () => {
    await admin.goto(`${BASE}/admin/settings`);
    for (const s of [/^Order CC-\S+ confirmed$/, /^We received your enquiry/, /^Your Cocoa Caramel proposal/, /^Payment received — QT-/]) {
      await see(admin, s);
    }
  });

  await step('No browser errors on any page', async () => {
    // 401/409/422 responses are the deliberate failures exercised above.
    const real = errors.filter(e => !/favicon|status of (401|409|422)/.test(e));
    if (real.length) console.log(real.join('\n'));
    assert.deepEqual(real, []);
  });

  console.log(`\n${results.length} checks passed.\n`);
} catch (err) {
  console.error('\nServer log:\n' + log.split('\n').slice(-30).join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
