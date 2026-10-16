// Catering enquiries → itemised quotes → private acceptance & payment links.
// An event is only "confirmed" once the required payment has actually been received.
import { one, all, run, insert, tx } from '../db.js';
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
  // Re-encode images first (outside the transaction): this strips metadata and rejects non-images.
  const images = [];
  for (const f of files.slice(0, 6)) {
    const img = await sanitizePrivateImage(f.buffer);
    if (img) images.push({ ...img, name: str(f.originalname, 120) });
  }
  return tx(async () => {
    const ref = await uniqueRef('EV', 'enquiries');
    const id = await insert(`INSERT INTO enquiries (ref, event_type, event_date, venue, guest_count, services, budget, styling, name, phone, email)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, ref, v.eventType, v.eventDate, v.venue, v.guests,
      JSON.stringify(v.services), v.budget, v.styling, v.name, v.phone, v.email);
    for (const img of images) {
      await run('INSERT INTO enquiry_files (enquiry_id, original_name, width, height, data) VALUES (?,?,?,?,?)', id, img.name, img.width, img.height, img.data);
    }
    return getEnquiry(id);
  });
}

export async function getEnquiry(id) {
  const e = await one('SELECT * FROM enquiries WHERE id = ?', id);
  if (!e) return null;
  e.servicesList = JSON.parse(e.services);
  e.files = await all('SELECT id, original_name, width, height FROM enquiry_files WHERE enquiry_id = ? ORDER BY id', id);
  e.quotes = await all('SELECT * FROM quotes WHERE enquiry_id = ? ORDER BY id DESC', id);
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

export async function createQuote(enquiryId) {
  const q = getSetting('quotes');
  const ref = await uniqueRef('QT', 'quotes');
  const id = await insert(`INSERT INTO quotes (enquiry_id, ref, terms, expires_at, deposit_percent, payment_mode) VALUES (?,?,?,?,?,?)`,
    enquiryId, ref, q.defaultTerms, addDays(cairoDate(), q.validityDays), q.defaultDepositPercent, config.payments.mode);
  return getQuote(id);
}

export async function getQuote(id) {
  const q = await one('SELECT * FROM quotes WHERE id = ?', id);
  if (!q) return null;
  q.items = await all('SELECT * FROM quote_items WHERE quote_id = ? ORDER BY sort, id', id);
  q.payments = await all("SELECT * FROM payments WHERE subject_type='quote' AND subject_id=? ORDER BY id DESC", id);
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

export async function saveQuote(id, { items, intro, terms, expiresAt, option, depositPercent, discount, allowBalance }) {
  return tx(async () => {
    await one('SELECT id FROM quotes WHERE id = ? FOR UPDATE', id);
    const q = await getQuote(id);
    if (!q.editable) throw new Error('This quote has been accepted and can no longer be edited.');
    const t = computeTotals(items, discount, option, depositPercent);
    await run(`UPDATE quotes SET intro=?, terms=?, expires_at=?, payment_option=?, deposit_percent=?, discount=?, subtotal=?, total=?,
         deposit_amount=?, allow_online_balance=?, updated_at=now() WHERE id=?`,
      intro, terms, expiresAt || null, option, t.pct, discount || 0, t.subtotal, t.total, t.deposit, allowBalance ? 1 : 0, id);
    await run('DELETE FROM quote_items WHERE quote_id = ?', id);
    for (const [i, it] of items.entries()) {
      await run('INSERT INTO quote_items (quote_id, description, quantity, unit_price, sort) VALUES (?,?,?,?,?)', id, it.description, it.quantity, it.unit_price, i);
    }
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
export async function issueQuoteLink(id) {
  const token = randomToken(32);
  await run(`UPDATE quotes SET token_hash=?, token_enc=?, status = CASE WHEN status='draft' THEN 'sent' ELSE status END,
       sent_at = COALESCE(sent_at, now()), updated_at=now() WHERE id=?`, sha256(token), seal(token), id);
  const q = await getQuote(id);
  await run(`UPDATE enquiries SET status='quoted', updated_at=now() WHERE id=? AND status IN ('new','reviewing')`, q.enquiry_id);
  return q;
}

export function quoteLink(q) {
  const token = q.token_enc ? unseal(q.token_enc) : null;
  return token ? `${config.baseUrl}/q/${token}` : null;
}

export async function getQuoteByToken(token) {
  if (typeof token !== 'string' || token.length < 20) return null;
  const q = await one('SELECT id, token_hash FROM quotes WHERE token_hash = ?', sha256(token));
  if (!q || !safeEqual(q.token_hash, sha256(token))) return null;
  return getQuote(q.id);
}

export async function acceptQuote(q, name) {
  return tx(async () => {
    await one('SELECT id FROM quotes WHERE id = ? FOR UPDATE', q.id);
    const fresh = await getQuote(q.id);
    if (fresh.status !== 'sent' || fresh.isExpired) return fresh;
    await run(`UPDATE quotes SET status='accepted', accepted_at=now(), accepted_name=?, updated_at=now() WHERE id=?`, name, q.id);
    await run(`UPDATE enquiries SET status='accepted', updated_at=now() WHERE id=?`, q.enquiry_id);
    return getQuote(q.id);
  });
}

/** Called inside the payment transaction once money is verified. */
export async function applyQuotePayment(payment) {
  // Atomic increment; the row lock serialises concurrent callbacks for the same quote.
  const row = await one('UPDATE quotes SET amount_paid = amount_paid + ?, updated_at=now() WHERE id=? RETURNING amount_paid, total, deposit_amount, status',
    payment.amount, payment.subject_id);
  let status = row.status;
  if (row.amount_paid >= row.total) status = 'paid_in_full';
  else if (row.amount_paid >= row.deposit_amount) status = 'paid_deposit';
  await run('UPDATE quotes SET status=? WHERE id=?', status, payment.subject_id);
  const q = await getQuote(payment.subject_id);
  if (status === 'paid_deposit' || status === 'paid_in_full') {
    await run(`UPDATE enquiries SET status='confirmed', updated_at=now() WHERE id=? AND status NOT IN ('completed')`, q.enquiry_id);
  }
  return { quote: q, enquiry: await getEnquiry(q.enquiry_id) };
}

export async function applyQuoteRefund(payment) {
  const row = await one('UPDATE quotes SET amount_paid = GREATEST(0, amount_paid - ?), updated_at=now() WHERE id=? RETURNING amount_paid, total, deposit_amount, enquiry_id',
    payment.amount, payment.subject_id);
  const status = row.amount_paid >= row.total ? 'paid_in_full' : row.amount_paid >= row.deposit_amount && row.amount_paid > 0 ? 'paid_deposit' : 'accepted';
  await run('UPDATE quotes SET status=? WHERE id=?', status, payment.subject_id);
  if (status === 'accepted') await run(`UPDATE enquiries SET status='accepted', updated_at=now() WHERE id=? AND status='confirmed'`, row.enquiry_id);
}

/** Expire sent quotes past their date (run on access). */
export function expireQuotes() {
  return run(`UPDATE quotes SET status='expired', updated_at=now() WHERE status='sent' AND expires_at IS NOT NULL AND expires_at < ?`, cairoDate());
}
