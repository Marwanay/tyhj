// Responsive image pipeline: one source → AVIF, WebP and JPEG at several widths.
// Quality settings are deliberately generous so chocolate texture and gold leaf survive.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../config.js';

const TARGET_WIDTHS = [480, 760, 1080, 1440, 1920];

/**
 * @param {Buffer|string} input  image buffer or path
 * @param {string} key           file stem under /media (letters, digits, dashes)
 * @param {{crop?:{left:number,top:number,width:number,height:number}, outDir?:string}} opts
 */
export async function processImage(input, key, opts = {}) {
  if (!/^[a-z0-9-]+$/.test(key)) throw new Error('Invalid media key');
  const outDir = opts.outDir || config.mediaDir;
  await fs.mkdir(outDir, { recursive: true });

  // rotate() applies EXIF orientation; re-encoding drops all metadata (incl. GPS).
  let base = sharp(input, { failOn: 'error', limitInputPixels: 60_000_000 }).rotate();
  if (opts.crop) base = base.extract(opts.crop);
  const buf = await base.toColourspace('srgb').png().toBuffer();
  const meta = await sharp(buf).metadata();

  const widths = TARGET_WIDTHS.filter(w => w < meta.width);
  widths.push(meta.width > 2400 ? 2400 : meta.width);
  const unique = [...new Set(widths)].sort((a, b) => a - b);

  await Promise.all(unique.flatMap(w => {
    const img = () => sharp(buf).resize({ width: w, withoutEnlargement: true });
    const stem = path.join(outDir, `${key}-${w}`);
    return [
      img().avif({ quality: 62, effort: 5, chromaSubsampling: '4:4:4' }).toFile(`${stem}.avif`),
      img().webp({ quality: 84, smartSubsample: true }).toFile(`${stem}.webp`),
      img().jpeg({ quality: 86, mozjpeg: true }).toFile(`${stem}.jpg`),
    ];
  }));

  // A tiny blurred placeholder colour for the image frame while loading.
  const { dominant } = await sharp(buf).stats();
  const placeholder = `rgb(${dominant.r} ${dominant.g} ${dominant.b})`;

  const height = Math.round(meta.height * (unique.at(-1) / meta.width));
  return { width: unique.at(-1), height, widths: unique, placeholder };
}

export async function removeMedia(key, widths) {
  await Promise.all(widths.flatMap(w => ['avif', 'webp', 'jpg'].map(ext =>
    fs.rm(path.join(config.mediaDir, `${key}-${w}.${ext}`), { force: true }))));
}

/** Validate & re-encode a private upload (enquiry inspiration). Returns null if not an image. */
export async function sanitizePrivateImage(buffer, destFile) {
  try {
    const img = sharp(buffer, { failOn: 'error', limitInputPixels: 50_000_000 }).rotate();
    const meta = await img.metadata();
    if (!['jpeg', 'png', 'webp', 'heif', 'avif', 'gif'].includes(meta.format)) return null;
    const info = await img.resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true }).toFile(destFile);
    return { width: info.width, height: info.height };
  } catch {
    return null;
  }
}
