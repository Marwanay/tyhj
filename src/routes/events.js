// Catering enquiries, private quote links, policy pages, payment webhooks and the
// test-mode sandbox gateway.
import express from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { one } from '../db.js';
import { privatePage, rateLimit } from '../lib/http.js';
import { seal, unseal } from '../lib/security.js';
import { formatEGP } from '../lib/money.js';
import { validateEnquiry, createEnquiry, getEnquiry, getQuoteByToken, acceptQuote, expireQuotes, getQuote } from '../services/quotes.js';
import { startPayment, processEvent, PaymentError, markReturnedWithoutPaying } from '../services/payments.js';
import { notify, notifyTeam, templates } from '../services/notify.js';
import { getPage } from '../services/content.js';
import { getProvider, activeProviderStatus } from '../payments/index.js';
import { buildSandboxCallback } from '../payments/sandbox.js';
import { cateringPage, enquiryThanksPage, quotePage, contentPage, messagePage, sandboxGatewayPage } from '../views/catering.js';

export const events = express.Router();

// ---- Catering ---------------------------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 6, fields: 40 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

events.get('/catering', (req, res) => {
  res.send(String(cateringPage({ cartCount: res.locals.cartCount })));
});

events.post('/catering', rateLimit({ windowMs: 10 * 60_000, max: 8 }), (req, res, next) => {
  upload.array('inspiration', 6)(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Each image must be under 8 MB.' : err.code === 'LIMIT_FILE_COUNT' ? 'Please attach up to 6 images.' : 'We could not read your upload.';
      return res.status(422).send(String(cateringPage({ values: req.body, errors: { inspiration: msg }, cartCount: res.locals.cartCount })));
    }
    next();
  });
}, async (req, res) => {
  const { values, errors, shortNotice } = validateEnquiry(req.body);
  if (Object.keys(errors).length) {
    return res.status(422).send(String(cateringPage({ values: { ...values, phoneRaw: req.body.phone }, errors, cartCount: res.locals.cartCount })));
  }
  const e = await createEnquiry(values, req.files || []);
  notify(e.email, ...templates.enquiryReceived(e));
  notifyTeam(`New event enquiry ${e.ref}`, `${e.name} — ${e.event_type} on ${e.event_date} at ${e.venue}, ${e.guest_count} guests.\nServices: ${e.servicesList.join(', ')}\nBudget: ${e.budget || 'not given'}\n\n${config.baseUrl}/admin/enquiries/${e.id}`);
  const receipt = seal(JSON.stringify({ id: e.id, s: shortNotice ? 1 : 0, exp: Date.now() + 3600_000 }));
  res.redirect(303, `/catering/received?r=${encodeURIComponent(receipt)}`);
});

events.get('/catering/received', privatePage, (req, res, next) => {
  const data = (() => { try { return JSON.parse(unseal(req.query.r) || 'null'); } catch { return null; } })();
  if (!data || data.exp < Date.now()) return res.redirect(303, '/catering');
  const e = getEnquiry(data.id);
  if (!e) return next();
  res.send(String(enquiryThanksPage({ enquiry: e, shortNotice: !!data.s, cartCount: res.locals.cartCount })));
});

// ---- Private quote links ----------------------------------------------------------

const quoteLimiter = rateLimit({ windowMs: 60_000, max: 60 });

function loadQuote(req, res, next) {
  expireQuotes();
  const q = getQuoteByToken(req.params.token);
  if (!q || q.status === 'draft') {
    return res.status(404).send(String(messagePage({ title: 'This link is not valid', message: 'The proposal link may have been replaced with a newer one. Please contact us and we will resend it.' })));
  }
  req.quote = q;
  req.enquiry = getEnquiry(q.enquiry_id);
  next();
}

const renderQuote = (req, res, extra = {}) => res.send(String(quotePage({
  quote: req.quote, enquiry: req.enquiry, token: req.params.token, providerReady: activeProviderStatus().ready, ...extra,
})));

events.get('/q/:token', quoteLimiter, privatePage, loadQuote, (req, res) => {
  const cancelled = req.query.cancelled === '1';
  if (cancelled) { markReturnedWithoutPaying('quote', req.quote.id); req.quote = getQuote(req.quote.id); }
  renderQuote(req, res, { returned: req.query.return === '1', cancelled, notice: cancelled ? 'Payment was not completed and nothing has been charged.' : '' });
});

events.get('/q/:token/status', quoteLimiter, privatePage, loadQuote, (req, res) => {
  res.json({ ok: true, state: `${req.quote.status}:${req.quote.amount_paid}` });
});

