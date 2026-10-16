// Products, variants, images and the "ready to sell" rules.
import { one, all, run } from '../db.js';
import { getSetting } from './content.js';

async function hydrate(p, areaCount) {
  if (!p) return null;
  p.images = (await all('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort, id', p.id))
    .map(i => ({ ...i, widths: JSON.parse(i.widths) }));
  p.variants = await all('SELECT * FROM variants WHERE product_id = ? ORDER BY sort, id', p.id);
  if (areaCount === undefined) areaCount = await activeAreaCount();
  p.fulfilment = fulfilmentOptions(p, areaCount);
  p.readiness = readiness(p);
  p.purchasable = p.status === 'published' && p.readiness.ready;
  return p;
}

export const getProductBySlug = async (slug) => hydrate(await one('SELECT * FROM products WHERE slug = ?', slug));
export const getProduct = async (id) => hydrate(await one('SELECT * FROM products WHERE id = ?', id));

export async function listProducts({ includeDrafts = false } = {}) {
  const rows = includeDrafts
    ? await all("SELECT * FROM products ORDER BY (status = 'archived'), sort, id")
    : await all("SELECT * FROM products WHERE status = 'published' ORDER BY featured DESC, sort, id");
  const areas = await activeAreaCount();
  return Promise.all(rows.map(r => hydrate(r, areas)));
}

export const activeDeliveryAreas = () => all('SELECT * FROM delivery_areas WHERE active = 1 ORDER BY sort, name');
const activeAreaCount = async () => (await one('SELECT COUNT(*)::int AS n FROM delivery_areas WHERE active = 1')).n;

/** Which fulfilment methods can actually be offered for a product right now. */
export function fulfilmentOptions(p, areaCount) {
  const site = getSetting('site');
  return {
    delivery: !!p.delivery_enabled && areaCount > 0,
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
  const f = p.fulfilment;
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

export async function getVariantWithProduct(variantId) {
  if (!Number.isInteger(variantId) || variantId <= 0) return null;
  const v = await one('SELECT * FROM variants WHERE id = ?', variantId);
  if (!v) return null;
  return { variant: v, product: await getProduct(v.product_id) };
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

export async function uniqueSlug(base, exceptId = 0) {
  let slug = slugify(base), n = 2;
  while (await one('SELECT 1 FROM products WHERE slug = ? AND id != ?', slug, exceptId)) slug = `${slugify(base)}-${n++}`;
  return slug;
}

export const touchProduct = (id) => run('UPDATE products SET updated_at = now() WHERE id = ?', id);
