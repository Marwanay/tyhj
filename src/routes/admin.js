import express from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { one, all, run, insert, tx, isUniqueViolation } from '../db.js';
import { parseCookies, setCookie, privatePage, rateLimit } from '../lib/http.js';
import { safeEqual, randomToken, verifyPassword } from '../lib/security.js';
import { parseEGP } from '../lib/money.js';
import { cairoDate, addDays, isIsoDate } from '../lib/dates.js';
import { renderVariants, MIME } from '../lib/images.js';
import { ADMIN_COOKIE, login, logout, createAdmin, setPassword, adminCount } from '../services/auth.js';
import { listProducts, getProduct, uniqueSlug, slugify, touchProduct, activeDeliveryAreas } from '../services/catalog.js';
import { getOrder, orderEvent, ORDER_STATUSES } from '../services/orders.js';
import { getEnquiry, createQuote, getQuote, saveQuote, issueQuoteLink, quoteLink, quoteProblems, expireQuotes, ENQUIRY_STATUSES } from '../services/quotes.js';
import { recordManualPayment } from '../services/payments.js';
import { getSetting, setSetting, listPages, getPage, DEFAULTS } from '../services/content.js';
import { notify, templates, notificationChannel } from '../services/notify.js';
import { activeProviderStatus, knownProviders } from '../payments/index.js';
import * as V from '../views/admin.js';

export const admin = express.Router();
admin.use('/admin', privatePage);

// ---- First-run setup ------------------------------------------------------------------
// Creates the first owner account from the browser. Only available while there are no
// admins at all, and only with the ADMIN_SETUP_TOKEN configured on the server.

admin.get('/admin/setup', async (req, res) => {
  if (!config.adminSetupToken || (await adminCount()) > 0) return res.redirect(303, '/admin/login');
  res.send(String(V.setupPage({})));
});

admin.post('/admin/setup', rateLimit({ windowMs: 15 * 60_000, max: 10 }), async (req, res) => {
  if (!config.adminSetupToken || (await adminCount()) > 0) return res.redirect(303, '/admin/login');
  const b = req.body || {};
  if (!safeEqual(b.token, config.adminSetupToken)) return res.status(403).send(String(V.setupPage({ error: 'The setup code is not correct.', values: b })));
  try {
    await createAdmin({ email: String(b.email || ''), name: String(b.name || '').slice(0, 80), password: String(b.password || ''), role: 'owner' });
  } catch (err) {
    return res.status(422).send(String(V.setupPage({ error: err.message, values: b })));
  }
  res.redirect(303, '/admin/login');
});

// ---- Session & CSRF -------------------------------------------------------------------

const loginLimiter = rateLimit({ windowMs: 15 * 60_000, max: 30 });

admin.get('/admin/login', async (req, res) => {
  if (req.admin) return res.redirect(303, '/admin');
  const setup = !!config.adminSetupToken && (await adminCount()) === 0;
  res.send(String(V.loginPage({ setup })));
});

admin.post('/admin/login', loginLimiter, async (req, res) => {
  const result = await login(req.body?.email, req.body?.password, req.ip);
  if (result.error) return res.status(401).send(String(V.loginPage({ error: result.error, email: req.body?.email })));
  setCookie(res, ADMIN_COOKIE, result.token, { maxAge: 12 * 3600, sameSite: 'Strict' });
  res.redirect(303, '/admin');
});

admin.use('/admin', (req, res, next) => {
  if (!req.admin) return res.redirect(303, '/admin/login');
  if (req.method === 'POST' && !safeEqual(req.body?._csrf || req.query._csrf, req.admin.csrf)) {
    return res.status(403).send('Your session expired — please go back, refresh the page and try again.');
  }
  next();
});

admin.post('/admin/logout', async (req, res) => {
  await logout(req.admin);
  setCookie(res, ADMIN_COOKIE, '', { maxAge: 0, sameSite: 'Strict' });
  res.redirect(303, '/admin/login');
});

