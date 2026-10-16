// Orders: validated, priced on the server, created idempotently from a bag.
import { one, all, run, insert, tx } from '../db.js';
import { config } from '../config.js';
import { reference, randomToken, sha256, seal, unseal, safeEqual } from '../lib/security.js';
import { normalizeEgyptianMobile } from '../lib/phone.js';
import { earliestDate, addDays, isIsoDate, cairoDate } from '../lib/dates.js';
import { priceCart } from './cart.js';
import { getSetting } from './content.js';

export const EMAIL_RE = /^[^\s@<>()]+@[^\s@<>()]+\.[A-Za-z]{2,}$/;
const str = (v, max) => String(v ?? '').trim().slice(0, max);

export async function validateCheckout(input, priced) {
  const errors = {};
  const v = {
    name: str(input.name, 80),
    phone: normalizeEgyptianMobile(input.phone),
    email: str(input.email, 120).toLowerCase(),
    fulfilment: input.fulfilment === 'collection' ? 'collection' : 'delivery',
    areaId: Number(input.area_id) || null,
    address: {
      street: str(input.street, 160),
      building: str(input.building, 60),
      floor: str(input.floor, 30),
      apartment: str(input.apartment, 30),
      district: str(input.district, 80),
      landmark: str(input.landmark, 160),
    },
    date: str(input.date, 10),
    giftMessage: priced.giftMessage ? str(input.gift_message, 300) : '',
    notes: str(input.notes, 500),
  };

  if (v.name.length < 2) errors.name = 'Please tell us your full name.';
  if (!v.phone) errors.phone = 'Please enter an Egyptian mobile number, e.g. 010 1234 5678.';
  if (!EMAIL_RE.test(v.email)) errors.email = 'Please enter a valid email address for your confirmation.';

  let area = null;
  if (v.fulfilment === 'delivery') {
    if (!priced.fulfilment.delivery) errors.fulfilment = 'Delivery is not available for the items in your bag.';
    area = Number.isInteger(v.areaId) ? await one('SELECT * FROM delivery_areas WHERE id = ? AND active = 1', v.areaId) : null;
    if (!area) errors.area_id = 'Please choose your delivery area.';
    if (v.address.street.length < 3) errors.street = 'Please enter the street address.';
    if (!v.address.building) errors.building = 'Please enter the building name or number.';
  } else if (!priced.fulfilment.collection) {
    errors.fulfilment = 'Collection is not available for the items in your bag.';
  }

  const lead = priced.leadHours + (area?.extra_lead_hours || 0);
  const min = earliestDate(lead);
  const max = addDays(cairoDate(), getSetting('store').maxAdvanceDays);
  if (!isIsoDate(v.date)) errors.date = 'Please choose a date.';
  else if (v.date < min) errors.date = `The earliest available date is ${min}, to allow time to prepare your order.`;
  else if (v.date > max) errors.date = 'Please choose a date within the next two months, or contact us for later dates.';

  if (input.agree !== 'on' && input.agree !== 'true') errors.agree = 'Please confirm you have read the terms of sale.';
  return { values: v, errors, area, minDate: min, maxDate: max };
}

/**
 * Create the order for this bag — or update it in place if the customer edits their
 * details before paying. One bag can never produce two unpaid orders.
 */
