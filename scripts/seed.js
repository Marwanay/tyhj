// Seeds the launch product from the approved renders. Selling details that the business
// has not supplied (price, ingredients, allergens, storage, piece count, lead time) are
// deliberately left empty, so the product is visible but cannot be purchased until the
// team completes them in the admin.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { one, run, tx } from '../src/db.js';
import { processImage } from '../src/lib/images.js';
import { ensurePages } from '../src/services/content.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => path.join(root, 'assets/source', f);

export async function seed({ quiet = false } = {}) {
  ensurePages();
  if (one("SELECT 1 FROM products WHERE slug = 'signature-chocolate-tray'")) { if (!quiet) console.log('Signature tray already present — nothing to seed.'); return; }
  const images = [
    { key: 'signature-tray-studio', file: src('signature-tray-studio.png'), alt: 'The Signature Chocolate Tray: rows of gold-flecked chocolate domes in a clear tray, with cream gerberas and folded leaves at one end' },
    { key: 'signature-tray-table', file: src('signature-tray-table.png'), alt: 'The Signature Chocolate Tray as a centrepiece on a dining table set with blush napkins and crystal glasses' },
    { key: 'signature-tray-detail', file: src('signature-tray-studio.png'), crop: { left: 600, top: 640, width: 600, height: 600 }, alt: 'Close-up of the glossy chocolate domes and their gold details' },
    { key: 'signature-tray-flowers', file: src('signature-tray-studio.png'), crop: { left: 30, top: 20, width: 620, height: 760 }, alt: 'The cream gerbera arrangement at the head of the tray' },
  ];
  const processed = [];
  for (const img of images) processed.push({ ...img, out: await processImage(img.file, img.key, { crop: img.crop }) });

  tx(() => {
    const info = run(`INSERT INTO products (slug, name, tagline, description, status, featured, gift_message_enabled, delivery_enabled, collection_enabled)
      VALUES (?, ?, ?, ?, 'published', 1, 1, 1, 0)`,
      'signature-chocolate-tray', 'The Signature Chocolate Tray',
      'Gold-flecked chocolates and cream gerberas, presented in a clear tray.',
      'Our signature centrepiece: rows of glossy chocolate domes, each finished with a fleck of gold, arranged in a clear tray and crowned with an arrangement of cream gerberas and folded leaves.\n\nDesigned to sit at the centre of the table — for engagements, celebrations and gifts that deserve a moment of their own.');
    const id = info.lastInsertRowid;
    run('INSERT INTO variants (product_id, name, price, stock, sort) VALUES (?, ?, NULL, NULL, 0)', id, 'Signature size');
    processed.forEach((p, i) => run('INSERT INTO product_images (product_id, media_key, alt, width, height, widths, sort) VALUES (?,?,?,?,?,?,?)',
      id, p.key, p.alt, p.out.width, p.out.height, JSON.stringify(p.out.widths), i));
  });
  if (!quiet) console.log('Seeded “The Signature Chocolate Tray” (published, not yet purchasable — complete its selling details in the admin).');
}

if (import.meta.url === `file://${process.argv[1]}`) await seed();
