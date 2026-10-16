// Renders a dessert-table design as a JPEG: the same empty table photo, surfaces and placement
// rules the browser uses (placementBox), with each dessert's own transparent render composited
// on with sharp. Used for the team's copy of a client's design and for the reference arrangements.
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../config.js';
import { ZONES, displayFor, placementBox } from './table.js';
import { MENU_ITEMS, itemLabel } from './menu.js';

const W = 1536, H = 1024;
const file = (url) => path.join(config.root, 'public', url.split('?')[0]);
const xml = (s) => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

function cardSVG(name, variant, w, h) {
  const fs = Math.max(11, Math.min(20, w / 9));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<rect x="${w * 0.08}" y="${h * 0.22}" width="${w * 0.84}" height="${h * 0.56}" fill="#fdf7f4" fill-opacity=".96" stroke="#c8860a" stroke-opacity=".6"/>` +
    `<text x="50%" y="${variant ? h * 0.5 : h * 0.56}" text-anchor="middle" font-family="Georgia, serif" font-size="${fs}" fill="#50143a">${xml(name)}</text>` +
    (variant ? `<text x="50%" y="${h * 0.66}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${fs * 0.6}" letter-spacing="2" fill="#c8860a">${xml(variant.toUpperCase())}</text>` : '') +
    `</svg>`;
}

/** @param design [{ zone, id, qty }] already validated by parseDesign. Returns { data, width, height }. */
export async function renderTablePreview(design) {
  const zones = new Map(ZONES.map(z => [z.id, z]));
  const items = design.map(it => ({ it, z: zones.get(it.zone), p: MENU_ITEMS.get(it.id) })).filter(x => x.z && x.p)
    .sort((a, b) => a.z.y - b.z.y);   // back to front
  const layers = [];
  for (const { z, p } of items) {
    const d = displayFor(p), b = placementBox(z, d);
    try {
      if (d.mode === 'asset') {
        const w = Math.max(8, Math.round(b.width * W)), h = Math.max(8, Math.round(b.height * H));
        const img = await sharp(file(d.src)).resize(w, h).png().toBuffer();
        layers.push({ input: img, left: Math.round(b.left * W), top: Math.round(b.top * H) });
      } else {
        const variant = p.note && !/flavours|varieties/i.test(p.note) ? p.note : '';
        const w = Math.max(Math.round(b.width * W), 120), h = Math.max(Math.round(b.height * H), 60);
        layers.push({ input: Buffer.from(cardSVG(p.name, variant, w, h)), left: Math.round(z.x * W - w / 2), top: Math.round(z.y * H - h / 2) });
      }
    } catch (err) {
      console.error('[table-preview]', itemLabel(p), err.message);
    }
  }
  const data = await sharp(path.join(config.root, 'public/media/table/table-1536.jpg')).composite(layers).jpeg({ quality: 84, progressive: true }).toBuffer();
  return { data, width: W, height: H };
}
