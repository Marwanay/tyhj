// First-run setup, safe to call on every request: migrates the database, creates the
// policy pages and seeds the launch product once. A fresh Neon database therefore
// sets itself up on the first visit after deploying.
import { init, one, run, insert, tx } from '../db.js';
import { ensurePages, loadSettings, setSetting, getSetting } from './content.js';
import { PRODUCT_MEDIA, ROUND_TRAY_MEDIA } from '../views/media.js';

let done = null;

export function bootstrap() {
  done ||= (async () => {
    await init();
    await ensurePages();
    await loadSettings();
    await seedLaunchProduct();
    await seedRoundTray();
  })().catch((err) => { done = null; throw err; });
  return done;
}

// Selling details the business has not supplied (price, ingredients, allergens, storage,
// piece count, lead time) are deliberately left empty, so the product is visible but cannot
// be purchased until the team completes them in the admin. Seeded only once, ever, so a
// product the team deletes does not come back.
async function seedLaunchProduct() {
  if (getSetting('system').seeded) return;
  await tx(async () => {
    await one("SELECT pg_advisory_xact_lock(724502)");
    await loadSettings();
    if (getSetting('system').seeded) return;
    if (!(await one("SELECT 1 FROM products WHERE slug = 'signature-chocolate-tray'"))) {
      const id = await insert(`INSERT INTO products (slug, name, tagline, description, status, featured, gift_message_enabled, delivery_enabled, collection_enabled)
        VALUES (?, ?, ?, ?, 'published', 1, 1, 1, 0)`,
        'signature-chocolate-tray', 'The Signature Chocolate Tray',
        'Gold-flecked chocolates and cream gerberas, presented in a clear tray.',
        'Our signature centrepiece: rows of glossy chocolate domes, each finished with a fleck of gold, arranged in a clear tray and crowned with an arrangement of cream gerberas and folded leaves.\n\nDesigned to sit at the centre of the table — for engagements, celebrations and gifts that deserve a moment of their own.');
      await run('INSERT INTO variants (product_id, name, price, stock, sort) VALUES (?, ?, NULL, NULL, 0)', id, 'Signature size');
      let i = 0;
      for (const [key, m] of Object.entries(PRODUCT_MEDIA)) {
        await run(`INSERT INTO product_images (product_id, media_key, source, alt, width, height, widths, placeholder, sort)
          VALUES (?, ?, 'static', ?, ?, ?, ?, ?, ?)`, id, key, m.alt, m.width, m.height, JSON.stringify(m.widths), m.placeholder, i++);
      }
    }
    await setSetting('system', { ...getSetting('system'), seeded: true });
  });
}

// The second collection piece, seeded the same way (once, ever; price and selling details are
// completed by the team in the admin before it can be bought).
async function seedRoundTray() {
  if (getSetting('system').roundTraySeeded) return;
  await tx(async () => {
    await one("SELECT pg_advisory_xact_lock(724503)");
    await loadSettings();
    if (getSetting('system').roundTraySeeded) return;
    if (!(await one("SELECT 1 FROM products WHERE slug = 'signature-round-tray'"))) {
      const id = await insert(`INSERT INTO products (slug, name, tagline, description, status, featured, gift_message_enabled, delivery_enabled, collection_enabled)
        VALUES (?, ?, ?, ?, 'published', 0, 1, 1, 0)`,
        'signature-round-tray', 'The Signature Round Tray',
        'Gold-flecked chocolates around a vase of cream gerberas, in a round clear tray.',
        'The round companion to our Signature Chocolate Tray: glossy chocolate domes, each finished with a fleck of gold, arranged in a clear round tray with gold fittings around a vase of cream gerberas, small white blooms and folded leaves.\n\nMade to be the centrepiece of a round table — for engagements, celebrations and gifts that deserve a moment of their own.');
      await run('INSERT INTO variants (product_id, name, price, stock, sort) VALUES (?, ?, NULL, NULL, 0)', id, 'Signature size');
      let i = 0;
      for (const [key, m] of Object.entries(ROUND_TRAY_MEDIA)) {
        await run(`INSERT INTO product_images (product_id, media_key, source, alt, width, height, widths, placeholder, sort)
          VALUES (?, ?, 'static', ?, ?, ?, ?, ?, ?)`, id, key, m.alt, m.width, m.height, JSON.stringify(m.widths), m.placeholder, i++);
      }
    }
    await setSetting('system', { ...getSetting('system'), roundTraySeeded: true });
  });
}