const ownerOnly = (req, res, next) => (req.admin.role === 'owner' ? next() : res.status(403).send('Only an owner can do this.'));

// Flash messages travel in a short-lived cookie.
function flash(res, message, error = false) {
  setCookie(res, 'cc_flash', JSON.stringify({ message, error }), { maxAge: 30, sameSite: 'Strict' });
}
async function render(req, res, section, title, body) {
  let f = null;
  const raw = parseCookies(req).cc_flash;
  if (raw) { try { f = JSON.parse(raw); } catch { /* ignore */ } setCookie(res, 'cc_flash', '', { maxAge: 0, sameSite: 'Strict' }); }
  const counts = {
    orders: (await one("SELECT COUNT(*)::int AS n FROM orders WHERE payment_status='paid' AND status='confirmed'")).n,
    enquiries: (await one("SELECT COUNT(*)::int AS n FROM enquiries WHERE status='new'")).n,
  };
  res.send(String(V.adminLayout({ title, body, session: req.admin, section, counts, flash: f })));
}
const back = (res, url, msg, err) => { if (msg) flash(res, msg, err); res.redirect(303, url); };
const intParam = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : 0; };

// ---- Dashboard ------------------------------------------------------------------------

async function launchChecklist() {
  const products = await listProducts({ includeDrafts: true });
  const site = getSetting('site');
  const payment = activeProviderStatus();
  const pages = await listPages();
  const items = [];
  for (const p of products) {
    items.push({ ok: p.status === 'published' && p.readiness.ready, label: `${p.name} ready to sell`, href: `/admin/products/${p.id}`,
      detail: p.readiness.ready ? (p.status === 'published' ? '' : 'Ready, but still a draft.') : `Missing: ${p.readiness.missing.join('; ')}.`, blocking: true });
  }
  items.push({ ok: (await activeDeliveryAreas()).length > 0 || !!site.collectionAddress, label: 'Delivery areas and fees (or a collection address)', href: '/admin/delivery', blocking: true });
  items.push({ ok: payment.mode === 'live' && payment.ready, label: 'Live payments activated', href: '/admin/settings', blocking: true,
    detail: payment.mode === 'live' ? (payment.ready ? '' : [...payment.missing, ...payment.problems].join(', ')) : 'Running in test mode — merchant credentials needed.' });
  items.push({ ok: notificationChannel() === 'smtp', label: 'Email notifications (SMTP)', href: '/admin/settings', detail: 'Messages are logged in the admin until SMTP_URL is set.' });
  items.push({ ok: !!site.notifyEmail, label: 'Team notification email', href: '/admin/content' });
  items.push({ ok: !!(site.phone || site.whatsapp || site.email), label: 'Public contact details', href: '/admin/content' });
  items.push({ ok: !!(site.instagram || site.tiktok || site.facebook), label: 'Social links', href: '/admin/content' });
  for (const pg of pages) items.push({ ok: !pg.needs_review, label: `${pg.title} page reviewed`, href: `/admin/pages/${pg.slug}`, blocking: true });
  items.push({ ok: !!getSetting('quotes').defaultTerms.trim(), label: 'Default quote terms', href: '/admin/content' });
  return items.sort((a, b) => a.ok - b.ok);
}

admin.get('/admin', async (req, res) => {
  const paid = await one(`SELECT COUNT(*)::int AS n, COALESCE(SUM(total), 0)::int AS t FROM orders
    WHERE payment_status='paid' AND payment_mode = ? AND created_at >= now() - interval '30 days'`, config.payments.mode);
  await render(req, res, 'dashboard', 'Dashboard', V.dashboardView({
    checklist: await launchChecklist(),
    orders: await all('SELECT * FROM orders ORDER BY id DESC LIMIT 6'),
    enquiries: await all('SELECT * FROM enquiries ORDER BY id DESC LIMIT 6'),
    payment: activeProviderStatus(),
    stats: { paidOrders: paid.n, revenue: paid.t, newEnquiries: (await one("SELECT COUNT(*)::int AS n FROM enquiries WHERE status='new'")).n },
  }));
});

