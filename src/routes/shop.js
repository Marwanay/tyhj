import express from 'express';
import { parseCookies, setCookie, wantsJson, privatePage } from '../lib/http.js';
import { listProducts, getProductBySlug, activeDeliveryAreas } from '../services/catalog.js';
import { CART_COOKIE, ensureCart, findCart, addItem, setQuantity, priceCart, cartCount, CartError } from '../services/cart.js';
import { placeOrder, getOrder, getOrderForCustomer } from '../services/orders.js';
import { startPayment, PaymentError, markReturnedWithoutPaying } from '../services/payments.js';
import { activeProviderStatus } from '../payments/index.js';
import { earliestDate, addDays, cairoDate } from '../lib/dates.js';
import { getSetting } from '../services/content.js';
import { homePage } from '../views/home.js';
import { collectionPage, productPage, bagPage, checkoutPage, paymentPage, orderPage } from '../views/shop.js';
import { messagePage } from '../views/catering.js';

export const shop = express.Router();

// Attach the bag (if any) to every request without creating one for casual visitors.
shop.use((req, res, next) => {
  req.cartId = parseCookies(req)[CART_COOKIE] || null;
  res.locals.cartCount = cartCount(req.cartId);
  next();
});

function cartFor(req, res) {
  const cart = ensureCart(req.cartId);
  if (cart.id !== req.cartId) {
    setCookie(res, CART_COOKIE, cart.id, { maxAge: 60 * 60 * 24 * 30 });
    req.cartId = cart.id;
  }
  return cart;
}

shop.get('/', (req, res) => {
  const featured = listProducts()[0] || null;
  res.send(String(homePage({ featured, cartCount: res.locals.cartCount })));
});

shop.get('/collection', (req, res) => {
  res.send(String(collectionPage({ products: listProducts(), cartCount: res.locals.cartCount })));
});

shop.get('/collection/:slug', (req, res, next) => {
  const p = getProductBySlug(req.params.slug);
  if (!p || (p.status !== 'published' && !req.admin)) return next();
  res.send(String(productPage({ product: p, cartCount: res.locals.cartCount })));
});

// ---- Bag ----------------------------------------------------------------------------

shop.post('/bag/add', (req, res) => {
  const cart = cartFor(req, res);
  try {
    const { product, variant, quantity } = addItem(cart.id, req.body.variant_id, req.body.quantity);
    const count = cartCount(cart.id);
    if (wantsJson(req)) {
      const img = product.images[0];
      return res.json({ ok: true, count, name: product.name, variant: variant.name, quantity,
        image: img ? `/media/${img.media_key}-${img.widths[0]}.jpg` : null });
    }
    res.redirect(303, '/bag');
  } catch (err) {
    if (!(err instanceof CartError)) throw err;
    if (wantsJson(req)) return res.status(409).json({ ok: false, error: err.message });
    res.status(409).send(String(messagePage({ title: 'Not available', message: err.message, cartCount: res.locals.cartCount })));
  }
});

shop.get('/bag', privatePage, (req, res) => {
  const priced = priceCart(req.cartId);
  res.send(String(bagPage({ priced, cartCount: priced.count })));
});

shop.post('/bag/update', (req, res) => {
  if (req.cartId && findCart(req.cartId)) setQuantity(req.cartId, req.body.variant_id, req.body.quantity);
  if (wantsJson(req)) return res.json({ ok: true, count: cartCount(req.cartId) });
  res.redirect(303, '/bag');
});

// ---- Checkout -----------------------------------------------------------------------

function checkoutContext(req) {
  const priced = priceCart(req.cartId);
  const minDate = earliestDate(priced.leadHours);
  const maxDate = addDays(cairoDate(), getSetting('store').maxAdvanceDays);
  return { priced, areas: activeDeliveryAreas(), minDate, maxDate };
}

