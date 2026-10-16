// Builds the responsive site imagery from the approved Signature Chocolate Tray renders.
// Only supplied renders are used; crops are framing choices, never alterations.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { processImage } from '../src/lib/images.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => path.join(root, 'assets/source', f);
const STUDIO = src('signature-tray-studio.png');   // 1254 × 1254
const TABLE = src('signature-tray-table.png');     // 1536 × 1024

export const SITE_MEDIA = {
  'site-hero':          { file: STUDIO, alt: 'The Signature Chocolate Tray: gold-flecked chocolate domes in a clear tray beside cream gerberas' },
  'site-detail-gold':   { file: STUDIO, crop: { left: 640, top: 700, width: 520, height: 390 }, alt: 'Close-up of glossy chocolate domes finished with flecks of gold' },
  'site-detail-flowers':{ file: STUDIO, crop: { left: 40, top: 20, width: 560, height: 700 }, alt: 'Cream gerberas and folded leaves arranged at the head of the tray' },
  'site-table':         { file: TABLE, alt: 'The Signature Chocolate Tray set on a dining table with blush napkins and crystal glasses' },
  'site-table-setting': { file: TABLE, crop: { left: 960, top: 0, width: 576, height: 1024 }, alt: 'A place setting with blush linen beside the chocolate tray' },
  'site-table-tray':    { file: TABLE, crop: { left: 200, top: 250, width: 1150, height: 720 }, alt: 'The chocolate tray and flowers at the centre of a set table' },
};

const manifest = {};
for (const [key, def] of Object.entries(SITE_MEDIA)) {
  const out = await processImage(def.file, key, { crop: def.crop });
  manifest[key] = { ...out, alt: def.alt };
  console.log(key, out.width, '×', out.height, out.widths.join(','));
}
await fs.writeFile(path.join(root, 'src/views/media.json'), JSON.stringify(manifest, null, 2) + '\n');
