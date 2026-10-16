// Responsive image pipeline: one source → AVIF, WebP and JPEG at several widths.
// Quality settings are deliberately generous so chocolate texture and gold leaf survive.
//
// Site imagery and the launch product are generated at build time into public/media
// (served by the CDN). Images uploaded through the admin are stored in Postgres and
// served from /m/ with immutable caching, so no extra storage service is needed.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const TARGET_WIDTHS = [480, 760, 1080, 1440, 1920];
export const MIME = { avif: 'image/avif', webp: 'image/webp', jpg: 'image/jpeg' };

/**
 * @param {Buffer|string} input  image buffer or path
 * @returns {Promise<{width, height, widths, placeholder, files: {width, ext, data}[]}>}
 */
export async function renderVariants(input, { crop } = {}) {
  // rotate() applies EXIF orientation; re-encoding drops all metadata (incl. GPS).
  let base = sharp(input, { failOn: 'error', limitInputPixels: 60_000_000 }).rotate();
  if (crop) base = base.extract(crop);
  const buf = await base.toColourspace('srgb').png().toBuffer();
  const meta = await sharp(buf).metadata();

  const widths = TARGET_WIDTHS.filter(w => w < meta.width);
  widths.push(Math.min(meta.width, 2400));
  const unique = [...new Set(widths)].sort((a, b) => a - b);

  const files = (await Promise.all(unique.map(async (w) => {
    const img = () => sharp(buf).resize({ width: w, withoutEnlargement: true });
    return [
      { width: w, ext: 'avif', data: await img().avif({ quality: 62, effort: 4, chromaSubsampling: '4:4:4' }).toBuffer() },
      { width: w, ext: 'webp', data: await img().webp({ quality: 84, smartSubsample: true }).toBuffer() },
      { width: w, ext: 'jpg', data: await img().jpeg({ quality: 86, mozjpeg: true }).toBuffer() },
    ];
  }))).flat();

  const { dominant } = await sharp(buf).stats();
  const largest = unique.at(-1);
  return {
    width: largest,
    height: Math.round(meta.height * (largest / meta.width)),
    widths: unique,
    placeholder: `rgb(${dominant.r} ${dominant.g} ${dominant.b})`,
    files,
  };
}

/** Build-time: write variants to a directory as <key>-<width>.<ext>. */
export async function writeVariantsToDir(input, key, dir, opts) {
  if (!/^[a-z0-9-]+$/.test(key)) throw new Error('Invalid media key');
  const out = await renderVariants(input, opts);
  await fs.mkdir(dir, { recursive: true });
  await Promise.all(out.files.map(f => fs.writeFile(path.join(dir, `${key}-${f.width}.${f.ext}`), f.data)));
  delete out.files;
  return out;
}

/** Validate & re-encode a private upload (enquiry inspiration). Returns null if not an image. */
export async function sanitizePrivateImage(buffer) {
  try {
    const img = sharp(buffer, { failOn: 'error', limitInputPixels: 50_000_000 }).rotate();
    const meta = await img.metadata();
    if (!['jpeg', 'png', 'webp', 'heif', 'avif', 'gif'].includes(meta.format)) return null;
    const { data, info } = await img.resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    return null;
  }
}
