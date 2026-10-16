// Build Your Dessert Table — the serving surfaces of the overhead table photo
// (assets/source/dessert-table-overhead.png, 1536 × 1024) and how desserts sit on them.
//
// Coordinates are measured on the photo and stored normalised (0–1 of width / height),
// so overlays, hit areas and the server-side preview all share one coordinate system.
// Round surfaces are ellipses (the table is seen from ~60° above); trays are rectangles.

const W = 1536, H = 1024;

// [id, kind, shape, centre x, centre y, half-width, half-height] in photo pixels.
const RAW = [
  // Large round marble cake stands
  ['stand-centre', 'stand-lg', 'ellipse', 770, 218, 95, 52],
  ['stand-top-left', 'stand-lg', 'ellipse', 435, 240, 85, 47],
  ['stand-top-right', 'stand-lg', 'ellipse', 1156, 248, 83, 48],
  // Medium round stands
  ['stand-left', 'stand-md', 'ellipse', 263, 371, 83, 48],
  ['stand-right', 'stand-md', 'ellipse', 1056, 396, 80, 47],
  ['stand-inner-left', 'stand-md', 'ellipse', 578, 286, 66, 40],
  ['stand-inner-right', 'stand-md', 'ellipse', 948, 283, 72, 42],
  // Small platters in gold frames (minis)
  ['platter-frame-top', 'platter-sm', 'ellipse', 143, 289, 51, 30],
  ['platter-frame-mid', 'platter-sm', 'ellipse', 131, 415, 47, 28],
  ['platter-frame-low', 'platter-sm', 'ellipse', 160, 556, 45, 26],
  // Scalloped round platters
  ['shell-left', 'platter-md', 'ellipse', 420, 519, 80, 50],
  ['shell-right', 'platter-md', 'ellipse', 1232, 515, 84, 52],
  ['shell-small', 'platter-sm', 'ellipse', 1265, 378, 56, 33],
  // Tiered stand (right edge) — towers and tiered minis
  ['tiers', 'tower', 'ellipse', 1446, 470, 82, 44],
  // Rectangular marble trays
  ['tray-raised-left', 'tray-md', 'rect', 657, 474, 96, 46],
  ['tray-raised-right', 'tray-md', 'rect', 861, 474, 95, 46],
  ['tray-centre', 'tray-feature', 'rect', 768, 626, 216, 40],
  ['tray-front-left', 'tray-lg', 'rect', 340, 714, 158, 56],
  ['tray-front-centre', 'tray-lg', 'rect', 779, 754, 163, 46],
  ['tray-front-right', 'tray-lg', 'rect', 1260, 722, 193, 58],
  // Glass dessert bowls
  ['bowl-left', 'bowl', 'ellipse', 505, 456, 34, 22],
  ['bowl-pink', 'bowl', 'ellipse', 1058, 566, 48, 28],
  ['bowl-front', 'bowl', 'ellipse', 1006, 727, 34, 22],
];

export const ZONE_LABELS = {
  'stand-lg': 'Large cake stand', 'stand-md': 'Cake stand', 'platter-sm': 'Small platter', 'platter-md': 'Round platter',
  tower: 'Tiered display', 'tray-md': 'Raised tray', 'tray-lg': 'Marble tray', 'tray-feature': 'Feature tray', bowl: 'Glass bowl',
};

export const ZONES = RAW.map(([id, kind, shape, x, y, rx, ry]) => ({
  id, kind, shape, label: ZONE_LABELS[kind],
  x: x / W, y: y / H, w: (rx * 2) / W, h: (ry * 2) / H,
}));

export const TABLE_IMAGE = { width: W, height: H };