events.post('/q/:token/accept', quoteLimiter, privatePage, loadQuote, (req, res) => {
  const name = String(req.body.accepted_name || '').trim().slice(0, 80);
  if (name.length < 2 || req.body.agree !== 'on') {
    res.status(422);
    return renderQuote(req, res, { error: 'Please type your full name and tick the box to accept.' });
  }
  const q = acceptQuote(req.quote, name);
  if (q.status === 'accepted') {
    notifyTeam(`Quote accepted: ${q.ref}`, `${req.enquiry.name} accepted ${q.ref} (${formatEGP(q.total)}). Awaiting payment.\n\n${config.baseUrl}/admin/enquiries/${req.enquiry.id}`);
  }
  res.redirect(303, `/q/${req.params.token}`);
});

events.post('/q/:token/pay', quoteLimiter, privatePage, loadQuote, async (req, res) => {
  const q = req.quote, e = req.enquiry;
  if (!(q.due > 0)) return res.redirect(303, `/q/${req.params.token}`);
  try {
    const label = q.duePurpose === 'deposit' ? 'Deposit' : q.duePurpose === 'balance' ? 'Balance' : 'Payment';
    const url = await startPayment({
      subjectType: 'quote', subject: q, purpose: q.duePurpose, amount: q.due,
      items: [{ name: `${label} — ${e.event_type} ${e.event_date}`, unitAmount: q.due, quantity: 1 }],
      customer: { name: e.name, phone: e.phone, email: e.email },
      returnPath: `/q/${req.params.token}?return=1`,
    });
    res.redirect(303, url);
  } catch (err) {
    if (!(err instanceof PaymentError)) throw err;
    res.status(409); renderQuote(req, res, { error: err.message });
  }
});

// ---- Policy pages -------------------------------------------------------------------

events.get('/pages/:slug', (req, res, next) => {
  const page = getPage(req.params.slug);
  if (!page) return next();
  res.send(String(contentPage({ page, cartCount: res.locals.cartCount })));
});

// ---- Payment provider callbacks -----------------------------------------------------

events.post('/webhooks/:provider', express.json({ limit: '256kb' }), (req, res) => {
  let provider;
  try { provider = getProvider(req.params.provider); } catch { return res.status(404).end(); }
  if (provider.name === 'sandbox' && config.payments.mode === 'live') return res.status(404).end();
  const evt = provider.parseWebhook(req);
  if (!evt) {
    console.warn(`[webhook] rejected ${provider.name} callback with invalid signature from ${req.ip}`);
    return res.status(401).json({ ok: false });
  }
  if (evt.ignored) return res.json({ ok: true, ignored: evt.reason });
  const { result } = processEvent(provider.name, evt, req.body);
  console.log(`[webhook] ${provider.name} ${evt.eventKey} → ${result}`);
  res.json({ ok: true, result });
});

// ---- Sandbox gateway (test mode only) -----------------------------------------------

function sandboxPayment(req, res, next) {
  if (config.payments.mode !== 'test') return next('router');
  const p = one("SELECT * FROM payments WHERE provider = 'sandbox' AND provider_order_id = ?", req.params.id);
  if (!p) return res.status(404).send('Unknown test payment');
  req.payment = p;
  res.set({ 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' });
  next();
}

const sandboxLabel = (p) => p.subject_type === 'order'
  ? `Cocoa Caramel order ${one('SELECT ref FROM orders WHERE id = ?', p.subject_id)?.ref}`
  : `Cocoa Caramel proposal ${one('SELECT ref FROM quotes WHERE id = ?', p.subject_id)?.ref}`;

events.get('/sandbox-gateway/:id', sandboxPayment, (req, res) => {
  const p = req.payment;
  res.send(String(sandboxGatewayPage({ payment: p, label: sandboxLabel(p), done: ['paid', 'failed', 'refunded'].includes(p.status) })));
});

events.post('/sandbox-gateway/:id', sandboxPayment, async (req, res) => {
  const p = req.payment;
  const back = new URL(p.return_path, config.baseUrl);
  if (req.body.outcome === 'cancel') {
    back.searchParams.delete('return');
    back.searchParams.set('cancelled', '1');
    return res.redirect(303, back.pathname + back.search);
  }
  const outcome = ['paid', 'failed', 'pending'].includes(req.body.outcome) ? req.body.outcome : 'failed';
  const { body, hmac } = buildSandboxCallback(p, outcome);
  // Deliver the signed callback over HTTP to our own webhook, like the real gateway does.
  try {
    const r = await fetch(`http://127.0.0.1:${req.socket.localPort}/webhooks/sandbox?hmac=${hmac}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) console.warn('[sandbox] webhook delivery returned', r.status);
  } catch (err) {
    console.error('[sandbox] webhook delivery failed', err.message);
  }
  res.redirect(303, back.pathname + back.search);
});
