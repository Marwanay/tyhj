import express from 'express';
import { parseCookies, setCookie, wantsJson, privatePage } from '../lib/http.js';
import { listProducts, getProductBySlug, getProduct, activeDeliveryAreas } from '../services/catalog.js';
import { CART_COOKIE, ensureCart, findCart, addItem, setQuantity, priceCart, cartCount, CartError } from '../services/cart.js';
import { placeOrder, getOrder, getOrderForCustomer } from '../services/orders.js';
import { startPayment, PaymentError, markReturnedWithoutPaying } from '../services/payments.js';
import { activeProviderStatus } from '../payments/index.js';
import { earliestDate, addDays, cairoDate } from '../lib/dates.js';
import { getSetting } from '../services/content.js';
import { homePage } from '../views/home.js';
import { collectionPage, productPage, bagPage, checkoutPage, paymentPage, orderPage } from '../views/shop.js';
import { messagePage } from '../views/catering.js';
import { mediaUrl, withFilling } from '../views/components.js';

export const shop = express.Router();

// Attach the bag (if any) to every request without creating one for casual visitors.
shop.use(async (req, res, next) => {
  req.cartId = parseCookies(req)[CART_COOKIE] || null;
  res.locals.cartCount = await cartCount(req.cartId);
  next();
});

async function cartFor(req, res) {
  const cart = await ensureCart(req.cartId);
  if (cart.id !== req.cartId) {
    setCookie(res, CART_COOKIE, cart.id, { maxAge: 60 * 60 * 24 * 30 });
    req.cartId = cart.id;
  }
  return cart;
}

shop.get('/', async (req, res) => {
  const featured = (await listProducts())[0] || null;
  res.send(String(homePage({ featured, cartCount: res.locals.cartCount })));
});

shop.get('/collection', async (req, res) => {
  res.send(String(collectionPage({ products: await listProducts(), cartCount: res.locals.cartCount })));
});

shop.get('/collection/:slug', async (req, res, next) => {
  const p = await getProductBySlug(req.params.slug);
  if (!p || (p.status !== 'published' && !req.admin)) return next();
  res.send(String(productPage({ product: p, cartCount: res.locals.cartCount })));
});

// ---- Bag ----------------------------------------------------------------------------

shop.post('/bag/add', async (req, res) => {
  const cart = await cartFor(req, res);
  try {
    const { product, variant, filling, quantity } = await addItem(cart.id, req.body?.variant_id, req.body?.quantity, req.body?.filling);
    const count = await cartCount(cart.id);
    if (wantsJson(req)) {
      const img = product.images[0];
      return res.json({ ok: true, count, name: product.name, variant: withFilling(variant.name, filling), quantity,
        image: img ? mediaUrl(img, img.widths[0]) : null });
    }
    res.redirect(303, '/bag');
  } catch (err) {
    if (!(err instanceof CartError)) throw err;
    if (wantsJson(req)) return res.status(409).json({ ok: false, error: err.message });
    res.status(409).send(String(messagePage({ title: 'Not available', message: err.message, cartCount: res.locals.cartCount })));
  }
});

shop.get('/bag', privatePage, async (req, res) => {
  const priced = await priceCart(req.cartId);
  res.send(String(bagPage({ priced, cartCount: priced.count })));
});

shop.post('/bag/update', async (req, res) => {
  if (await findCart(req.cartId)) await setQuantity(req.cartId, req.body?.line_id, req.body?.quantity);
  if (wantsJson(req)) return res.json({ ok: true, count: await cartCount(req.cartId) });
  res.redirect(303, '/bag');
});

// ---- Checkout -----------------------------------------------------------------------

async function checkoutContext(req) {
  const priced = await priceCart(req.cartId);
  const minDate = earliestDate(priced.leadHours);
  const maxDate = addDays(cairoDate(), getSetting('store').maxAdvanceDays);
  return { priced, areas: await activeDeliveryAreas(), minDate, maxDate };
}

