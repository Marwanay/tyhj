// Renders a client's dessert-table design as a JPEG for the team: the same table photo,
// surfaces and placement rules the browser uses (placementBox), composited with sharp.
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../config.js';
import { ZONES, displayFor, placementBox } from './table.js';
import { MENU_ITEMS, itemLabel } from './menu.js';

const W = 1536, H = 1024;
const file = (url) => path.join(config.root, 'public', url.split('?')[0]);
const xml = (s) => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

function glassSVG([a, b, c], w, h) {
  const one = (x, s) => `<g transform="translate(${x} ${h - 56 * s}) scale(${s})">` +
    `<path d="M9.3 34h21.4l-1 14.2a3 3 0 0 1-3 2.8H13.3a3 3 0 0 1-3-2.8z" fill="${a}"/><path d="M8.4 22h23.2l-.9 12H9.3z" fill="${b}"/>` +
    `<path d="M7.8 14h24.4l-.6 8H8.4z" fill="${a}" opacity=".85"/><circle cx="16" cy="12.5" r="3.4" fill="${c}"/>` +
    `<path d="M6 4h28l-3.1 44.3A4 4 0 0 1 26.9 52H13.1a4 4 0 0 1-4-3.7z" fill="#fff" fill-opacity=".18" stroke="#fff" stroke-width="1.3"/></g>`;
  const s = (w * 0.34) / 40, s2 = (w * 0.4) / 40;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${one(w * 0.05, s)}${one(w * 0.61, s)}${one(w * 0.3, s2)}</svg>`;
}

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
      if (d.mode === 'cutout') {
        const w = Math.max(8, Math.round(b.width * W));
        const img = await sharp(file(d.src)).resize({ width: w }).modulate({ saturation: 1.05 }).png().toBuffer();
        const { height } = await sharp(img).metadata();
        layers.push({ input: img, left: Math.round(b.left * W), top: Math.round(b.bottom * H - height) });
        continue;
      }
      const w = Math.round(b.width * W), h = Math.round(b.height * H), left = Math.round(b.left * W), top = Math.round(b.top * H);
      if (d.mode === 'fill') {
        const f = Math.round(Math.min(w, h) * 0.06);
        const mask = z.shape === 'ellipse'
          ? `<svg width="${w}" height="${h}"><defs><radialGradient id="g"><stop offset="72%" stop-color="#fff"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" fill="url(#g)"/></svg>`
          : `<svg width="${w}" height="${h}"><defs><filter id="b"><feGaussianBlur stdDeviation="${f / 2}"/></filter></defs><rect x="${f}" y="${f}" width="${w - 2 * f}" height="${h - 2 * f}" fill="#fff" filter="url(#b)"/></svg>`;
        const tex = await sharp(file(d.src)).resize(w, h, { fit: 'cover' }).ensureAlpha().composite([{ input: Buffer.from(mask), blend: 'dest-in' }]).png().toBuffer();
        layers.push({ input: tex, left, top });
      } else if (d.mode === 'glass') {
        layers.push({ input: Buffer.from(glassSVG(d.colors, w, h)), left, top });
      } else {
        const variant = p.note && !/flavours|varieties/i.test(p.note) ? p.note : '';
        layers.push({ input: Buffer.from(cardSVG(p.name, variant, Math.max(w, 120), Math.max(h, 60))), left: Math.round(z.x * W - Math.max(w, 120) / 2), top: Math.round(z.y * H - Math.max(h, 60) / 2) });
      }
    } catch (err) {
      console.error('[table-preview]', itemLabel(p), err.message);
    }
  }
  const data = await sharp(path.join(config.root, 'public/media/table/table-1536.jpg')).composite(layers).jpeg({ quality: 84, progressive: true }).toBuffer();
  return { data, width: W, height: H };
}
