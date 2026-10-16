// Server-side bag keyed by an opaque cookie. Prices are always recomputed from the
// catalogue; the browser never supplies an amount.
import { one, all, run, tx } from '../db.js';
import { randomToken } from '../lib/security.js';
import { getVariantWithProduct, variantSellable, fulfilmentOptions } from './catalog.js';

export const CART_COOKIE = 'cc_bag';

export function ensureCart(cartId) {
  if (cartId && /^[A-Za-z0-9_-]{20,60}$/.test(cartId)) {
    const c = one('SELECT * FROM carts WHERE id = ?', cartId);
    if (c) return c;
  }
  const id = randomToken(24);
  run('INSERT INTO carts (id, updated_at) VALUES (?, ?)', id, Date.now());
  return one('SELECT * FROM carts WHERE id = ?', id);
}

export const findCart = (cartId) => (cartId ? one('SELECT * FROM carts WHERE id = ?', cartId) : null);

export class CartError extends Error {}

export function addItem(cartId, variantId, quantity) {
  const found = getVariantWithProduct(Number(variantId));
  if (!found || !variantSellable(found.product, found.variant)) {
    throw new CartError('Sorry, this item is not available to order right now.');
  }
  const qty = clampQty(quantity);
  return tx(() => {
    const existing = one('SELECT quantity FROM cart_items WHERE cart_id = ? AND variant_id = ?', cartId, found.variant.id);
    const next = Math.min((existing?.quantity || 0) + qty, found.variant.max_per_order, found.variant.stock ?? Infinity);
    if (next < 1) throw new CartError('Sorry, this item has just sold out.');
    run(`INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES (?, ?, ?)
         ON CONFLICT(cart_id, variant_id) DO UPDATE SET quantity = excluded.quantity`, cartId, found.variant.id, next);
    run('UPDATE carts SET updated_at = ? WHERE id = ?', Date.now(), cartId);
    return { product: found.product, variant: found.variant, quantity: next, capped: next < (existing?.quantity || 0) + qty };
  });
}

export function setQuantity(cartId, variantId, quantity) {
  const q = Number(quantity);
  if (!q || q < 1) return run('DELETE FROM cart_items WHERE cart_id = ? AND variant_id = ?', cartId, Number(variantId));
  const found = getVariantWithProduct(Number(variantId));
  const cap = Math.min(found?.variant.max_per_order ?? 10, found?.variant.stock ?? Infinity);
  run('UPDATE cart_items SET quantity = ? WHERE cart_id = ? AND variant_id = ?', Math.max(1, Math.min(clampQty(q), cap)), cartId, Number(variantId));
}

const clampQty = (q) => Math.max(1, Math.min(50, Math.floor(Number(q) || 1)));

/** Priced view of the bag, with any problems (sold out, price changed, unavailable). */
export function priceCart(cartId) {
  const rows = cartId ? all('SELECT * FROM cart_items WHERE cart_id = ? ORDER BY id', cartId) : [];
  const lines = [], problems = [];
  for (const r of rows) {
    const found = getVariantWithProduct(r.variant_id);
    if (!found || !variantSellable(found.product, found.variant)) {
      problems.push(`${found?.product?.name || 'An item'} is no longer available and was removed.`);
      run('DELETE FROM cart_items WHERE id = ?', r.id);
      continue;
    }
    const { product, variant } = found;
    let quantity = r.quantity;
    if (variant.stock !== null && quantity > variant.stock) {
      quantity = variant.stock;
      run('UPDATE cart_items SET quantity = ? WHERE id = ?', quantity, r.id);
      problems.push(`Only ${variant.stock} of ${product.name} (${variant.name}) remain — your bag was updated.`);
    }
    lines.push({
      product, variant, quantity,
      unitPrice: variant.price,
      lineTotal: variant.price * quantity,
      image: product.images[0] || null,
    });
  }
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const count = lines.reduce((s, l) => s + l.quantity, 0);

  // Fulfilment and gift options are the intersection of what every product allows.
  const fulfilment = { delivery: lines.length > 0, collection: lines.length > 0 };
  let leadHours = 0, giftMessage = false;
  for (const l of lines) {
    const f = fulfilmentOptions(l.product);
    fulfilment.delivery &&= f.delivery;
    fulfilment.collection &&= f.collection;
    leadHours = Math.max(leadHours, l.product.lead_time_hours || 0);
    giftMessage ||= !!l.product.gift_message_enabled;
  }
  return { lines, subtotal, count, problems, fulfilment, leadHours, giftMessage };
}

export const cartCount = (cartId) =>
  cartId ? (one('SELECT COALESCE(SUM(quantity),0) AS n FROM cart_items WHERE cart_id = ?', cartId)?.n || 0) : 0;