shop.get('/checkout', privatePage, async (req, res) => {
  const ctx = await checkoutContext(req);
  if (!ctx.priced.lines.length) return res.redirect(303, '/bag');
  // Pre-fill from the order this bag already produced (customer came back to edit).
  const cart = await findCart(req.cartId);
  const o = cart?.order_id ? await getOrder(cart.order_id) : null;
  const values = o && o.payment_status !== 'paid' ? {
    name: o.customer_name, phone: o.customer_phone.replace('+20', '0'), email: o.customer_email, fulfilment: o.fulfilment,
    areaId: o.delivery_area_id, address: o.addressObj || {}, date: o.requested_date, giftMessage: o.gift_message, notes: o.notes,
  } : {};
  res.send(String(checkoutPage({ ...ctx, values, cartCount: ctx.priced.count })));
});

shop.post('/checkout', privatePage, async (req, res) => {
  const cart = await findCart(req.cartId);
  if (!cart) return res.redirect(303, '/bag');
  const result = await placeOrder(cart, req.body || {});
  if (result.errors) {
    const ctx = await checkoutContext(req);
    if (!ctx.priced.lines.length) return res.redirect(303, '/bag');
    const values = { ...(result.values || {}), phoneRaw: req.body?.phone, agree: req.body?.agree };
    return res.status(422).send(String(checkoutPage({ ...ctx, values, errors: result.errors, cartCount: ctx.priced.count })));
  }
  res.redirect(303, `/checkout/pay/${result.order.ref}?t=${encodeURIComponent(result.token)}`);
});

const tokenOf = (req) => [req.query.t, req.body?.t].find(t => typeof t === 'string') || '';
const customerOrder = (req) => getOrderForCustomer(req.params.ref, tokenOf(req));

async function orderImages(o) {
  const images = {};
  for (const id of new Set(o.items.map(i => i.product_id).filter(Boolean))) images[id] = (await getProduct(id))?.images[0] || null;
  return images;
}

shop.get('/checkout/pay/:ref', privatePage, async (req, res, next) => {
  const o = await customerOrder(req);
  if (!o) return next();
  const token = tokenOf(req);
  if (o.payment_status === 'paid' || o.status !== 'awaiting_payment') return res.redirect(303, `/orders/${o.ref}?t=${encodeURIComponent(token)}`);
  res.send(String(paymentPage({ order: o, token, images: await orderImages(o), providerReady: activeProviderStatus().ready, cartCount: res.locals.cartCount })));
});

shop.post('/checkout/pay/:ref', privatePage, async (req, res, next) => {
  const o = await customerOrder(req);
  if (!o) return next();
  const token = tokenOf(req);
  if (o.payment_status === 'paid' || o.status !== 'awaiting_payment') return res.redirect(303, `/orders/${o.ref}?t=${encodeURIComponent(token)}`);
  try {
    const items = o.items.map(i => ({ name: `${i.name} — ${withFilling(i.variant_name, i.filling)}`, unitAmount: i.unit_price, quantity: i.quantity }));
    if (o.delivery_fee) items.push({ name: `Delivery — ${o.delivery_area_name}`, unitAmount: o.delivery_fee, quantity: 1 });
    const url = await startPayment({
      subjectType: 'order', subject: o, purpose: 'full', amount: o.total, items,
      customer: { name: o.customer_name, phone: o.customer_phone, email: o.customer_email, city: o.delivery_area_name },
      returnPath: `/orders/${o.ref}?t=${encodeURIComponent(token)}&return=1`,
    });
    res.redirect(303, url);
  } catch (err) {
    if (!(err instanceof PaymentError)) throw err;
    const fresh = await getOrder(o.id);
    res.status(409).send(String(paymentPage({ order: fresh, token, images: await orderImages(fresh), error: err.message, providerReady: activeProviderStatus().ready, cartCount: res.locals.cartCount })));
  }
});

// ---- Order status (private link) -------------------------------------------------

shop.get('/orders/:ref', privatePage, async (req, res, next) => {
  let o = await customerOrder(req);
  if (!o) return next();
  const cancelled = req.query.cancelled === '1';
  if (cancelled) { await markReturnedWithoutPaying('order', o.id); o = await getOrder(o.id); }
  res.send(String(orderPage({ order: o, token: tokenOf(req), cartCount: res.locals.cartCount, returned: req.query.return === '1', cancelled })));
});

shop.get('/orders/:ref/status', privatePage, async (req, res) => {
  const o = await customerOrder(req);
  if (!o) return res.status(404).json({ ok: false });
  const latest = o.payments[0];
  res.json({ ok: true, state: `${o.payment_status}:${o.status}`, payment: o.payment_status, status: o.status, attempt: latest?.status || null });
});

export { cartFor };
