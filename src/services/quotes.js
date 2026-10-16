// Catering enquiries → itemised quotes → private acceptance & payment links.
// An event is only "confirmed" once the required payment has actually been received.
import fs from 'node:fs';
import path from 'node:path';
import { one, all, run, tx } from '../db.js';
import { config } from '../config.js';
import { randomToken, sha256, seal, unseal, safeEqual } from '../lib/security.js';
import { normalizeEgyptianMobile } from '../lib/phone.js';
import { isIsoDate, cairoDate, addDays } from '../lib/dates.js';
import { sanitizePrivateImage } from '../lib/images.js';
import { uniqueRef, EMAIL_RE } from './orders.js';
import { getSetting } from './content.js';

const str = (v, max) => String(v ?? '').trim().slice(0, max);

// ---- Enquiries ------------------------------------------------------------------

export function validateEnquiry(input) {
  const c = getSetting('catering');
  const errors = {};
  const services = [].concat(input.services || []).map(s => str(s, 60)).filter(s => c.services.some(x => x.name === s));
  const v = {
    eventType: str(input.event_type, 40),
    eventDate: str(input.event_date, 10),
    venue: str(input.venue, 200),
    guests: Math.floor(Number(input.guests)),
    services,
    budget: c.budgetRanges.includes(input.budget) ? input.budget : '',
    styling: str(input.styling, 2000),
    name: str(input.name, 80),
    phone: normalizeEgyptianMobile(input.phone),
    email: str(input.email, 120).toLowerCase(),
  };
  if (!c.eventTypes.includes(v.eventType)) errors.event_type = 'Please choose the type of event.';
  const min = addDays(cairoDate(), c.minNoticeDays || 0);
  if (!isIsoDate(v.eventDate)) errors.event_date = 'Please choose the event date.';
  else if (v.eventDate < cairoDate()) errors.event_date = 'Please choose a date in the future.';
  if (v.venue.length < 2) errors.venue = 'Please tell us the venue or area.';
  if (!(v.guests >= 1 && v.guests <= 5000)) errors.guests = 'Please enter an approximate number of guests.';
  if (!v.services.length) errors.services = 'Please choose at least one service.';
  if (v.name.length < 2) errors.name = 'Please tell us your name.';
  if (!v.phone) errors.phone = 'Please enter an Egyptian mobile number, e.g. 010 1234 5678.';
  if (!EMAIL_RE.test(v.email)) errors.email = 'Please enter a valid email address.';
  const shortNotice = isIsoDate(v.eventDate) && v.eventDate >= cairoDate() && v.eventDate < min;
  return { values: v, errors, shortNotice };
}

