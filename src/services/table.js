// Build Your Dessert Table — the serving surfaces of the empty overhead table and the dessert
// assets that appear on them.
//
// The table photo (public/media/table/table-1536.jpg, 1536 × 1024) never changes. Each dessert
// is its own transparent image (public/media/table/desserts/<id>.webp) that appears on one
// surface when chosen and disappears when removed.
//
// Surfaces:  src/data/table-placement.js  (R01–R07 cake stands, S01–S02 raised trays,
//            P01–P02 scalloped bowls, T01–T04 gold trays, M01–M04 small stands)
// Assets:    src/data/table-assets.js      (written by scripts/extract-table-desserts.py)
// Manifest:  public/media/table/manifest.json (written by scripts/build-table-manifest.mjs)
//
// Every position is stored normalised (0–1 of the table's width / height) so the browser, the
// server-side preview and the manifest all share one coordinate system.
import placement from '../data/table-placement.js';
import assets from '../data/table-assets.js';

const W = 1536, H = 1024;
export const TABLE_IMAGE = { width: W, height: H };

const SHAPE_LABELS = { round: 'Cake stand', square: 'Raised marble tray', shell: 'Scalloped bowl', rect: 'Gold tray' };
const label = (z) => z.id.startsWith('M') ? 'Small stand' : SHAPE_LABELS[z.shape] || 'Serving surface';

export const ZONES = placement.zones.map(z => ({
  id: z.id, kind: z.id, shape: z.shape === 'round' || z.shape === 'shell' ? 'ellipse' : 'rect', label: `${label(z)} ${z.id}`,
  x: z.center.x / 100, y: z.center.y / 100, w: z.bounds.width / 100, h: z.bounds.height / 100,
  categories: z.compatibleCategories, safeScale: z.safeScale,
}));
export const ZONE_LABELS = Object.fromEntries(ZONES.map(z => [z.id, z.label]));
const ZONE = new Map(ZONES.map(z => [z.id, z]));

// Each menu item's serving category (the categories the surfaces accept).
const CATEGORY = {
  'chocolate-cake': 'signature_cakes', 'raspberry-cake': 'signature_cakes', 'pistachio-cake': 'signature_cakes',
  'lemon-berry-cake': 'signature_cakes', 'cherry-cake': 'signature_cakes', 'assorted-mini-cakes': 'mini_cakes',
  'raspberry-wedding-round': 'wedding_cakes_circle', 'tiramisu-wedding-round': 'wedding_cakes_circle',
  'raspberry-wedding-rect': 'wedding_cakes_rectangle', 'tiramisu-wedding-rect': 'wedding_cakes_rectangle',
  'lemon-berry-tart': 'tarts', 'mini-tarts': 'tarts', 'classic-cheesecake': 'cheesecakes', 'mini-cheesecakes': 'cheesecakes',
  'brownie-bar-pistachio': 'brownies', 'mini-eclairs': 'eclairs', 'macaron-tower': 'macaron_tower', 'madeleine-tower': 'madlen_tower',
  'mini-cupcakes': 'mini_desserts', 'mousse-cups': 'mini_desserts', 'mini-macarons': 'mini_desserts',
  'florentine-cookies': 'cookies', 'florentine-slices': 'cookies',
};
const BY_MENU_CATEGORY = { 'chocolate-delights': 'chocolates', 'dessert-bowls': 'dessert_bowls', 'big-trays': 'tray_desserts' };
export const servingCategory = (item) => CATEGORY[item.id] || BY_MENU_CATEGORY[item.category] || 'mini_desserts';

// Where the extra surfaces come from: a dessert may also go where the reference arrangement
// served it (its own surface), and some never move (the madeleines fill the tiered stand).
const ONLY = { 'madeleine-tower': ['M03'] };
// Served there in the reference arrangements: mini tarts in a scalloped bowl, cupcakes on the feature tray.
const EXTRA = { 'mini-tarts': ['P01', 'P02'], 'mini-cupcakes': ['T02'] };

// Asset scale limits: smaller than MIN_SCALE and pieces would look unrealistically tiny on the
// surface; larger than MAX_SCALE and the image would be blown up past its resolution.
const MIN_SCALE = 0.65, MAX_SCALE = 1.15;

export function assetFor(item) {
  const a = assets[item.id];
  return a ? { ...a } : null;
}

/** Scale that fits a dessert's own serving footprint inside a surface (contain, never distorted). */
export function scaleOn(zone, asset) {
  const [, , pw, ph] = asset.plate;
  return Math.min(MAX_SCALE, (zone.w * W) / pw, (zone.h * H) / ph);
}

/**
 * Surfaces a dessert can be served on (zone ids): those that accept its serving category, plus
 * the surface its render was made on and that surface's siblings (another cake stand, another
 * raised tray) — as long as the render fits without being shrunk below MIN_SCALE.
 */
