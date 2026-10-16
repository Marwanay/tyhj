// First-run setup, safe to call on every request: migrates the database, creates the
// policy pages and seeds each collection piece once. A fresh Neon database therefore
// sets itself up on the first visit after deploying.
import { init, one, run, insert, tx } from '../db.js';
import { ensurePages, loadSettings, setSetting, getSetting } from './content.js';
import { PRODUCT_MEDIA, COLLECTION_MEDIA } from '../views/media.js';

let done = null;

export function bootstrap() {
  done ||= (async () => {
    await init();
    await ensurePages();
    await loadSettings();
    await seedCollection();
  })().catch((err) => { done = null; throw err; });
  return done;
}

// Selling details the business has not supplied (price, ingredients, allergens, storage,
// piece count, lead time) are deliberately left empty, so a product is visible but cannot
// be purchased until the team completes them in the admin. Each is seeded only once, ever, so a
// product the team deletes does not come back.
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
    flag: 'tieredTraySeeded', lock: 724504, slug: 'signature-tiered-tray', name: 'The Signature Tiered Tray', featured: 0,
    tagline: 'Three clear tiers of gold-flecked chocolates around a vase of white lilies.',
    description: 'Our signature chocolates raised in three tiers: glossy chocolate domes, each finished with a fleck of gold, set in clear square trays that step up around a tall vase of white lilies.\n\nA statement piece with height — for engagements, celebrations and gifts that deserve a moment of their own.',
  },
];

async function seedCollection() {
  for (const p of COLLECTION) await seedProduct({ media: COLLECTION_MEDIA[p.slug], ...p });
}

async function seedProduct({ flag, lock, slug, name, tagline, description, featured, media }) {
  if (getSetting('system')[flag]) return;
  await tx(async () => {
    await one('SELECT pg_advisory_xact_lock(?)', lock);
    await loadSettings();
    if (getSetting('system')[flag]) return;
    if (!(await one('SELECT 1 FROM products WHERE slug = ?', slug))) {
      const id = await insert(`INSERT INTO products (slug, name, tagline, description, status, featured, gift_message_enabled, delivery_enabled, collection_enabled)
        VALUES (?, ?, ?, ?, 'published', ?, 1, 1, 0)`, slug, name, tagline, description, featured);
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