export async function createEnquiry(v, files = []) {
  const ref = uniqueRef('EV', 'enquiries');
  const info = run(`INSERT INTO enquiries (ref, event_type, event_date, venue, guest_count, services, budget, styling, name, phone, email)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, ref, v.eventType, v.eventDate, v.venue, v.guests,
    JSON.stringify(v.services), v.budget, v.styling, v.name, v.phone, v.email);
  const id = Number(info.lastInsertRowid);
  const dir = path.join(config.uploadsDir, 'enquiries');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of files.slice(0, 6)) {
    const stored = `${ref}-${randomToken(8)}.jpg`;
    const meta = await sanitizePrivateImage(f.buffer, path.join(dir, stored));
    if (meta) run('INSERT INTO enquiry_files (enquiry_id, stored_name, original_name, width, height) VALUES (?,?,?,?,?)',
      id, stored, str(f.originalname, 120), meta.width, meta.height);
  }
  return getEnquiry(id);
}

export function getEnquiry(id) {
  const e = one('SELECT * FROM enquiries WHERE id = ?', id);
  if (!e) return null;
  e.servicesList = JSON.parse(e.services);
  e.files = all('SELECT * FROM enquiry_files WHERE enquiry_id = ?', id);
  e.quotes = all('SELECT * FROM quotes WHERE enquiry_id = ? ORDER BY id DESC', id);
  return e;
}

export const ENQUIRY_STATUSES = {
  new: 'New', reviewing: 'Reviewing', quoted: 'Quote sent', accepted: 'Quote accepted — awaiting payment',
  confirmed: 'Confirmed (payment received)', completed: 'Completed', declined: 'Declined', cancelled: 'Cancelled',
};

// ---- Quotes ---------------------------------------------------------------------

export const QUOTE_STATUSES = {
  draft: 'Draft', sent: 'Sent', accepted: 'Accepted — awaiting payment', paid_deposit: 'Deposit paid',
  paid_in_full: 'Paid in full', expired: 'Expired', withdrawn: 'Withdrawn',
};

export function createQuote(enquiryId) {
  const q = getSetting('quotes');
  const ref = uniqueRef('QT', 'quotes');
  const info = run(`INSERT INTO quotes (enquiry_id, ref, terms, expires_at, deposit_percent, payment_mode) VALUES (?,?,?,?,?,?)`,
    enquiryId, ref, q.defaultTerms, addDays(cairoDate(), q.validityDays), q.defaultDepositPercent, config.payments.mode);
  return getQuote(Number(info.lastInsertRowid));
}

export function getQuote(id) {
  const q = one('SELECT * FROM quotes WHERE id = ?', id);
  if (!q) return null;
  q.items = all('SELECT * FROM quote_items WHERE quote_id = ? ORDER BY sort, id', id);
  q.payments = all("SELECT * FROM payments WHERE subject_type='quote' AND subject_id=? ORDER BY id DESC", id);
  return withComputed(q);
}

function withComputed(q) {
  q.balance = Math.max(0, q.total - q.amount_paid);
  q.isExpired = !!q.expires_at && q.expires_at < cairoDate() && ['sent', 'draft'].includes(q.status);
  q.editable = q.status === 'draft' || q.status === 'sent';
  // What the customer can pay right now, and why.
  if (q.status === 'accepted') {
    q.due = q.payment_option === 'deposit' ? Math.max(0, q.deposit_amount - q.amount_paid) : q.balance;
    q.duePurpose = q.payment_option === 'deposit' && q.amount_paid < q.deposit_amount ? 'deposit' : 'full';
  } else if (q.status === 'paid_deposit' && q.allow_online_balance) {
    q.due = q.balance; q.duePurpose = 'balance';
  } else { q.due = 0; q.duePurpose = null; }
  return q;
}

export function computeTotals(items, discount, option, depositPercent) {
  const subtotal = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const total = Math.max(0, subtotal - Math.max(0, discount || 0));
  const pct = Math.min(100, Math.max(1, Math.round(depositPercent || 50)));
  const deposit = option === 'deposit' ? Math.round(total * pct / 100) : total;
  return { subtotal, total, deposit, pct };
}

export function saveQuote(id, { items, intro, terms, expiresAt, option, depositPercent, discount, allowBalance }) {
  return tx(() => {
    const q = getQuote(id);
    if (!q.editable) throw new Error('This quote has been accepted and can no longer be edited.');
    const t = computeTotals(items, discount, option, depositPercent);
    run(`UPDATE quotes SET intro=?, terms=?, expires_at=?, payment_option=?, deposit_percent=?, discount=?, subtotal=?, total=?,
         deposit_amount=?, allow_online_balance=?, updated_at=datetime('now') WHERE id=?`,
      intro, terms, expiresAt || null, option, t.pct, discount || 0, t.subtotal, t.total, t.deposit, allowBalance ? 1 : 0, id);
    run('DELETE FROM quote_items WHERE quote_id = ?', id);
    items.forEach((it, i) => run('INSERT INTO quote_items (quote_id, description, quantity, unit_price, sort) VALUES (?,?,?,?,?)',
      id, it.description, it.quantity, it.unit_price, i));
    return getQuote(id);
  });
}

export function quoteProblems(q) {
  const p = [];
  if (!q.items.length) p.push('Add at least one line item.');
  if (!(q.total > 0)) p.push('The total must be greater than zero.');
  if (!q.terms.trim()) p.push('Add the terms for this quote.');
  if (!q.expires_at) p.push('Set an expiry date.');
  else if (q.expires_at < cairoDate()) p.push('The expiry date is in the past.');
  return p;
}

/** Issue (or re-issue) the private link. Re-issuing invalidates the previous link. */
export function issueQuoteLink(id) {
  const token = randomToken(32);
  run(`UPDATE quotes SET token_hash=?, token_enc=?, status = CASE WHEN status='draft' THEN 'sent' ELSE status END,
       sent_at = COALESCE(sent_at, datetime('now')), updated_at=datetime('now') WHERE id=?`, sha256(token), seal(token), id);
  const q = getQuote(id);
  run(`UPDATE enquiries SET status='quoted', updated_at=datetime('now') WHERE id=? AND status IN ('new','reviewing')`, q.enquiry_id);
  return q;
}

export function quoteLink(q) {
  const token = q.token_enc ? unseal(q.token_enc) : null;
  return token ? `${config.baseUrl}/q/${token}` : null;
}

export function getQuoteByToken(token) {
  if (!token || token.length < 20) return null;
  const q = one('SELECT id, token_hash FROM quotes WHERE token_hash = ?', sha256(token));
  if (!q || !safeEqual(q.token_hash, sha256(token))) return null;
  return getQuote(q.id);
}

export function acceptQuote(q, name) {
  return tx(() => {
    const fresh = getQuote(q.id);
    if (fresh.status !== 'sent' || fresh.isExpired) return fresh;
    run(`UPDATE quotes SET status='accepted', accepted_at=datetime('now'), accepted_name=?, updated_at=datetime('now') WHERE id=?`, name, q.id);
    run(`UPDATE enquiries SET status='accepted', updated_at=datetime('now') WHERE id=?`, q.enquiry_id);
    return getQuote(q.id);
  });
}

/** Called inside the payment transaction once money is verified. */
export function applyQuotePayment(payment) {
  const q = getQuote(payment.subject_id);
  const paid = q.amount_paid + payment.amount;
  let status = q.status;
  if (paid >= q.total) status = 'paid_in_full';
  else if (paid >= q.deposit_amount) status = 'paid_deposit';
  run(`UPDATE quotes SET amount_paid=?, status=?, updated_at=datetime('now') WHERE id=?`, paid, status, q.id);
  if (status === 'paid_deposit' || status === 'paid_in_full') {
    run(`UPDATE enquiries SET status='confirmed', updated_at=datetime('now') WHERE id=? AND status NOT IN ('completed')`, q.enquiry_id);
  }
  return { quote: getQuote(q.id), enquiry: getEnquiry(q.enquiry_id) };
}

export function applyQuoteRefund(payment) {
  const q = getQuote(payment.subject_id);
  const paid = Math.max(0, q.amount_paid - payment.amount);
  const status = paid >= q.total ? 'paid_in_full' : paid >= q.deposit_amount && paid > 0 ? 'paid_deposit' : 'accepted';
  run(`UPDATE quotes SET amount_paid=?, status=?, updated_at=datetime('now') WHERE id=?`, paid, status, q.id);
  if (status === 'accepted') run(`UPDATE enquiries SET status='accepted', updated_at=datetime('now') WHERE id=? AND status='confirmed'`, q.enquiry_id);
}

/** Expire sent quotes past their date (run on access and periodically). */
export function expireQuotes() {
  run(`UPDATE quotes SET status='expired', updated_at=datetime('now') WHERE status='sent' AND expires_at IS NOT NULL AND expires_at < ?`, cairoDate());
}