export function acceptsFor(item) {
  if (ONLY[item.id]) return ONLY[item.id];
  const cat = servingCategory(item), a = assetFor(item);
  const family = a?.surface?.charAt(0);
  return ZONES.filter(zn => {
    if (a && zn.id === a.surface) return true;
    if (!zn.categories.includes(cat) && zn.id.charAt(0) !== family && !EXTRA[item.id]?.includes(zn.id)) return false;
    return !a || scaleOn(zn, a) >= MIN_SCALE;
  }).map(zn => zn.id);
}

// ---- How each dessert is drawn ------------------------------------------------------------------
// asset:   the dessert's own transparent render, placed by its serving footprint.
// pending: no render yet — a place card with the dessert's name (never a stand-in image).
export function displayFor(item) {
  const a = assetFor(item);
  return a ? { mode: 'asset', src: a.src, rect: a.rect, plate: a.plate, surface: a.surface } : { mode: 'pending' };
}

/**
 * Where a dessert's image goes on a surface, in normalised table units: { left, top, width, height }.
 * The asset keeps its offset from its own serving footprint, scaled to the new surface — so on the
 * surface it was rendered on it lands exactly where it was rendered. The browser, the preview and
 * the manifest all use this.
 */
export function placementBox(zone, display) {
  if (display.mode === 'asset') {
    const [x, y, w, h] = display.rect, [cx, cy] = display.plate;
    const s = display.surface === zone.id ? 1 : scaleOn(zone, display);
    return {
      left: (zone.x * W + (x - cx) * s) / W, top: (zone.y * H + (y - cy) * s) / H,
      width: (w * s) / W, height: (h * s) / H, scale: s,
    };
  }
  const width = zone.w * 0.8, height = zone.h * 0.8;
  return { left: zone.x - width / 2, top: zone.y - height / 2, width, height, scale: 1 };
}

/**
 * A design posted with an enquiry: [{ zone, id, qty }]. Rejects unknown surfaces or desserts,
 * desserts on surfaces that can't hold them, and duplicate surfaces; quantities are snapped.
 */
export function parseDesign(raw, menuItems) {
  let data;
  try { data = JSON.parse(String(raw || '')); } catch { return []; }
  const items = Array.isArray(data?.items) ? data.items.slice(0, ZONES.length) : [];
  const seen = new Set(), out = [];
  for (const it of items) {
    const zn = ZONE.get(it?.zone), p = menuItems.get(it?.id);
    if (!zn || !p || seen.has(zn.id) || !acceptsFor(p).includes(zn.id)) continue;
    seen.add(zn.id);
    const n = Number(it.qty);
    const qty = Number.isFinite(n) && n > 0 ? Math.min(p.max, Math.max(p.step, Math.round(n / p.step) * p.step)) : p.step;
    out.push({ zone: zn.id, id: p.id, qty });
  }
  return out;
}

// The two reference arrangements, rebuilt from the individual renders on the empty table.
// 1 follows reference arrangement A; 2 and 3 hold the rendered menu items that are not in 1
// (one dessert per surface, so they don't all fit on one table).
export const ARRANGEMENTS = [
  {
    id: 'arrangement-1', name: 'Reference arrangement 1',
    items: [
      ['R01', 'chocolate-cake'], ['R02', 'assorted-mini-cakes'], ['R03', 'raspberry-cake'], ['R05', 'pistachio-cake'],
      ['R06', 'cherry-cake'], ['R07', 'lemon-berry-cake'], ['M01', 'macaron-tower'], ['M03', 'madeleine-tower'],
      ['P01', 'nutella-profiterole'], ['P02', 'mini-tarts'], ['S01', 'mini-eclairs'], ['S02', 'mousse-cups'],
      ['T01', 'chocolate-pieces'], ['T02', 'mini-cupcakes'], ['T03', 'brownie-bar-pistachio'],
    ],
  },
  {
    id: 'arrangement-2', name: 'Reference arrangement 2',
    items: [
      ['R01', 'classic-cheesecake'], ['R02', 'mini-cheesecakes'], ['R03', 'raspberry-wedding-round'], ['R06', 'lemon-berry-tart'],
      ['P01', 'meringue-berries'], ['P02', 'rocher-caramel'], ['S01', 'mango-bowl'], ['S02', 'blueberry-bowl'],
      ['T01', 'mini-chocolate-sticks'], ['T02', 'tiramisu-tray'], ['T03', 'praline-truffles'], ['T04', 'pistachio-rocher'],
    ],
  },
  {
    id: 'arrangement-3', name: 'Reference arrangement 3 (the rest of the rendered menu)',
    items: [
      ['S01', 'cherry-bowl'], ['S02', 'twix-mousse'], ['P02', 'caramel-pecan'], ['T01', 'ferrero-rocher'],
      ['T02', 'mini-macarons'], ['T03', 'snickers-bites'], ['T04', 'florentine-slices'],
    ],
  },
].map(a => ({ ...a, items: a.items.map(([zone, id]) => ({ zone, id, qty: 1 })) }));
