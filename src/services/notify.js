// Notifications go through an outbox so every message is recorded and visible in the
// admin. If SMTP_URL is configured they are emailed; otherwise they are logged only.
import { run, insert } from '../db.js';
import { config } from '../config.js';
import { getSetting } from './content.js';
import { formatQuantity } from './menu.js';

/** A menu selection as plain-text lines for emails. */
export const menuLines = (list = []) => list.map(m => `• ${m.name} — ${formatQuantity(m.qty, m.unit)}`).join('\n');

let transport = null;
async function getTransport() {
  if (!config.mail.smtpUrl) return null;
  if (!transport) {
    const nodemailer = (await import('nodemailer')).default;
    transport = nodemailer.createTransport(config.mail.smtpUrl);
  }
  return transport;
}

export const notificationChannel = () => (config.mail.smtpUrl ? 'smtp' : 'log');

export async function sendEmail(to, subject, text) {
  if (!to) return;
  const id = await insert('INSERT INTO outbox (recipient, subject, body) VALUES (?, ?, ?)', to, subject, text);
  try {
    const t = await getTransport();
    if (!t) { await run("UPDATE outbox SET status = 'logged' WHERE id = ?", id); return; }
    await t.sendMail({ from: config.mail.from, to, subject, text });
    await run("UPDATE outbox SET status = 'sent' WHERE id = ?", id);
  } catch (err) {
    await run("UPDATE outbox SET status = 'failed', error = ? WHERE id = ?", String(err.message).slice(0, 500), id).catch(() => {});
  }
}

/** Never throws: a mail problem must not undo an order or payment. Callers await it so
 *  serverless functions don't stop before the message is recorded and sent. */
export function notify(to, subject, text) {
  return sendEmail(to, subject, text).catch((err) => console.error('[notify]', err.message));
}

export function notifyTeam(subject, text) {
  const to = getSetting('site').notifyEmail;
  return to ? notify(to, subject, text) : Promise.resolve();
}

const signoff = '\n\nWith warmth,\nCocoa Caramel';
export const templates = {
  orderReceived: (o, link) => [`Your order ${o.ref} — awaiting payment`,
    `Hello ${o.customer_name},\n\nThank you for choosing Cocoa Caramel. Your order ${o.ref} has been created and is awaiting payment. It will be confirmed once your payment is verified.\n\nView your order: ${link}${signoff}`],
  orderPaid: (o, link) => [`Order ${o.ref} confirmed`,
    `Hello ${o.customer_name},\n\nYour payment has been received and your order ${o.ref} is confirmed. We will begin preparing it for ${o.requested_date}.\n\nView your order: ${link}${signoff}`],
  orderPaymentFailed: (o, link) => [`Payment not completed for ${o.ref}`,
    `Hello ${o.customer_name},\n\nYour payment for order ${o.ref} was not completed, so nothing has been charged. You can try again here: ${link}${signoff}`],
  enquiryReceived: (e) => [`We received your enquiry ${e.ref}`,
    `Hello ${e.name},\n\nThank you for telling us about your ${e.event_type.toLowerCase()} on ${e.event_date}. Your reference is ${e.ref}.${e.menuList?.length ? `\n\nYour menu selection:\n${menuLines(e.menuList)}` : ''}\n\nOur team will review your request and contact you to confirm availability and pricing. Nothing is booked until you receive and accept a quote.${signoff}`],
  quoteSent: (q, e, link) => [`Your Cocoa Caramel proposal ${q.ref}`,
    `Hello ${e.name},\n\nYour proposal for ${e.event_type.toLowerCase()} on ${e.event_date} is ready to review.\n\nReview, accept and pay securely: ${link}\n\nThis link is private to you${q.expires_at ? ` and the proposal is valid until ${q.expires_at}` : ''}.${signoff}`],
  quotePaid: (q, e, amount, link) => [`Payment received — ${q.ref}`,
    `Hello ${e.name},\n\nWe have received your payment of ${amount} for proposal ${q.ref}. ${q.status === 'paid_in_full' ? 'Your booking is paid in full.' : 'Your date is now reserved.'}\n\nView your booking: ${link}${signoff}`],
};
