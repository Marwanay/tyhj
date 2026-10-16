// The catering menu (Cocoa Caramel Menu 2025). Clients pick quantities while requesting
// a quote: chocolates by weight in half-kilo steps, everything else by count. Prices are
// not shown — the team prices the selection when preparing the quote.
//
// Item ids are stored with each enquiry, so keep existing ids stable when editing names.

const pieces = { unit: 'piece', step: 1, max: 2000 };
const whole = (unit) => ({ unit, step: 1, max: 100 });

export const MENU = [
  {
    id: 'signature-cakes', name: 'Signature Cakes', ...whole('cake'),
    items: [
      ['chocolate-cake', 'Chocolate Cake'],
      ['raspberry-cake', 'Raspberry Cake'],
      ['pistachio-cake', 'Pistachio Cake'],
      ['lemon-berry-cake', 'Lemon & Berry Cake'],
      ['cherry-cake', 'Cherry Cake'],
      ['assorted-mini-cakes', 'Assorted Mini Cakes', 'Various flavours', pieces],
    ],
  },
  {
    id: 'wedding-cakes', name: 'Big Cakes for Weddings', ...whole('cake'),
    items: [
      ['raspberry-wedding-round', 'Raspberry Cake', 'Round'],
      ['raspberry-wedding-rect', 'Raspberry Cake', 'Rectangle'],
      ['tiramisu-wedding-round', 'Tiramisu Cake', 'Round'],
      ['tiramisu-wedding-rect', 'Tiramisu Cake', 'Rectangle'],
    ],
  },
  {
    id: 'tarts-cheesecakes', name: 'Tarts & Cheesecakes', ...pieces,
    items: [
      ['lemon-berry-tart', 'Lemon & Berry Tart', '', whole('tart')],
      ['classic-cheesecake', 'Classic Cheesecake', 'Varieties', whole('cheesecake')],
      ['mini-cheesecakes', 'Mini Cheesecakes'],
      ['mini-tarts', 'Mini Tarts', 'Assorted flavours'],
    ],
  },
  {
    id: 'chocolate-delights', name: 'Chocolate Delights', unit: 'kg', step: 0.5, max: 100,
    items: [
      ['mini-chocolate-sticks', 'Mini Chocolate Sticks', 'Assorted flavours'],
      ['chocolate-pieces', 'Chocolate Pieces'],
      ['brownie-bar-pistachio', 'Brownie Bar with Pistachio'],
      ['caramel-pecan', 'Caramel Pecan'],
      ['snickers-bites', 'Snickers Bites'],
      ['ferrero-rocher', 'Ferrero Rocher'],
      ['praline-truffles', 'Praline Truffles'],
      ['raspberry-cheesecake-bites', 'Raspberry Cheesecake Bites'],
      ['rocher-caramel', 'Rocher Caramel'],
      ['pistachio-rocher', 'Pistachio Rocher'],
      ['pecan-carrot-cake-bowls', 'Pecan Carrot Cake Bowls'],
    ],
  },
  {
    id: 'dessert-bowls', name: 'Dessert Bowls', ...pieces,
    items: [
      ['nutella-profiterole', 'Nutella Profiterole'],
      ['meringue-berries', 'Meringue with Mixed Berries & Raspberry'],
      ['trifle', 'Trifle'],
      ['mango-bowl', 'Mango'],
      ['blueberry-bowl', 'Blueberry'],
      ['cherry-bowl', 'Cherry'],
      ['twix-mousse', 'Twix Chocolate Mousse'],
    ],
  },
  {
    id: 'mini-desserts', name: 'Mini Desserts & Cups', ...pieces,
    items: [
      ['mini-cupcakes', 'Mini Cupcakes', 'Assorted flavours'],
      ['mousse-cups', 'Mousse Cups', 'Various flavours'],
      ['mini-eclairs', 'Mini Eclairs', 'Assorted flavours'],
      ['mini-macarons', 'Mini Macarons'],
    ],
  },
  {
    id: 'towers', name: 'Towers & Displays', ...whole('tower'),
    items: [
      ['macaron-tower', 'Macaron Tower'],
      ['madeleine-tower', 'Madeleine Tower'],
    ],
  },
  {
    id: 'cookies-slices', name: 'Cookies & Slices', ...pieces,
    items: [
      ['florentine-cookies', 'Florentine Almond Cookies'],
      ['florentine-slices', 'Florentine Almond Slices'],
    ],
  },
  {
    id: 'big-trays', name: 'Big Tray Desserts', ...whole('tray'),
    items: [
      ['tiramisu-tray', 'Classic Tiramisu Tray'],
      ['tres-leches-classic', 'Tres Leches Tray', 'Classic'],
      ['tres-leches-pistachio', 'Tres Leches Tray', 'Pistachio'],
      ['tres-leches-coffee', 'Tres Leches Tray', 'Coffee'],
      ['tres-leches-white-chocolate', 'Tres Leches Tray', 'White Chocolate'],
      ['tres-leches-berry', 'Tres Leches Tray', 'Berry'],
    ],
  },
].map(({ items, ...cat }) => ({
  ...cat,
  items: items.map(([id, name, note = '', override]) => {
    const u = { unit: cat.unit, step: cat.step, max: cat.max, ...override };
    return { id, name, note, category: cat.id, categoryName: cat.name, ...u };
  }),
}));

export const MENU_ITEMS = new Map(MENU.flatMap(c => c.items.map(i => [i.id, i])));

const plural = (unit, n) => unit === 'kg' ? 'kg' : n === 1 ? unit : unit === 'piece' ? 'pieces' : `${unit}s`;

/** "1.5 kg", "24 pieces", "1 cake" */
export function formatQuantity(qty, unit) {
  const n = unit === 'kg' ? String(qty).replace(/\.0$/, '') : String(qty);
  return `${n} ${plural(unit, qty)}`;
}

/** Full display name, e.g. "Tres Leches Tray — Pistachio". */
export const itemLabel = (i) => i.note && !/flavours|varieties/i.test(i.note) ? `${i.name} — ${i.note}` : i.name;

/**
 * Reads quantities posted as `m_<item id>` fields. Unknown ids are ignored; quantities
 * are snapped to the item's step and capped. Returns the snapshot stored on the enquiry.
 */
export function parseMenuSelection(body = {}) {
  const out = [];
  for (const [key, raw] of Object.entries(body)) {
    if (!key.startsWith('m_')) continue;
    const item = MENU_ITEMS.get(key.slice(2));
    const n = Number(String(raw).replace(',', '.'));
    if (!item || !Number.isFinite(n) || n <= 0) continue;
    const qty = Math.min(item.max, Math.round(n / item.step) * item.step);
    if (qty <= 0) continue;
    out.push({ id: item.id, name: itemLabel(item), category: item.categoryName, qty, unit: item.unit });
  }
  const order = [...MENU_ITEMS.keys()];
  return out.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

/** A selection as quote line items: the weight goes into the description (quantities are whole numbers). */
export const menuToQuoteLines = (selection = []) => selection.map(s => s.unit === 'kg'
  ? { description: `${s.name} — ${formatQuantity(s.qty, 'kg')}`, quantity: 1, unit_price: null }
  : { description: s.name, quantity: s.qty, unit_price: null });