export async function placeOrder(cart, input) {
  return tx(async () => {
    // Lock the bag so two simultaneous submits cannot create two orders.
    cart = await one('SELECT * FROM carts WHERE id = ? FOR UPDATE', cart.id);
    const priced = await priceCart(cart.id);
    if (!priced.lines.length) return { errors: { bag: 'Your bag is empty.' } };
    if (!getSetting('store').orderingOpen) return { errors: { bag: 'Online ordering is paused at the moment.' } };
    const { values: v, errors, area } = await validateCheckout(input, priced);
    if (Object.keys(errors).length) return { errors, values: v };

    const deliveryFee = v.fulfilment === 'delivery' ? area.fee : 0;
    const total = priced.subtotal + deliveryFee;
    const fields = [
      v.name, v.phone, v.email, v.fulfilment, area?.id ?? null, area?.name ?? '',
      v.fulfilment === 'delivery' ? JSON.stringify(v.address) : '', v.date, v.giftMessage, v.notes,
      priced.subtotal, deliveryFee, total,
    ];

    let order = cart.order_id ? await one('SELECT * FROM orders WHERE id = ?', cart.order_id) : null;
    const reusable = order && order.payment_status !== 'paid' && order.status === 'awaiting_payment' &&
      !(await one("SELECT 1 FROM payments WHERE subject_type='order' AND subject_id=? AND status IN ('pending','paid')", order.id));

    let token;
    if (reusable) {
      token = unseal(order.access_enc);
      await run(`UPDATE orders SET customer_name=?, customer_phone=?, customer_email=?, fulfilment=?, delivery_area_id=?,
           delivery_area_name=?, address=?, requested_date=?, gift_message=?, notes=?, subtotal=?, delivery_fee=?, total=?,
           updated_at=now() WHERE id=?`, ...fields, order.id);
      await run('DELETE FROM order_items WHERE order_id = ?', order.id);
      // Any checkout session opened for the old amount must not be reused.
      await run("UPDATE payments SET status='cancelled', updated_at=now() WHERE subject_type='order' AND subject_id=? AND status='created'", order.id);
    } else {
      token = randomToken(24);
      const ref = await uniqueRef('CC', 'orders');
      const id = await insert(`INSERT INTO orders (ref, access_hash, access_enc, customer_name, customer_phone, customer_email, fulfilment,
           delivery_area_id, delivery_area_name, address, requested_date, gift_message, notes, subtotal, delivery_fee, total,
           currency, payment_mode) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        ref, sha256(token), seal(token), ...fields, config.currency, config.payments.mode);
      order = { id, ref };
      await run('UPDATE carts SET order_id = ? WHERE id = ?', order.id, cart.id);
      await orderEvent(order.id, 'Order created — awaiting payment');
    }
    for (const l of priced.lines) {
      await run(`INSERT INTO order_items (order_id, product_id, variant_id, name, variant_name, filling, unit_price, quantity)
           VALUES (?,?,?,?,?,?,?,?)`, order.id, l.product.id, l.variant.id, l.product.name, l.variant.name, l.filling, l.unitPrice, l.quantity);
    }
    return { order: await getOrder(order.id), token };
  });
}

export async function uniqueRef(prefix, table) {
  for (;;) {
    const ref = reference(prefix);
    if (!(await one(`SELECT 1 FROM ${table} WHERE ref = ?`, ref))) return ref;
  }
}

export async function getOrder(id) {
  const o = await one('SELECT * FROM orders WHERE id = ?', id);
  if (!o) return null;
  o.items = await all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', id);
  o.addressObj = o.address ? JSON.parse(o.address) : null;
  o.payments = await all("SELECT * FROM payments WHERE subject_type = 'order' AND subject_id = ? ORDER BY id DESC", id);
  o.events = await all('SELECT * FROM order_events WHERE order_id = ? ORDER BY id DESC', id);
  return o;
}

/** Look up an order by reference + private token (constant-time comparison). */
export async function getOrderForCustomer(ref, token) {
  const o = await one('SELECT id, access_hash FROM orders WHERE ref = ?', String(ref || ''));
  if (!o || !token || !safeEqual(o.access_hash, sha256(token))) return null;
  return getOrder(o.id);
}

export const orderLink = (o) => `${config.baseUrl}/orders/${o.ref}?t=${encodeURIComponent(unseal(o.access_enc) || '')}`;

export const orderEvent = (orderId, message, actor = 'system') =>
  run('INSERT INTO order_events (order_id, message, actor) VALUES (?, ?, ?)', orderId, message, actor);

export const ORDER_STATUSES = {
  awaiting_payment: 'Awaiting payment',
  confirmed: 'Confirmed',
  preparing: 'Being prepared',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
};
export const PAYMENT_STATUSES = { unpaid: 'Unpaid', pending: 'Pending confirmation', paid: 'Paid', failed: 'Failed', refunded: 'Refunded' };