// ---- Products ---------------------------------------------------------------------------

admin.get('/admin/products', async (req, res) => render(req, res, 'products', 'Products', V.productsView({ products: await listProducts({ includeDrafts: true }), s: req.admin })));

admin.post('/admin/products/new', async (req, res) => {
  const id = await tx(async () => {
    const id = await insert('INSERT INTO products (slug, name) VALUES (?, ?)', await uniqueSlug(`new-product-${randomToken(3).toLowerCase()}`), 'New product');
    await run('INSERT INTO variants (product_id, name) VALUES (?, ?)', id, 'Standard');
    return id;
  });
  back(res, `/admin/products/${id}`, 'Draft created. Add the details, prices and images.');
});

async function productOr404(req, res, next) {
  req.product = await getProduct(intParam(req.params.id));
  return req.product ? next() : res.status(404).send('Not found');
}

admin.get('/admin/products/:id', productOr404, (req, res) => render(req, res, 'products', req.product.name, V.productEditView({ p: req.product, s: req.admin })));

admin.post('/admin/products/:id', productOr404, async (req, res) => {
  const b = req.body || {}, p = req.product;
  const t = (k, max = 4000) => String(b[k] ?? '').trim().slice(0, max);
  const leadRaw = t('lead_time_hours');
  const lead = leadRaw === '' ? null : Math.max(0, Math.min(2000, Math.floor(Number(leadRaw))));
  const status = ['draft', 'published', 'archived'].includes(b.status) ? b.status : 'draft';
  await run(`UPDATE products SET name=?, slug=?, tagline=?, description=?, contents=?, piece_count=?, ingredients=?, allergens=?, storage=?,
       lead_time_hours=?, gift_message_enabled=?, delivery_enabled=?, collection_enabled=?, featured=?, status=?, updated_at=now() WHERE id=?`,
    t('name', 120) || p.name, await uniqueSlug(slugify(t('slug', 80) || t('name')), p.id), t('tagline', 200), t('description'), t('contents', 2000), t('piece_count', 80),
    t('ingredients', 3000), t('allergens', 1000), t('storage', 1000), Number.isFinite(lead) ? lead : null,
    b.gift_message_enabled ? 1 : 0, b.delivery_enabled ? 1 : 0, b.collection_enabled ? 1 : 0, b.featured ? 1 : 0, status, p.id);
  const fresh = await getProduct(p.id);
  back(res, `/admin/products/${p.id}`, status === 'published' && !fresh.readiness.ready
    ? 'Saved. The product is visible but cannot be bought until the missing details are added.' : 'Product saved.');
});

const removeDbMedia = (img) => (img.source === 'db' ? run('DELETE FROM media WHERE key = ?', img.media_key) : null);

admin.post('/admin/products/:id/delete', productOr404, async (req, res) => {
  await tx(async () => {
    for (const img of req.product.images) await removeDbMedia(img);
    await run('DELETE FROM products WHERE id = ?', req.product.id);
  });
  back(res, '/admin/products', 'Product deleted.');
});

admin.post('/admin/products/:id/variants', productOr404, async (req, res) => {
  await run('INSERT INTO variants (product_id, name, sort) VALUES (?, ?, ?)', req.product.id, 'New size', req.product.variants.length);
  back(res, `/admin/products/${req.product.id}`, 'Variant added — set its name and price.');
});

