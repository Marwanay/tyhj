// Payment orchestration. The only thing that can mark money as received is an
// authenticated provider callback (or a staff member recording a manual payment).
// Redirects back from the gateway are treated as navigation, never as proof.
import { one, all, run, tx } from '../db.js';
import { config } from '../config.js';
import { getProvider, activeProviderStatus } from '../payments/index.js';
import { formatEGP } from '../lib/money.js';
import { getOrder, orderEvent, orderLink } from './orders.js';
import { notify, notifyTeam, templates } from './notify.js';
import { applyQuotePayment, applyQuoteRefund, quoteLink } from './quotes.js';

export class PaymentError extends Error {}

/**
 * Open a hosted-checkout session for an order or quote.
 * @returns {Promise<string>} the URL to send the customer to
 */
export async function startPayment({ subjectType, subject, purpose, amount, items, customer, returnPath }) {
  const status = activeProviderStatus();
  if (!status.ready) throw new PaymentError('Online payment is not available at the moment. Please contact us to complete your order.');
  if (subject.payment_mode && subject.payment_mode !== config.payments.mode) {
    throw new PaymentError('This was created in a different payment mode and cannot be paid here. Please contact us.');
  }
  if (!(amount > 0)) throw new PaymentError('There is nothing to pay.');

  const provider = getProvider();
  const payment = tx(() => {
    const open = one(`SELECT * FROM payments WHERE subject_type=? AND subject_id=? AND status='pending'`, subjectType, subject.id);
    if (open) throw new PaymentError('A payment for this is still being confirmed by the bank. Please wait a moment before trying again.');
    // Earlier unused checkout sessions are retired so only the newest one is live on our side.
    run(`UPDATE payments SET status='cancelled', updated_at=datetime('now') WHERE subject_type=? AND subject_id=? AND status='created'`, subjectType, subject.id);
    const n = one('SELECT COUNT(*) AS n FROM payments WHERE subject_type=? AND subject_id=?', subjectType, subject.id).n + 1;
    const info = run(`INSERT INTO payments (subject_type, subject_id, purpose, provider, mode, merchant_reference, amount, currency)
                      VALUES (?,?,?,?,?,?,?,?)`, subjectType, subject.id, purpose, provider.name, config.payments.mode,
      `${subject.ref}-P${n}`, amount, config.currency);
    return one('SELECT * FROM payments WHERE id = ?', info.lastInsertRowid);
  });

  try {
    const { providerOrderId, checkoutUrl } = await provider.createCheckout({
      payment, amount, items, customer,
      notificationUrl: `${config.baseUrl}/webhooks/${provider.name}`,
      redirectionUrl: `${config.baseUrl}${returnPath}`,
    });
    run(`UPDATE payments SET provider_order_id=?, checkout_url=?, return_path=?, updated_at=datetime('now') WHERE id=?`, providerOrderId, checkoutUrl, returnPath, payment.id);
    return checkoutUrl;
  } catch (err) {
    run(`UPDATE payments SET status='failed', detail=?, updated_at=datetime('now') WHERE id=?`, `Could not open checkout: ${err.message}`.slice(0, 500), payment.id);
    console.error('[payments] checkout creation failed', err);
    throw new PaymentError('We could not open the secure payment page. Please try again in a moment.');
  }
}

/** Customer returned without paying (non-authoritative; a later "paid" callback still wins). */
export function markReturnedWithoutPaying(subjectType, subjectId) {
  run(`UPDATE payments SET status='cancelled', detail='Customer left the checkout', updated_at=datetime('now')
       WHERE subject_type=? AND subject_id=? AND status='created' AND provider_order_id IS NOT NULL`, subjectType, subjectId);
}

/**
 * Apply an authenticated provider event exactly once.
 * @returns {{result:string}} for logging and tests
 */
