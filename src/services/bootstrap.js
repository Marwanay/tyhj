// First-run setup, safe to call on every request: migrates the database, creates the
// policy pages and seeds each collection piece once. A fresh Neon database therefore
// sets itself up on the first visit after deploying.
import { init, one, all, run, insert, tx } from '../db.js';
import { ensurePages, loadSettings, setSetting, getSetting } from './content.js';
import { PRODUCT_MEDIA, COLLECTION_MEDIA } from '../views/media.js';

let done = null;

export function bootstrap() {
  done ||= (async () => {
    await init();
    await ensurePages();
    await loadSettings();
    await seedCollection();
    await replaceTieredTray();
    await updateSquareTrayWords();
    await syncCollectionImages();
  })().catch((err) => { done = null; throw err; });
  return done;
}

// Selling details the business has not supplied (price, ingredients, allergens, storage,
// piece count, lead time) are deliberately left empty, so a product is visible but cannot
// be purchased until the team completes them in the admin. Each is seeded only once, ever, so a
// product the team deletes does not come back.
// The fillings every chocolate tray in the collection offers (customers choose one per tray).
const TRAY_FILLINGS = ['Pecan caramel', 'Hazelnut praline', 'Pistachio cream', 'Mixed nuts', 'Croquant', 'Halawa pistachio cream'].join('\n');

export const SQUARE_TAGLINE = 'Rows of assorted chocolates around a vase of white lilies, in a clear square tray.';
export const SQUARE_DESCRIPTION = 'An assortment of our chocolates — glossy squares, rings and nut-topped pieces, some finished with a fleck of gold — set in neat rows in a clear square tray around a vase of white lilies.\n\nA centrepiece for engagements, celebrations and gifts that deserve a moment of their own.';
// The square tray's first words (before its photo was updated), replaced only if the team hasn't edited them.
const SQUARE_TAGLINE_V1 = 'Gold-flecked chocolates around a vase of white lilies, in a clear square tray.';

const COLLECTION = [
  {
    flag: 'seeded', lock: 724502, slug: 'signature-chocolate-tray', name: 'The Signature Chocolate Tray', featured: 1, media: PRODUCT_MEDIA,
    tagline: 'Gold-flecked chocolates and cream gerberas, presented in a clear tray.',
    description: 'Our signature centrepiece: rows of glossy chocolate domes, each finished with a fleck of gold, arranged in a clear tray and crowned with an arrangement of cream gerberas and folded leaves.\n\nDesigned to sit at the centre of the table — for engagements, celebrations and gifts that deserve a moment of their own.',
  },
  {
    flag: 'roundTraySeeded', lock: 724503, slug: 'signature-round-tray', name: 'The Signature Round Tray', featured: 0,
    tagline: 'Gold-flecked chocolates around a vase of cream gerberas, in a round clear tray.',
    description: 'The round companion to our Signature Chocolate Tray: glossy chocolate domes, each finished with a fleck of gold, arranged in a clear round tray with gold fittings around a vase of cream gerberas, small white blooms and folded leaves.\n\nMade to be the centrepiece of a round table — for engagements, celebrations and gifts that deserve a moment of their own.',
  },
  {
    // Was the tiered tray; replaceTieredTray() updates databases seeded before the change.
    flag: 'tieredTraySeeded', lock: 724504, slug: 'signature-square-tray', name: 'The Signature Square Tray', featured: 0,
    tagline: SQUARE_TAGLINE, description: SQUARE_DESCRIPTION,
  },
];

async function seedCollection() {
  for (const p of COLLECTION) await seedProduct({ media: COLLECTION_MEDIA[p.slug], ...p });
}