admin.post('/admin/products/:id/variants/:vid', productOr404, async (req, res) => {
  const b = req.body || {};
  const price = parseEGP(b.price);
  if (Number.isNaN(price)) return back(res, `/admin/products/${req.product.id}`, 'Please enter the price as a number, e.g. 1250 or 1250.50.', true);
  const stock = String(b.stock ?? '').trim() === '' ? null : Math.max(0, Math.floor(Number(b.stock)) || 0);
  await run(`UPDATE variants SET name=?, description=?, price=?, stock=?, max_per_order=?, active=? WHERE id=? AND product_id=?`,
    String(b.name || 'Standard').slice(0, 80), String(b.description || '').slice(0, 200), price, stock,
    Math.max(1, Math.min(50, Number(b.max_per_order) || 10)), b.active ? 1 : 0, intParam(req.params.vid), req.product.id);
  await touchProduct(req.product.id);
  back(res, `/admin/products/${req.product.id}`, 'Variant saved.');
});

admin.post('/admin/products/:id/variants/:vid/delete', productOr404, async (req, res) => {
  await run('DELETE FROM variants WHERE id = ? AND product_id = ?', intParam(req.params.vid), req.product.id);
  back(res, `/admin/products/${req.product.id}`, 'Variant deleted.');
});

// Browsers downsize photos before upload (see admin.js); this is the server-side backstop.
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: Math.floor(4.4 * 1024 * 1024), files: 10 } });

admin.post('/admin/products/:id/images', productOr404, (req, res, next) => {
  imageUpload.array('images', 10)(req, res, (err) => (err ? back(res, `/admin/products/${req.product.id}`,
    err.code === 'LIMIT_FILE_SIZE' ? 'That image is too large to upload. Please use a JPEG under 4 MB.' : 'The upload could not be read.', true) : next()));
}, async (req, res) => {
  const p = req.product;
  let added = 0, failed = 0;
  for (const f of req.files || []) {
    const key = `${p.slug}-${randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, '')}`.slice(0, 80);
    let out;
    try { out = await renderVariants(f.buffer); } catch { failed++; continue; }
    await tx(async () => {
      for (const v of out.files) await run('INSERT INTO media (key, width, ext, mime, data) VALUES (?,?,?,?,?)', key, v.width, v.ext, MIME[v.ext], v.data);
      await run(`INSERT INTO product_images (product_id, media_key, source, alt, width, height, widths, placeholder, sort)
        VALUES (?,?,'db',?,?,?,?,?,?)`, p.id, key, p.name, out.width, out.height, JSON.stringify(out.widths), out.placeholder, p.images.length + added);
    });
    added++;
  }
  await touchProduct(p.id);
  back(res, `/admin/products/${p.id}`, `${added} image${added === 1 ? '' : 's'} added.${failed ? ` ${failed} could not be read as images.` : ''}`, failed > 0 && !added);
});

admin.post('/admin/products/:id/images/:iid', productOr404, async (req, res) => {
  const p = req.product, img = p.images.find(i => i.id === intParam(req.params.iid));
  if (!img) return res.status(404).send('Not found');
  const op = req.body?.op;
  if (op === 'delete') {
    await tx(async () => { await run('DELETE FROM product_images WHERE id = ?', img.id); await removeDbMedia(img); });
  } else if (op === 'first') {
    await tx(async () => { for (const i of p.images) await run('UPDATE product_images SET sort = ? WHERE id = ?', i.id === img.id ? 0 : i.sort + 1, i.id); });
  } else {
    await run('UPDATE product_images SET alt = ? WHERE id = ?', String(req.body?.alt || '').slice(0, 200), img.id);
  }
  await touchProduct(p.id);
  back(res, `/admin/products/${p.id}`, 'Images updated.');
});

// ---- Orders -----------------------------------------------------------------------------