export function processEvent(providerName, evt, payload) {
  const after = [];
  const result = tx(() => {
    const payment = one('SELECT * FROM payments WHERE provider = ? AND provider_order_id = ?', providerName, evt.providerOrderId);
    let outcome = evt.outcome;
    if (!payment) outcome = 'unknown_payment';
    else if (evt.currency !== payment.currency || evt.amount !== payment.amount) outcome = 'amount_mismatch';

    try {
      run('INSERT INTO webhook_events (provider, event_key, payment_id, outcome, payload) VALUES (?,?,?,?,?)',
        providerName, evt.eventKey, payment?.id ?? null, outcome, JSON.stringify(payload).slice(0, 20000));
    } catch (err) {
      if (/UNIQUE/.test(err.message)) return 'duplicate';
      throw err;
    }
    if (!payment) return 'unknown_payment';
    if (outcome === 'amount_mismatch') {
      run(`UPDATE payments SET detail=?, updated_at=datetime('now') WHERE id=?`,
        `Callback amount ${evt.amount} ${evt.currency} does not match ${payment.amount} ${payment.currency} — review required`, payment.id);
      after.push(() => notifyTeam(`Payment needs review: ${payment.merchant_reference}`, `A ${evt.outcome} callback for ${payment.merchant_reference} reported ${evt.amount} ${evt.currency}, but ${payment.amount} ${payment.currency} was expected. It has NOT been applied.`));
      return 'amount_mismatch';
    }
    return transition(payment, evt, after);
  });
  for (const fn of after) fn();
  return { result };
}

function transition(payment, evt, after) {
  const set = (status) => run(`UPDATE payments SET status=?, provider_txn_id=?, detail=?, updated_at=datetime('now') WHERE id=?`,
    status, evt.txnId, evt.detail || '', payment.id);

  switch (evt.outcome) {
    case 'paid':
      if (payment.status === 'paid' || payment.status === 'refunded') return 'ignored';
      set('paid');
      applyPaid({ ...payment, status: 'paid' }, after);
      return 'paid';
    case 'pending':
      if (!['created', 'cancelled'].includes(payment.status)) return 'ignored';
      set('pending');
      if (payment.subject_type === 'order') {
        run(`UPDATE orders SET payment_status='pending', updated_at=datetime('now') WHERE id=? AND payment_status IN ('unpaid','failed')`, payment.subject_id);
        orderEvent(payment.subject_id, `Payment ${payment.merchant_reference} pending with the bank`);
      }
      return 'pending';
    case 'failed':
      if (!['created', 'pending', 'cancelled'].includes(payment.status)) return 'ignored';
      set('failed');
      if (payment.subject_type === 'order') {
        run(`UPDATE orders SET payment_status='failed', updated_at=datetime('now') WHERE id=? AND payment_status IN ('unpaid','pending')`, payment.subject_id);
        orderEvent(payment.subject_id, `Payment ${payment.merchant_reference} failed${evt.detail ? ` (${evt.detail})` : ''}`);
        const o = getOrder(payment.subject_id);
        if (o.payment_status === 'failed') after.push(() => notify(o.customer_email, ...templates.orderPaymentFailed(o, orderLink(o))));
      }
      return 'failed';
    case 'refunded':
      if (payment.status !== 'paid') return 'ignored';
      set('refunded');
      if (payment.subject_type === 'order') {
        run(`UPDATE orders SET payment_status='refunded', updated_at=datetime('now') WHERE id=?`, payment.subject_id);
        orderEvent(payment.subject_id, `Payment ${payment.merchant_reference} refunded or voided`);
      } else {
        applyQuoteRefund(payment);
      }
      after.push(() => notifyTeam(`Refund recorded: ${payment.merchant_reference}`, `The provider reported a refund/void for ${payment.merchant_reference} (${formatEGP(payment.amount)}).`));
      return 'refunded';
    default:
      return 'ignored';
  }
}

