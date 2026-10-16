// The catering menu (Cocoa Caramel Menu 2025). Clients pick quantities while requesting
// a quote: chocolates by weight in half-kilo steps, everything else by count. Prices are
// not shown — the team prices the selection when preparing the quote.
//
// Item ids are stored with each enquiry, so keep existing ids stable when editing names.

const pieces = { unit: 'piece', step: 1, max: 2000 };
const whole = (unit) => ({ unit, step: 1, max: 100 });

// Cut-outs in /media/menu (built by scripts/cut-menu-art.py) that pop onto the live dessert table.
const PHOTOS = {
  'chocolate-cake': 'chocolate-cake', 'raspberry-cake': 'raspberry-cake', 'pistachio-cake': 'pistachio-cake',
  'lemon-berry-cake': 'lemon-berry-cake', 'cherry-cake': 'cherry-cake', 'assorted-mini-cakes': 'assorted-mini-cakes',
  'raspberry-wedding-round': 'raspberry-wedding', 'raspberry-wedding-rect': 'raspberry-wedding',
  'tiramisu-wedding-round': 'tiramisu-wedding', 'tiramisu-wedding-rect': 'tiramisu-wedding',
  'lemon-berry-tart': 'lemon-berry-tart', 'classic-cheesecake': 'classic-cheesecake', 'mini-cheesecakes': 'mini-cheesecakes',
  'mini-tarts': 'mini-tarts', 'mini-chocolate-sticks': 'mini-chocolate-sticks', 'chocolate-pieces': 'chocolate-pieces',
  'brownie-bar-pistachio': 'brownie-bar-pistachio', 'caramel-pecan': 'caramel-pecan', 'snickers-bites': 'snickers-bites',
  'ferrero-rocher': 'ferrero-rocher',
};

// From the Cocoa Caramel menu cards.
const DESCRIPTIONS = {
  'chocolate-cake': 'A rich and moist chocolate cake layered with silky chocolate cream and topped with delicate chocolate shards.',
  'raspberry-cake': 'Light and fruity raspberry cake with a creamy raspberry layer, finished with fresh raspberries.',
  'pistachio-cake': 'A delicate pistachio cake with a smooth pistachio cream, topped with roasted pistachios.',
  'lemon-berry-cake': 'A refreshing lemon cake layered with berries and cream, finished with a mix of fresh berries.',
  'cherry-cake': 'A luscious cake with a rich cherry layer, finished with fresh cherries.',
  'assorted-mini-cakes': 'A selection of our mini signature cakes in various flavours.',
  'raspberry-wedding-round': 'Our signature raspberry cake, perfect for weddings and special occasions.',
  'raspberry-wedding-rect': 'Our signature raspberry cake, perfect for weddings and special occasions.',
  'tiramisu-wedding-round': 'A classic tiramisu cake with coffee-soaked layers and a smooth mascarpone cream.',
  'tiramisu-wedding-rect': 'A classic tiramisu cake with coffee-soaked layers and a smooth mascarpone cream.',
  'lemon-berry-tart': 'A crisp tart shell filled with lemon cream and topped with fresh berries.',
  'classic-cheesecake': 'A rich and creamy cheesecake, available in a variety of flavours.',
  'mini-cheesecakes': 'Our classic cheesecake in individual portions, in a variety of flavours.',
  'mini-tarts': 'A selection of mini tarts in assorted flavours.',
  'mini-chocolate-sticks': 'Elegant chocolate sticks in assorted flavours, finished with premium toppings.',
  'chocolate-pieces': 'Assorted handcrafted chocolate pieces in various flavours and finishes.',
  'brownie-bar-pistachio': 'A rich and fudgy brownie bar topped with roasted pistachios.',
  'caramel-pecan': 'A smooth caramel centre finished with crunchy pecans.',
  'snickers-bites': 'A delightful bite with the perfect combination of chocolate, caramel and nuts.',
  'ferrero-rocher': 'Our take on the classic Ferrero Rocher, with a crunchy hazelnut coating and a rich chocolate centre.',
};