async function seedProduct({ flag, lock, slug, name, tagline, description, featured, media, fillings = TRAY_FILLINGS }) {
  if (getSetting('system')[flag]) return;
  await tx(async () => {
    await one('SELECT pg_advisory_xact_lock(?)', lock);
    await loadSettings();
    if (getSetting('system')[flag]) return;
    if (!(await one('SELECT 1 FROM products WHERE slug = ?', slug))) {
      const id = await insert(`INSERT INTO products (slug, name, tagline, description, fillings, status, featured, gift_message_enabled, delivery_enabled, collection_enabled)
        VALUES (?, ?, ?, ?, ?, 'published', ?, 1, 1, 0)`, slug, name, tagline, description, fillings, featured);
      await run('INSERT INTO variants (product_id, name, price, stock, sort) VALUES (?, ?, NULL, NULL, 0)', id, 'Signature size');
      let i = 0;
      for (const [key, m] of Object.entries(media)) {
        await run(`INSERT INTO product_images (product_id, media_key, source, alt, width, height, widths, placeholder, sort)
          VALUES (?, ?, 'static', ?, ?, ?, ?, ?, ?)`, id, key, m.alt, m.width, m.height, JSON.stringify(m.widths), m.placeholder, i++);
      }
    }
    await setSetting('system', { ...getSetting('system'), [flag]: true });
  });
}

// The tiered tray was replaced by the square tray (same place in the collection). On databases
// seeded before that, swap its name, address, words and gallery once; prices and selling details
// the team has entered are kept.
async function replaceTieredTray() {
  if (getSetting('system').squareTraySwapped) return;
  await tx(async () => {
    await one('SELECT pg_advisory_xact_lock(724505)');
    await loadSettings();
    if (getSetting('system').squareTraySwapped) return;
    const p = await one("SELECT id FROM products WHERE slug = 'signature-tiered-tray'");
    if (p && !(await one("SELECT 1 FROM products WHERE slug = 'signature-square-tray'"))) {
      await run(`UPDATE products SET slug = 'signature-square-tray', name = 'The Signature Square Tray', tagline = ?, description = ?, updated_at = now() WHERE id = ?`,
        SQUARE_TAGLINE, SQUARE_DESCRIPTION, p.id);
    }
    await setSetting('system', { ...getSetting('system'), squareTraySwapped: true });
  });
}

// The square tray's photo was updated to an assortment of chocolates: refresh its words once.
async function updateSquareTrayWords() {
  if (getSetting('system').squareTrayWordsV2) return;
  await run(`UPDATE products SET tagline = ?, description = ?, updated_at = now() WHERE slug = 'signature-square-tray' AND tagline = ?`,
    SQUARE_TAGLINE, SQUARE_DESCRIPTION, SQUARE_TAGLINE_V1);
  await setSetting('system', { ...getSetting('system'), squareTrayWordsV2: true });
}

/**
 * Keeps each collection piece's built-in gallery in step with the photos shipped with the site
 * (src/views/media.js). When a piece's photos are replaced, the old built-in images are swapped
 * for the new ones; photos the team uploaded in the admin are left alone. Cheap when nothing changed.
 */
async function syncCollectionImages() {
  for (const { slug } of COLLECTION) {
    const media = slug === 'signature-chocolate-tray' ? PRODUCT_MEDIA : COLLECTION_MEDIA[slug];
    const p = media && await one('SELECT id FROM products WHERE slug = ?', slug);
    if (!p) continue;
    const want = Object.keys(media);
    const have = (await all("SELECT media_key FROM product_images WHERE product_id = ? AND source = 'static' ORDER BY sort, id", p.id)).map(r => r.media_key);
    if (want.join() === have.join()) continue;
    await tx(async () => {
      await one('SELECT id FROM products WHERE id = ? FOR UPDATE', p.id);
      await run("DELETE FROM product_images WHERE product_id = ? AND source = 'static'", p.id);
      let i = 0;
      for (const [key, m] of Object.entries(media)) {
        await run(`INSERT INTO product_images (product_id, media_key, source, alt, width, height, widths, placeholder, sort)
          VALUES (?, ?, 'static', ?, ?, ?, ?, ?, ?)`, p.id, key, m.alt, m.width, m.height, JSON.stringify(m.widths), m.placeholder, i++);
      }
    });
  }
}