/** Shared by verified callbacks and staff-recorded manual payments. */
function applyPaid(payment, after) {
  if (payment.subject_type === 'order') {
    const o = getOrder(payment.subject_id);
    const alreadyPaid = all(`SELECT id FROM payments WHERE subject_type='order' AND subject_id=? AND status='paid' AND id != ?`, o.id, payment.id).length > 0;
    if (alreadyPaid) {
      orderEvent(o.id, `Duplicate payment ${payment.merchant_reference} received — refund required`);
      after.push(() => notifyTeam(`Duplicate payment on ${o.ref}`, `Order ${o.ref} received a second successful payment (${payment.merchant_reference}, ${formatEGP(payment.amount)}). Please refund it from the payment dashboard.`));
      return;
    }
    if (o.status === 'cancelled') {
      run(`UPDATE orders SET payment_status='paid', updated_at=datetime('now') WHERE id=?`, o.id);
      orderEvent(o.id, `Payment ${payment.merchant_reference} received for a cancelled order — review/refund required`);
      after.push(() => notifyTeam(`Payment on cancelled order ${o.ref}`, `Please review order ${o.ref}.`));
      return;
    }
    run(`UPDATE orders SET payment_status='paid', status = CASE WHEN status='awaiting_payment' THEN 'confirmed' ELSE status END,
         updated_at=datetime('now') WHERE id=?`, o.id);
    orderEvent(o.id, `Payment ${payment.merchant_reference} verified (${formatEGP(payment.amount)})`);
    if (!o.stock_committed) {
      for (const it of o.items) {
        const v = it.variant_id ? one('SELECT stock FROM variants WHERE id = ?', it.variant_id) : null;
        if (v && v.stock !== null) {
          run('UPDATE variants SET stock = stock - ? WHERE id = ?', it.quantity, it.variant_id);
          if (v.stock - it.quantity < 0) orderEvent(o.id, `Stock for ${it.name} (${it.variant_name}) is now below zero — please check`);
        }
      }
      run('UPDATE orders SET stock_committed = 1 WHERE id = ?', o.id);
    }
    // The bag that produced this order is now spent.
    for (const c of all('SELECT id FROM carts WHERE order_id = ?', o.id)) {
      run('DELETE FROM cart_items WHERE cart_id = ?', c.id);
      run('UPDATE carts SET order_id = NULL WHERE id = ?', c.id);
    }
    const fresh = getOrder(o.id);
    after.push(() => {
      notify(fresh.customer_email, ...templates.orderPaid(fresh, orderLink(fresh)));
      notifyTeam(`New paid order ${fresh.ref}`, `${fresh.customer_name} — ${formatEGP(fresh.total)} — ${fresh.fulfilment} on ${fresh.requested_date}.\n\n${config.baseUrl}/admin/orders/${fresh.id}`);
    });
  } else {
    const { quote, enquiry } = applyQuotePayment(payment);
    after.push(() => {
      notify(enquiry.email, ...templates.quotePaid(quote, enquiry, formatEGP(payment.amount), quoteLink(quote)));
      notifyTeam(`Payment received for ${quote.ref}`, `${enquiry.name} paid ${formatEGP(payment.amount)} (${payment.purpose}). Quote status: ${quote.status}.\n\n${config.baseUrl}/admin/enquiries/${enquiry.id}`);
    });
  }
}

/** Staff-recorded payment (cash, bank transfer, InstaPay…). */
export function recordManualPayment(subjectType, subject, amount, note, actor) {
  const after = [];
  tx(() => {
    const n = one('SELECT COUNT(*) AS n FROM payments WHERE subject_type=? AND subject_id=?', subjectType, subject.id).n + 1;
    const info = run(`INSERT INTO payments (subject_type, subject_id, purpose, provider, mode, merchant_reference, amount, currency, status, detail)
                      VALUES (?,?,?,?,?,?,?,?,'paid',?)`, subjectType, subject.id, 'manual', 'manual', 'live',
      `${subject.ref}-M${n}`, amount, config.currency, `Recorded by ${actor}: ${note}`.slice(0, 500));
    applyPaid(one('SELECT * FROM payments WHERE id = ?', info.lastInsertRowid), after);
  });
  for (const fn of after) fn();
}

export const latestPayment = (subjectType, id) =>
  one('SELECT * FROM payments WHERE subject_type=? AND subject_id=? ORDER BY id DESC LIMIT 1', subjectType, id);