const ORDER_FILTERS = {
  paid: "payment_status = 'paid'",
  awaiting: "status = 'awaiting_payment'",
  active: "status IN ('confirmed','preparing','ready','out_for_delivery')",
  completed: "status = 'completed'",
  cancelled: "status = 'cancelled'",
};
admin.get('/admin/orders', async (req, res) => {
  const f = Object.hasOwn(ORDER_FILTERS, req.query.f) ? req.query.f : '';
  const orders = await all(`SELECT * FROM orders ${f ? `WHERE ${ORDER_FILTERS[f]}` : ''} ORDER BY id DESC LIMIT 300`);
  await render(req, res, 'orders', 'Orders', V.ordersView({ orders, filter: f }));
});

admin.get('/admin/orders/:id', async (req, res) => {
  const o = await getOrder(intParam(req.params.id));
  if (!o) return res.status(404).send('Not found');
  await render(req, res, 'orders', `Order ${o.ref}`, V.orderView({ o, s: req.admin }));
});

admin.post('/admin/orders/:id/status', async (req, res) => {
  const o = await getOrder(intParam(req.params.id));
  if (!o) return res.status(404).send('Not found');
  const status = req.body?.status;
  const allowed = o.payment_status === 'paid' ? Object.keys(ORDER_STATUSES).filter(k => k !== 'awaiting_payment') : ['awaiting_payment', 'cancelled'];
  if (!allowed.includes(status)) return back(res, `/admin/orders/${o.id}`, 'That status is not available for an unpaid order.', true);
  if (status !== o.status) {
    await run("UPDATE orders SET status = ?, updated_at = now() WHERE id = ?", status, o.id);
    await orderEvent(o.id, `Status changed to “${ORDER_STATUSES[status]}”${status === 'cancelled' && o.payment_status === 'paid' ? ' — refund via the payment dashboard if due' : ''}`, req.admin.email);
  }
  if (String(req.body?.note || '').trim()) await orderEvent(o.id, `Note: ${String(req.body.note).trim().slice(0, 500)}`, req.admin.email);
  back(res, `/admin/orders/${o.id}`, 'Order updated.');
});

// ---- Delivery areas ---------------------------------------------------------------------

admin.get('/admin/delivery', async (req, res) => render(req, res, 'delivery', 'Delivery areas', V.deliveryView({ areas: await all('SELECT * FROM delivery_areas ORDER BY sort, name'), s: req.admin })));

function areaFields(b = {}) {
  const fee = parseEGP(b.fee);
  if (fee === null || Number.isNaN(fee) || !String(b.name || '').trim()) return null;
  return [String(b.name).trim().slice(0, 80), fee, Math.max(0, Math.floor(Number(b.extra_lead_hours) || 0)), String(b.notes || '').slice(0, 200)];
}
admin.post('/admin/delivery', async (req, res) => {
  const f = areaFields(req.body);
  if (!f) return back(res, '/admin/delivery', 'Please enter an area name and a fee (0 for free delivery).', true);
  await run('INSERT INTO delivery_areas (name, fee, extra_lead_hours, notes) VALUES (?,?,?,?)', ...f);
  back(res, '/admin/delivery', 'Area added.');
});
admin.post('/admin/delivery/:id', async (req, res) => {
  const f = areaFields(req.body);
  if (!f) return back(res, '/admin/delivery', 'Please enter an area name and a fee.', true);
  await run('UPDATE delivery_areas SET name=?, fee=?, extra_lead_hours=?, notes=?, active=? WHERE id=?', ...f, req.body?.active ? 1 : 0, intParam(req.params.id));
  back(res, '/admin/delivery', 'Area saved.');
});
admin.post('/admin/delivery/:id/delete', async (req, res) => {
  await run('DELETE FROM delivery_areas WHERE id = ?', intParam(req.params.id));
  back(res, '/admin/delivery', 'Area deleted. Past orders keep their delivery details.');
});

// ---- Enquiries & quotes -------------------------------------------------------------------