shop.get('/checkout', privatePage, (req, res) => {
  const ctx = checkoutContext(req);
  if (!ctx.priced.lines.length) return res.redirect(303, '/bag');
  // Pre-fill from the order this bag already produced (customer came back to edit).
  const cart = findCart(req.cartId);
  const o = cart?.order_id ? getOrder(cart.order_id) : null;
  const values = o && o.payment_status !== 'paid' ? {
    name: o.customer_name, phone: o.customer_phone.replace('+20', '0'), email: o.customer_email, fulfilment: o.fulfilment,
    areaId: o.delivery_area_id, address: o.addressObj || {}, date: o.requested_date, giftMessage: o.gift_message, notes: o.notes,
  } : {};
  res.send(String(checkoutPage({ ...ctx, values, cartCount: ctx.priced.count })));
});

shop.post('/checkout', privatePage, (req, res) => {
  const cart = req.cartId && findCart(req.cartId);
  if (!cart) return res.redirect(303, '/bag');
  const result = placeOrder(cart, req.body);
  if (result.errors) {
    const ctx = checkoutContext(req);
    if (!ctx.priced.lines.length) return res.redirect(303, '/bag');
    const values = { ...(result.values || {}), phoneRaw: req.body.phone, agree: req.body.agree };
    return res.status(422).send(String(checkoutPage({ ...ctx, values, errors: result.errors, cartCount: ctx.priced.count })));
  }
  res.redirect(303, `/checkout/pay/${result.order.ref}?t=${encodeURIComponent(result.token)}`);
});

function customerOrder(req) {
  return getOrderForCustomer(req.params.ref, req.query.t || req.body?.t);
}

shop.get('/checkout/pay/:ref', privatePage, (req, res, next) => {
  const o = customerOrder(req);
  if (!o) return next();
  if (o.payment_status === 'paid' || o.status !== 'awaiting_payment') return res.redirect(303, `/orders/${o.ref}?t=${encodeURIComponent(req.query.t)}`);
  res.send(String(paymentPage({ order: o, token: req.query.t, providerReady: activeProviderStatus().ready, cartCount: res.locals.cartCount })));
});

shop.post('/checkout/pay/:ref', privatePage, async (req, res, next) => {
  const o = customerOrder(req);
  if (!o) return next();
  const token = req.body.t;
  if (o.payment_status === 'paid' || o.status !== 'awaiting_payment') return res.redirect(303, `/orders/${o.ref}?t=${encodeURIComponent(token)}`);
  try {
    const items = o.items.map(i => ({ name: `${i.name} — ${i.variant_name}`, unitAmount: i.unit_price, quantity: i.quantity }));
    if (o.delivery_fee) items.push({ name: `Delivery — ${o.delivery_area_name}`, unitAmount: o.delivery_fee, quantity: 1 });
    const url = await startPayment({
      subjectType: 'order', subject: o, purpose: 'full', amount: o.total, items,
      customer: { name: o.customer_name, phone: o.customer_phone, email: o.customer_email, city: o.delivery_area_name },
      returnPath: `/orders/${o.ref}?t=${encodeURIComponent(token)}&return=1`,
    });
    res.redirect(303, url);
  } catch (err) {
    if (!(err instanceof PaymentError)) throw err;
    res.status(409).send(String(paymentPage({ order: getOrder(o.id), token, error: err.message, providerReady: activeProviderStatus().ready, cartCount: res.locals.cartCount })));
  }
});

// ---- Order status (private link) -------------------------------------------------

shop.get('/orders/:ref', privatePage, (req, res, next) => {
  let o = customerOrder(req);
  if (!o) return next();
  const cancelled = req.query.cancelled === '1';
  if (cancelled) { markReturnedWithoutPaying('order', o.id); o = getOrder(o.id); }
  res.send(String(orderPage({ order: o, token: req.query.t, cartCount: res.locals.cartCount, returned: req.query.return === '1', cancelled })));
});

shop.get('/orders/:ref/status', privatePage, (req, res) => {
  const o = customerOrder(req);
  if (!o) return res.status(404).json({ ok: false });
  const latest = o.payments[0];
  res.json({ ok: true, state: `${o.payment_status}:${o.status}`, payment: o.payment_status, status: o.status, attempt: latest?.status || null });
});

export { cartFor };
