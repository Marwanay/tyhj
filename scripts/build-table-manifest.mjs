// Writes the Build Your Dessert Table asset manifest and the two reference arrangement images.
//   node scripts/build-table-manifest.mjs
// Output: public/media/table/manifest.json — every menu item: its render (or that it is still
//         pending), the surfaces it can be served on with exact coordinates and scale, and how it
//         is arranged; plus the surfaces themselves and the reference arrangements.
//         public/media/table/arrangement-{1,2}.jpg — the arrangements composited on the empty table.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MENU, itemLabel } from '../src/services/menu.js';
import { ZONES, ARRANGEMENTS, TABLE_IMAGE, acceptsFor, assetFor, displayFor, placementBox, servingCategory } from '../src/services/table.js';
import { renderTablePreview } from '../src/services/table-preview.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'public/media/table');
const { width: W, height: H } = TABLE_IMAGE;
const r = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

// How each dessert is laid out in its render.
const ARRANGEMENT = {
  signature_cakes: 'One whole cake, centred on a cake stand', wedding_cakes_circle: 'One round cake on a cake stand',
  wedding_cakes_rectangle: 'One rectangular cake along the feature tray', cheesecakes: 'Whole cheesecake, or a cluster of individual cheesecakes',
  tarts: 'Whole tart, or a cluster of mini tarts', mini_cakes: 'A cluster of individual mini cakes',
  chocolates: 'Pieces in neat rows', brownies: 'Bars side by side in a single row', eclairs: 'Éclairs side by side in a single row',
  dessert_bowls: 'Individual servings grouped in the bowl or on the tray', mini_desserts: 'Pieces in neat rows or a small cluster',
  macaron_tower: 'Tower standing on its own plate', madlen_tower: 'Madeleines on each tier of the tiered stand',
  cookies: 'Pieces in neat rows or overlapping in the bowl', tray_desserts: 'One whole tray dessert along the feature tray',
};

const zones = ZONES.map(z => ({
  id: z.id, label: z.label, shape: z.shape,
  center: { x: r(z.x), y: r(z.y) }, size: { width: r(z.w), height: r(z.h) },
  pixels: { cx: Math.round(z.x * W), cy: Math.round(z.y * H), width: Math.round(z.w * W), height: Math.round(z.h * H) },
  compatibleCategories: z.categories,
}));

const products = MENU.flatMap(cat => cat.items.map(item => {
  const a = assetFor(item), d = displayFor(item);
  return {
    id: item.id, name: itemLabel(item), menuCategory: cat.name, servingCategory: servingCategory(item),
    status: a ? 'rendered' : 'render-pending',
    image: a ? a.src : null,
    imageSource: a ? `assets/source/${a.source}.png` : null,
    renderedOn: a ? (a.surface || 'reference vessel') : null,
    servingFootprint: a ? { cx: a.plate[0], cy: a.plate[1], width: a.plate[2], height: a.plate[3] } : null,
    arrangement: ARRANGEMENT[servingCategory(item)],
    placements: acceptsFor(item).map(id => {
      const z = ZONES.find(x => x.id === id), b = placementBox(z, d);
      return {
        zone: id, scale: r(b.scale, 3),
        box: { left: r(b.left), top: r(b.top), width: r(b.width), height: r(b.height) },
        pixels: { left: Math.round(b.left * W), top: Math.round(b.top * H), width: Math.round(b.width * W), height: Math.round(b.height * H) },
      };
    }),
  };
}));

const manifest = {
  table: { image: '/media/table/table-1536.jpg', width: W, height: H, note: 'The empty table never changes; desserts are separate transparent layers.' },
  coordinates: 'box values are fractions (0–1) of the table image width / height; pixels are on the 1536 × 1024 table image',
  rendering: {
    zOrder: 'table, then desserts from the back of the table to the front (by the bottom edge of their box)',
    scaleRule: 'a render keeps its offset from its own serving footprint; on another surface it is scaled to fit that surface (contain, aspect kept, 0.65–1.15)',
    animation: { durationMs: 450, startScale: 0.85, endScale: 1, fade: true },
  },
  summary: {
    products: products.length,
    rendered: products.filter(p => p.status === 'rendered').length,
    pending: products.filter(p => p.status === 'render-pending').map(p => p.id),
  },
  zones, products,
  arrangements: ARRANGEMENTS.map(a => ({ id: a.id, name: a.name, image: `/media/table/${a.id}.jpg`, items: a.items.map(({ zone, id }) => ({ zone, id })) })),
};
await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
for (const a of ARRANGEMENTS) {
  const { data } = await renderTablePreview(a.items);
  await fs.writeFile(path.join(out, `${a.id}.jpg`), data);
}
console.log(`${manifest.summary.rendered} of ${products.length} rendered; pending: ${manifest.summary.pending.length}`);