const ENQ_FILTERS = { new: "status = 'new'", open: "status IN ('reviewing','quoted','accepted')", confirmed: "status = 'confirmed'", closed: "status IN ('completed','declined','cancelled')" };
admin.get('/admin/enquiries', async (req, res) => {
  await expireQuotes();
  const f = Object.hasOwn(ENQ_FILTERS, req.query.f) ? req.query.f : '';
  await render(req, res, 'enquiries', 'Enquiries', V.enquiriesView({ list: await all(`SELECT * FROM enquiries ${f ? `WHERE ${ENQ_FILTERS[f]}` : ''} ORDER BY id DESC LIMIT 300`), filter: f }));
});

admin.get('/admin/enquiries/:id', async (req, res) => {
  await expireQuotes();
  const e = await getEnquiry(intParam(req.params.id));
  if (!e) return res.status(404).send('Not found');
  const quote = e.quotes[0] ? await getQuote(e.quotes[0].id) : null;
  await render(req, res, 'enquiries', e.ref, V.enquiryView({ e, quote, link: quote ? quoteLink(quote) : null, s: req.admin }));
});

admin.post('/admin/enquiries/:id', async (req, res) => {
  const e = await getEnquiry(intParam(req.params.id));
  if (!e) return res.status(404).send('Not found');
  let status = Object.hasOwn(ENQUIRY_STATUSES, req.body?.status) ? req.body.status : e.status;
  // "Confirmed" is earned by payment, never set by hand.
  if (status === 'confirmed' && e.status !== 'confirmed') status = e.status;
  await run("UPDATE enquiries SET status=?, internal_notes=?, updated_at=now() WHERE id=?", status, String(req.body?.internal_notes || '').slice(0, 5000), e.id);
  back(res, `/admin/enquiries/${e.id}`, 'Saved.');
});

admin.post('/admin/enquiries/:id/quotes', async (req, res) => {
  const e = await getEnquiry(intParam(req.params.id));
  if (!e) return res.status(404).send('Not found');
  const open = e.quotes.find(q => ['draft', 'sent', 'accepted', 'paid_deposit', 'paid_in_full'].includes(q.status));
  if (open) return back(res, `/admin/enquiries/${e.id}`, `Quote ${open.ref} is still active — withdraw it first.`, true);
  await createQuote(e.id);
  if (e.status === 'new') await run("UPDATE enquiries SET status='reviewing' WHERE id=?", e.id);
  back(res, `/admin/enquiries/${e.id}#quote`, 'Draft quote created.');
});

function parseQuoteForm(b = {}) {
  const arr = (v) => [].concat(v ?? []);
  const descs = arr(b.item_description), qtys = arr(b.item_quantity), prices = arr(b.item_price);
  const items = [], errors = [];
  descs.forEach((d, i) => {
    const description = String(d || '').trim().slice(0, 300);
    const price = parseEGP(prices[i]);
    if (!description && price === null) return;
    if (!description) return errors.push(`Line ${i + 1} needs a description.`);
    if (price === null || Number.isNaN(price)) return errors.push(`“${description}” needs a valid price.`);
    items.push({ description, quantity: Math.max(1, Math.min(10000, Math.floor(Number(qtys[i]) || 1))), unit_price: price });
  });
  const discount = parseEGP(b.discount);
  if (Number.isNaN(discount)) errors.push('Discount must be a number.');
  const expiresAt = isIsoDate(b.expires_at) ? b.expires_at : null;
  return { errors, data: {
    items, intro: String(b.intro || '').slice(0, 3000), terms: String(b.terms || '').slice(0, 10000), expiresAt,
    option: b.payment_option === 'full' ? 'full' : 'deposit', depositPercent: Number(b.deposit_percent) || 50,
    discount: discount || 0, allowBalance: !!b.allow_online_balance,
  } };
}

async function quoteOr404(req, res, next) {
  req.quote = await getQuote(intParam(req.params.id));
  return req.quote ? next() : res.status(404).send('Not found');
}

