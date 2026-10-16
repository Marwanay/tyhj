// Server-side bag keyed by an opaque cookie. Prices are always recomputed from the
// catalogue; the browser never supplies an amount.
import { one, all, run, tx } from '../db.js';
import { randomToken } from '../lib/security.js';
import { getVariantWithProduct, variantSellable } from './catalog.js';

export const CART_COOKIE = 'cc_bag';
const validId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{20,60}$/.test(id);

export async function ensureCart(cartId) {
  if (validId(cartId)) {
    const c = await one('SELECT * FROM carts WHERE id = ?', cartId);
    if (c) return c;
  }
  const id = randomToken(24);
  await run('INSERT INTO carts (id, updated_at) VALUES (?, ?)', id, Date.now());
  return one('SELECT * FROM carts WHERE id = ?', id);
}

export const findCart = async (cartId) => (validId(cartId) ? one('SELECT * FROM carts WHERE id = ?', cartId) : null);

export class CartError extends Error {}

export async function addItem(cartId, variantId, quantity) {
  const found = await getVariantWithProduct(Number(variantId));
  if (!found || !variantSellable(found.product, found.variant)) {
    throw new CartError('Sorry, this item is not available to order right now.');
  }
  const qty = clampQty(quantity);
  return tx(async () => {
    const existing = await one('SELECT quantity FROM cart_items WHERE cart_id = ? AND variant_id = ? FOR UPDATE', cartId, found.variant.id);
    const next = Math.min((existing?.quantity || 0) + qty, found.variant.max_per_order, found.variant.stock ?? Infinity);
    if (next < 1) throw new CartError('Sorry, this item has just sold out.');
    await run(`INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES (?, ?, ?)
         ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = excluded.quantity`, cartId, found.variant.id, next);
    await run('UPDATE carts SET updated_at = ? WHERE id = ?', Date.now(), cartId);
    return { product: found.product, variant: found.variant, quantity: next };
  });
}

export async function setQuantity(cartId, variantId, quantity) {
  const vid = Number(variantId);
  if (!Number.isInteger(vid)) return;
  const q = Number(quantity);
  if (!q || q < 1) return run('DELETE FROM cart_items WHERE cart_id = ? AND variant_id = ?', cartId, vid);
  const found = await getVariantWithProduct(vid);
  const cap = Math.min(found?.variant.max_per_order ?? 10, found?.variant.stock ?? Infinity);
  await run('UPDATE cart_items SET quantity = ? WHERE cart_id = ? AND variant_id = ?', Math.max(1, Math.min(clampQty(q), cap)), cartId, vid);
}

const clampQty = (q) => Math.max(1, Math.min(50, Math.floor(Number(q) || 1)));

/** Priced view of the bag, with any problems (sold out, price changed, unavailable). */
export async function priceCart(cartId) {
  const rows = validId(cartId) ? await all('SELECT * FROM cart_items WHERE cart_id = ? ORDER BY id', cartId) : [];
  const lines = [], problems = [];
  for (const r of rows) {
    const found = await getVariantWithProduct(r.variant_id);
    if (!found || !variantSellable(found.product, found.variant)) {
      problems.push(`${found?.product?.name || 'An item'} is no longer available and was removed.`);
      await run('DELETE FROM cart_items WHERE id = ?', r.id);
      continue;
    }
    const { product, variant } = found;
    let quantity = r.quantity;
    if (variant.stock !== null && quantity > variant.stock) {
      quantity = variant.stock;
      await run('UPDATE cart_items SET quantity = ? WHERE id = ?', quantity, r.id);
      problems.push(`Only ${variant.stock} of ${product.name} (${variant.name}) remain — your bag was updated.`);
    }
    lines.push({ product, variant, quantity, unitPrice: variant.price, lineTotal: variant.price * quantity, image: product.images[0] || null });
  }
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const count = lines.reduce((s, l) => s + l.quantity, 0);

  // Fulfilment and gift options are the intersection of what every product allows.
  const fulfilment = { delivery: lines.length > 0, collection: lines.length > 0 };
  let leadHours = 0, giftMessage = false;
  for (const l of lines) {
    fulfilment.delivery &&= l.product.fulfilment.delivery;
    fulfilment.collection &&= l.product.fulfilment.collection;
    leadHours = Math.max(leadHours, l.product.lead_time_hours || 0);
    giftMessage ||= !!l.product.gift_message_enabled;
  }
  return { lines, subtotal, count, problems, fulfilment, leadHours, giftMessage };
}

export const cartCount = async (cartId) =>
  validId(cartId) ? (await one('SELECT COALESCE(SUM(quantity), 0)::int AS n FROM cart_items WHERE cart_id = ?', cartId)).n : 0;