// ---- Which surfaces each dessert can be served on --------------------------------------------
const STANDS = ['stand-lg', 'stand-md'];
const MINIS = ['platter-md', 'platter-sm', 'tower', 'tray-md'];
const TRAYS = ['tray-lg', 'tray-md', 'tray-feature', 'platter-md'];
const BY_CATEGORY = {
  'signature-cakes': STANDS, 'wedding-cakes': ['stand-lg'], 'tarts-cheesecakes': ['stand-md', 'stand-lg', 'platter-md'],
  'chocolate-delights': [...TRAYS, 'platter-sm'], 'dessert-bowls': ['bowl', 'platter-md'], 'mini-desserts': MINIS,
  towers: ['tower', 'stand-lg'], 'cookies-slices': ['tray-md', 'tray-lg', 'platter-md', 'platter-sm'], 'big-trays': ['tray-feature', 'tray-lg'],
};
const ACCEPTS = {
  'assorted-mini-cakes': MINIS, 'mini-cheesecakes': MINIS, 'mini-tarts': MINIS,
  'raspberry-wedding-rect': ['tray-feature', 'tray-md', 'tray-lg'], 'tiramisu-wedding-rect': ['tray-feature', 'tray-md', 'tray-lg'],
  'mousse-cups': ['bowl', 'platter-md', 'tray-md'], 'mini-eclairs': ['tray-lg', 'tray-md', 'tray-feature'],
};
export const acceptsFor = (item) => ACCEPTS[item.id] || BY_CATEGORY[item.category] || [];