admin.post('/admin/quotes/:id', quoteOr404, async (req, res) => {
  const { errors, data } = parseQuoteForm(req.body);
  if (errors.length) return back(res, `/admin/enquiries/${req.quote.enquiry_id}#quote`, errors.join(' '), true);
  try { await saveQuote(req.quote.id, data); } catch (err) { return back(res, `/admin/enquiries/${req.quote.enquiry_id}#quote`, err.message, true); }
  back(res, `/admin/enquiries/${req.quote.enquiry_id}#quote`, 'Quote saved.');
});

admin.post('/admin/quotes/:id/send', quoteOr404, async (req, res) => {
  const { errors, data } = parseQuoteForm(req.body);
  if (errors.length) return back(res, `/admin/enquiries/${req.quote.enquiry_id}#quote`, errors.join(' '), true);
  let q;
  try { q = await saveQuote(req.quote.id, data); } catch (err) { return back(res, `/admin/enquiries/${req.quote.enquiry_id}#quote`, err.message, true); }
  const problems = quoteProblems(q);
  if (problems.length) return back(res, `/admin/enquiries/${q.enquiry_id}#quote`, `Not sent: ${problems.join(' ')}`, true);
  q = await issueQuoteLink(q.id);
  const e = await getEnquiry(q.enquiry_id);
  await notify(e.email, ...templates.quoteSent(q, e, quoteLink(q)));
  back(res, `/admin/enquiries/${e.id}#quote`, `Quote sent to ${e.email}. You can also copy the private link to share by WhatsApp.`);
});

admin.post('/admin/quotes/:id/withdraw', quoteOr404, async (req, res) => {
  if (!['draft', 'sent', 'expired'].includes(req.quote.status)) return back(res, `/admin/enquiries/${req.quote.enquiry_id}`, 'Accepted or paid quotes cannot be withdrawn.', true);
  await run("UPDATE quotes SET status='withdrawn', updated_at=now() WHERE id=?", req.quote.id);
  back(res, `/admin/enquiries/${req.quote.enquiry_id}`, 'Quote withdrawn.');
});

admin.post('/admin/quotes/:id/manual-payment', quoteOr404, async (req, res) => {
  const amount = parseEGP(req.body?.amount);
  const q = req.quote;
  if (!amount || Number.isNaN(amount) || amount <= 0) return back(res, `/admin/enquiries/${q.enquiry_id}`, 'Enter a valid amount.', true);
  if (amount > q.balance) return back(res, `/admin/enquiries/${q.enquiry_id}`, 'That is more than the remaining balance.', true);
  if (!['accepted', 'paid_deposit'].includes(q.status)) return back(res, `/admin/enquiries/${q.enquiry_id}`, 'Payments can be recorded once the client has accepted the quote.', true);
  await recordManualPayment('quote', q, amount, String(req.body?.note || '').slice(0, 200), req.admin.email);
  back(res, `/admin/enquiries/${q.enquiry_id}`, 'Payment recorded.');
});

admin.get('/admin/files/:id', async (req, res) => {
  const f = await one('SELECT data FROM enquiry_files WHERE id = ?', intParam(req.params.id));
  if (!f) return res.status(404).end();
  res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store' }).send(f.data);
});

// ---- Content & pages ------------------------------------------------------------------------

admin.get('/admin/content', (req, res) => render(req, res, 'content', 'Homepage & contact', V.contentView({
  site: getSetting('site'), home: getSetting('home'), catering: getSetting('catering'), store: getSetting('store'), quotes: getSetting('quotes'), s: req.admin,
})));

