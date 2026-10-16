// Products, variants, images and the "ready to sell" rules.
import { one, all, run } from '../db.js';
import { getSetting } from './content.js';

function hydrate(p) {
  if (!p) return null;
  p.images = all('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort, id', p.id)
    .map(i => ({ ...i, widths: JSON.parse(i.widths) }));
  p.variants = all('SELECT * FROM variants WHERE product_id = ? ORDER BY sort, id', p.id);
  p.readiness = readiness(p);
  p.purchasable = p.status === 'published' && p.readiness.ready;
  return p;
}

export const getProductBySlug = (slug) => hydrate(one('SELECT * FROM products WHERE slug = ?', slug));
export const getProduct = (id) => hydrate(one('SELECT * FROM products WHERE id = ?', id));

export function listProducts({ includeDrafts = false } = {}) {
  const rows = includeDrafts
    ? all("SELECT * FROM products WHERE status != 'archived' OR ? ORDER BY sort, id", 1)
    : all("SELECT * FROM products WHERE status = 'published' ORDER BY featured DESC, sort, id");
  return rows.map(hydrate);
}

export const activeDeliveryAreas = () =>
  all('SELECT * FROM delivery_areas WHERE active = 1 ORDER BY sort, name');

/** Which fulfilment methods can actually be offered for a product right now. */
export function fulfilmentOptions(p) {
  const site = getSetting('site');
  return {
    delivery: !!p.delivery_enabled && activeDeliveryAreas().length > 0,
    collection: !!p.collection_enabled && !!site.collectionAddress.trim(),
  };
}

/**
 * Required selling details. A product can be published (visible) before it is
 * ready, but it cannot be added to the bag until every item here is resolved.
 */
export function readiness(p) {
  const missing = [];
  const priced = (p.variants || []).filter(v => v.active && Number.isInteger(v.price) && v.price > 0);
  if (!priced.length) missing.push('At least one active size/variant with a price');
  if (!p.contents.trim() && !p.piece_count.trim()) missing.push('Contents or piece count');
  if (!p.ingredients.trim()) missing.push('Ingredients');
  if (!p.allergens.trim()) missing.push('Allergen information');
  if (!p.storage.trim()) missing.push('Storage guidance');
  if (p.lead_time_hours === null || p.lead_time_hours === undefined) missing.push('Preparation lead time');
  if (!(p.images || []).length) missing.push('At least one image');
  const f = fulfilmentOptions(p);
  if (!f.delivery && !f.collection) {
    missing.push(p.delivery_enabled
      ? 'Delivery is enabled but no active delivery area is configured'
      : 'A delivery or collection option (collection needs an address in Settings)');
  }
  return { ready: missing.length === 0, missing };
}

/** A variant can be sold if its product is purchasable and it has price and stock. */
export function variantSellable(p, v) {
  if (!p?.purchasable || !v || !v.active || !(v.price > 0)) return false;
  return v.stock === null || v.stock > 0;
}

export function getVariantWithProduct(variantId) {
  const v = one('SELECT * FROM variants WHERE id = ?', variantId);
  if (!v) return null;
  return { variant: v, product: getProduct(v.product_id) };
}

export function priceRange(p) {
  const prices = p.variants.filter(v => v.active && v.price > 0).map(v => v.price);
  if (!prices.length) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'product';
}

export function uniqueSlug(base, exceptId = 0) {
  let slug = slugify(base), n = 2;
  while (one('SELECT 1 FROM products WHERE slug = ? AND id != ?', slug, exceptId)) slug = `${slugify(base)}-${n++}`;
  return slug;
}

export function touchProduct(id) {
  run("UPDATE products SET updated_at = datetime('now') WHERE id = ?", id);
}