// Desserts served in glasses (no photo yet) are drawn on the table as layered glasses: bottom → top, garnish.
const GLASSES = {
  'nutella-profiterole': ['#5a2d1a', '#f3e6d6', '#3b1d10'], 'meringue-berries': ['#f8f1ec', '#c2183c', '#ffffff'],
  'trifle': ['#f2d9b8', '#c7233a', '#fbf3e6'], 'mango-bowl': ['#f4a522', '#fbe8c8', '#f7b733'],
  'blueberry-bowl': ['#4b3a8c', '#efe6f5', '#6a54b3'], 'cherry-bowl': ['#8e0f22', '#f6e3e0', '#b3122e'],
  'twix-mousse': ['#5b3218', '#c98a3e', '#3a1f10'], 'mousse-cups': ['#6b3a22', '#f1e2d0', '#a35d3a'],
};
// Already standing in the table photo: choosing it makes it glow instead of adding a second one.
const IN_PHOTO = new Set(['macaron-tower']);

// Where a chosen item appears on the live dessert table: cake stands, marble trays, glass bowls or the tower plinth.
const PLACE = { stand: 'stand', tray: 'tray', bowl: 'bowl', tower: 'tower' };
const PLACE_OVERRIDES = {
  'assorted-mini-cakes': PLACE.tray, 'raspberry-wedding-round': PLACE.tray, 'raspberry-wedding-rect': PLACE.tray,
  'tiramisu-wedding-round': PLACE.tray, 'tiramisu-wedding-rect': PLACE.tray, 'mini-cheesecakes': PLACE.tray, 'mini-tarts': PLACE.tray,
  'mousse-cups': PLACE.bowl,
};

export const MENU = [
  {
    id: 'signature-cakes', place: PLACE.stand, name: 'Signature Cakes', ...whole('cake'),
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
    id: 'wedding-cakes', place: PLACE.stand, name: 'Big Cakes for Weddings', ...whole('cake'),
    items: [
      ['raspberry-wedding-round', 'Raspberry Cake', 'Round'],
      ['raspberry-wedding-rect', 'Raspberry Cake', 'Rectangle'],
      ['tiramisu-wedding-round', 'Tiramisu Cake', 'Round'],
      ['tiramisu-wedding-rect', 'Tiramisu Cake', 'Rectangle'],
    ],
  },
  {
    id: 'tarts-cheesecakes', place: PLACE.stand, name: 'Tarts & Cheesecakes', ...pieces,
    items: [
      ['lemon-berry-tart', 'Lemon & Berry Tart', '', whole('tart')],
      ['classic-cheesecake', 'Classic Cheesecake', 'Varieties', whole('cheesecake')],
      ['mini-cheesecakes', 'Mini Cheesecakes'],
      ['mini-tarts', 'Mini Tarts', 'Assorted flavours'],
    ],
  },
  {
    id: 'chocolate-delights', place: PLACE.tray, name: 'Chocolate Delights', unit: 'kg', step: 0.5, max: 100,
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
    id: 'dessert-bowls', place: PLACE.bowl, name: 'Dessert Bowls', ...pieces,
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
    id: 'mini-desserts', place: PLACE.tray, name: 'Mini Desserts & Cups', ...pieces,
    items: [
      ['mini-cupcakes', 'Mini Cupcakes', 'Assorted flavours'],
      ['mousse-cups', 'Mousse Cups', 'Various flavours'],
      ['mini-eclairs', 'Mini Eclairs', 'Assorted flavours'],
      ['mini-macarons', 'Mini Macarons'],
    ],
  },
  {
    id: 'towers', place: PLACE.tower, name: 'Towers & Displays', ...whole('tower'),
    items: [
      ['macaron-tower', 'Macaron Tower'],
      ['madeleine-tower', 'Madeleine Tower'],
    ],
  },
  {
    id: 'cookies-slices', place: PLACE.tray, name: 'Cookies & Slices', ...pieces,
    items: [
      ['florentine-cookies', 'Florentine Almond Cookies'],
      ['florentine-slices', 'Florentine Almond Slices'],
    ],
  },
  {
    id: 'big-trays', place: PLACE.tray, name: 'Big Tray Desserts', ...whole('tray'),
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
    return {
      id, name, note, category: cat.id, categoryName: cat.name, ...u,
      desc: DESCRIPTIONS[id] || '', photo: PHOTOS[id] ? `/media/menu/${PHOTOS[id]}.webp` : '', place: PLACE_OVERRIDES[id] || cat.place,
      glass: GLASSES[id] || null, inPhoto: IN_PHOTO.has(id),
    };
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