admin.post('/admin/content', async (req, res) => {
  const b = req.body || {};
  const pick = (scope) => {
    const out = {};
    for (const key of Object.keys(DEFAULTS[scope])) {
      const v = b[`${scope}.${key}`];
      if (v === undefined) continue;
      out[key] = typeof DEFAULTS[scope][key] === 'number' ? Math.max(0, Number(v) || 0) : String(v).slice(0, 6000);
    }
    return out;
  };
  await setSetting('site', pick('site'));
  await setSetting('home', pick('home'));
  await setSetting('store', { ...pick('store'), orderingOpen: !!b['store.orderingOpen'] });
  await setSetting('quotes', pick('quotes'));
  const lines = (k) => String(b[k] || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 20);
  await setSetting('catering', {
    intro: String(b['catering.intro'] || '').slice(0, 2000),
    minNoticeDays: Math.max(0, Number(b['catering.minNoticeDays']) || 0),
    eventTypes: lines('catering.eventTypes'),
    budgetRanges: lines('catering.budgetRanges'),
    services: lines('catering.services').map(l => { const [name, ...rest] = l.split('|'); return { name: name.trim(), body: rest.join('|').trim() }; }),
  });
  back(res, '/admin/content', 'Website content saved.');
});

admin.get('/admin/pages', async (req, res) => render(req, res, 'pages', 'Policy pages', V.pagesView({ pages: await listPages() })));
admin.get('/admin/pages/:slug', async (req, res) => {
  const page = await getPage(req.params.slug);
  if (!page) return res.status(404).send('Not found');
  await render(req, res, 'pages', page.title, V.pageEditView({ page, s: req.admin }));
});
admin.post('/admin/pages/:slug', async (req, res) => {
  const page = await getPage(req.params.slug);
  if (!page) return res.status(404).send('Not found');
  await run("UPDATE pages SET title=?, body=?, needs_review=?, updated_at=now() WHERE slug=?",
    String(req.body?.title || page.title).slice(0, 120), String(req.body?.body || '').slice(0, 50000), req.body?.reviewed ? 0 : 1, page.slug);
  back(res, `/admin/pages/${page.slug}`, 'Page saved.');
});

// ---- Settings & team -------------------------------------------------------------------------

admin.get('/admin/settings', async (req, res) => render(req, res, 'settings', 'Payments & notifications', V.settingsView({
  payment: activeProviderStatus(), providers: knownProviders(), channel: notificationChannel(),
  outbox: await all('SELECT * FROM outbox ORDER BY id DESC LIMIT 40'), webhookUrl: `${config.baseUrl}/webhooks/${activeProviderStatus().provider}`,
})));

admin.get('/admin/users', async (req, res) => render(req, res, 'users', 'Team', V.usersView({ admins: await all('SELECT id, email, name, role, last_login_at FROM admins ORDER BY id'), s: req.admin })));

admin.post('/admin/users/password', async (req, res) => {
  const me = await one('SELECT * FROM admins WHERE id = ?', req.admin.id);
  if (!(await verifyPassword(String(req.body?.current || ''), me.password_hash))) return back(res, '/admin/users', 'Your current password is incorrect.', true);
  try { await setPassword(me.id, String(req.body?.password || '')); } catch (err) { return back(res, '/admin/users', err.message, true); }
  setCookie(res, ADMIN_COOKIE, '', { maxAge: 0, sameSite: 'Strict' });
  res.redirect(303, '/admin/login');
});

admin.post('/admin/users', ownerOnly, async (req, res) => {
  try {
    await createAdmin({ email: String(req.body?.email || ''), name: String(req.body?.name || '').slice(0, 80), password: String(req.body?.password || ''), role: req.body?.role === 'owner' ? 'owner' : 'staff' });
  } catch (err) {
    return back(res, '/admin/users', isUniqueViolation(err) ? 'That email already has an account.' : err.message, true);
  }
  back(res, '/admin/users', 'Team member added. Share the temporary password privately and ask them to change it.');
});

admin.post('/admin/users/:id/delete', ownerOnly, async (req, res) => {
  if (intParam(req.params.id) === req.admin.id) return back(res, '/admin/users', 'You cannot remove yourself.', true);
  await run('DELETE FROM admins WHERE id = ?', intParam(req.params.id));
  back(res, '/admin/users', 'Removed.');
});