// ---- How each dessert is drawn on the table ------------------------------------------------
// cutout: transparent image standing on the surface (width = surface width × fit; its base sits
//         `lift` × surface height below the surface centre).
// fill:   a crop of a real photo filling the surface, feathered at the edges (never stretched).
// card:   no approved image yet — an elegant place card with the dessert's name.
const M = (f) => `/media/menu/${f}.webp`, T = (f) => `/media/table/${f}.webp`;
// maxH caps a cut-out's height at maxH × the surface height, so wide trays don't make desserts tower.
const CAKE = { mode: 'cutout', fit: 0.86, lift: 0.18, maxH: 2.4 };
const GROUP = { mode: 'cutout', fit: 0.8, lift: 0.4, maxH: 1.25 };
// Width / height of each cut-out (scripts/cut-menu-art.py output), for the height cap.
const ASPECT = {
  'menu/assorted-mini-cakes': 1.962, 'menu/brownie-bar-pistachio': 1.714, 'menu/caramel-pecan': 1.898, 'menu/cherry-cake': 1.645,
  'menu/chocolate-cake': 1.722, 'menu/classic-cheesecake': 2.118, 'menu/ferrero-rocher': 1.603, 'menu/lemon-berry-cake': 1.625,
  'menu/lemon-berry-tart': 2.146, 'menu/mini-chocolate-sticks': 1.617, 'menu/mini-tarts': 1.864, 'menu/pistachio-cake': 1.979,
  'menu/raspberry-cake': 1.696, 'menu/raspberry-wedding': 1.671, 'menu/snickers-bites': 1.451, 'menu/tiramisu-wedding': 1.879,
  'table/macaron-tower': 0.56, 'table/mini-eclairs': 2.232,
};
const DISPLAY = {
  'chocolate-cake': { ...CAKE, src: M('chocolate-cake') }, 'raspberry-cake': { ...CAKE, src: M('raspberry-cake') },
  'pistachio-cake': { ...CAKE, src: M('pistachio-cake') }, 'lemon-berry-cake': { ...CAKE, src: M('lemon-berry-cake') },
  'cherry-cake': { ...CAKE, src: M('cherry-cake') }, 'raspberry-wedding-round': { ...CAKE, fit: 0.9, src: M('raspberry-cake') },
  'lemon-berry-tart': { ...CAKE, fit: 0.9, lift: 0.22, src: M('lemon-berry-tart') }, 'classic-cheesecake': { ...CAKE, src: M('classic-cheesecake') },
  'raspberry-wedding-rect': { mode: 'cutout', fit: 0.62, lift: 0.55, maxH: 1.45, src: M('raspberry-wedding') },
  'tiramisu-wedding-rect': { mode: 'cutout', fit: 0.62, lift: 0.55, maxH: 1.45, src: M('tiramisu-wedding') },
  'assorted-mini-cakes': { ...GROUP, src: M('assorted-mini-cakes') }, 'mini-tarts': { ...GROUP, src: M('mini-tarts') },
  'mini-chocolate-sticks': { ...GROUP, src: M('mini-chocolate-sticks') }, 'brownie-bar-pistachio': { ...GROUP, src: M('brownie-bar-pistachio') },
  'caramel-pecan': { ...GROUP, src: M('caramel-pecan') }, 'snickers-bites': { ...GROUP, src: M('snickers-bites') },
  'ferrero-rocher': { ...GROUP, src: M('ferrero-rocher') },
  // From real Cocoa Caramel event photographs.
  'mini-eclairs': { mode: 'cutout', fit: 0.96, lift: 0.5, maxH: 1.4, src: T('mini-eclairs'), real: true },
  'macaron-tower': { mode: 'cutout', fit: 0.92, lift: 0.22, maxH: 9, src: T('macaron-tower'), real: true },
  'chocolate-pieces': { mode: 'fill', fit: 0.9, src: T('chocolate-pieces-fill'), real: true },
  'mini-cheesecakes': { mode: 'fill', fit: 0.86, src: T('mini-cheesecakes-fill'), real: true },
};
export function displayFor(item) {
  const d = DISPLAY[item.id];
  if (d) return { concept: !d.real, ...d, aspect: ASPECT[d.src.replace(/^\/media\//, '').replace(/\.webp$/, '')] || 0 };
  // Desserts in glasses have no approved photograph yet: shown as a place card, not a drawing.
  return { mode: 'card' };
}

/**
 * Where a dessert's image goes on a surface, in normalised table units.
 * cutout → { left, bottom, width } (height follows the image); fill/glass/card → { left, top, width, height }.
 * The browser and the server-side preview both use this, so they always agree.
 */
export function placementBox(zone, display) {
  const kindFit = zone.kind === 'platter-sm' ? 1.05 : 1;
  if (display.mode === 'cutout') {
    // zone.h is in table-height units; convert the height cap to width units via the table's 3:2 shape.
    const cap = display.aspect && display.maxH ? zone.h * display.maxH * display.aspect * (H / W) : Infinity;
    const width = Math.min(zone.w * display.fit * kindFit, cap);
    return { left: zone.x - width / 2, bottom: zone.y + (zone.h / 2) * display.lift, width };
  }
  const f = display.mode === 'card' ? 0.8 : display.fit || 0.9;
  const width = zone.w * f, height = zone.h * f;
  return { left: zone.x - width / 2, top: zone.y - height / 2, width, height };
}

/**
 * A design posted with an enquiry: [{ zone, id, qty }]. Rejects unknown surfaces or desserts,
 * desserts on surfaces that can't hold them, and duplicate surfaces; quantities are snapped.
 */
export function parseDesign(raw, menuItems) {
  let data;
  try { data = JSON.parse(String(raw || '')); } catch { return []; }
  const items = Array.isArray(data?.items) ? data.items.slice(0, ZONES.length) : [];
  const zones = new Map(ZONES.map(z => [z.id, z])), seen = new Set(), out = [];
  for (const it of items) {
    const z = zones.get(it?.zone), p = menuItems.get(it?.id);
    if (!z || !p || seen.has(z.id) || !acceptsFor(p).includes(z.kind)) continue;
    seen.add(z.id);
    const n = Number(it.qty);
    const qty = Number.isFinite(n) && n > 0 ? Math.min(p.max, Math.max(p.step, Math.round(n / p.step) * p.step)) : p.step;
    out.push({ zone: z.id, id: p.id, qty });
  }
  return out;
}
