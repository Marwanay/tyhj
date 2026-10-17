// Renders the website launch film (video/launch.html) to MP4, frame by frame.
//   node video/render.mjs                    → video/out/cocoa-caramel-launch.mp4
//   node video/render.mjs --stills 2,5,9.5   → PNG stills at those seconds (for checking)
// If video/out/soundtrack.wav exists (python video/sound.py video/out/soundtrack.wav), it is
// mixed in as the film's music and sound effects.
// Needs Chromium (Playwright) and ffmpeg. Before rendering, refresh the phone screenshots in
// video/assets/ if the site has changed.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { WORDMARK, MONOGRAM } from '../src/views/brand.js';
import { EVENT_PHOTOS } from '../src/views/events-media.js';
import { SITE_MEDIA } from '../src/views/media.js';
import { MENU_ITEMS } from '../src/services/menu.js';
import { ARRANGEMENTS, ZONES, displayFor, placementBox } from '../src/services/table.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'out');
const args = process.argv.slice(2);
const stills = args.includes('--stills') ? args[args.indexOf('--stills') + 1].split(',').map(Number) : null;

// ---- Data the composition needs ---------------------------------------------------------
const largest = (key) => `../public/media/${key}-${SITE_MEDIA[key].widths.at(-1)}.jpg`;
const zones = new Map(ZONES.map(z => [z.id, z]));
const table = ARRANGEMENTS[0].items
  .map(({ zone, id }) => { const d = displayFor(MENU_ITEMS.get(id)); return { id, src: `../public${d.src}`, box: placementBox(zones.get(zone), d) }; })
  // Back of the table first, so the arrangement builds towards the viewer.
  .sort((a, b) => (a.box.top + a.box.height) - (b.box.top + b.box.height));
const data = {
  monogram: MONOGRAM, wordmark: WORDMARK,
  fillings: ['Pecan caramel', 'Hazelnut praline', 'Pistachio cream', 'Mixed nuts', 'Croquant', 'Halawa pistachio cream'],
  events: EVENT_PHOTOS.map(([key]) => largest(key)),
  table,
  // Q2 "Choose by quantity": each item's quantities and the beats (seconds into the scene) they tick on.
  menu: [
    { name: 'Chocolate Pieces', unit: 'kg', unitLabel: 'By the kilo', src: '../public/media/table/desserts/chocolate-pieces.webp', steps: [0.5, 1, 1.5, 2], at: [1.0, 1.25, 1.5, 1.75] },
    { name: 'Mini Éclairs', unit: 'piece', unitLabel: 'By the piece', src: '../public/media/table/desserts/mini-eclairs.webp', steps: [12, 24, 36, 48, 60], at: [2.0, 2.125, 2.25, 2.375, 2.5] },
    { name: 'Raspberry Cake', unit: 'cake', unitLabel: 'Signature cake', src: '../public/media/table/desserts/raspberry-cake.webp', steps: [1], at: [3.0] },
    { name: 'Macaron Tower', unit: 'tower', unitLabel: 'Tower', src: '../public/media/table/desserts/macaron-tower.webp', steps: [1], at: [3.5] },
  ],
  url: process.env.FILM_URL || 'cocoa-caramel-inky.vercel.app',
  instagram: '@cocoacaramel.eg  ·  0122 211 1681',
};
await fs.writeFile(path.join(here, 'data.js'), `window.FILM_DATA = ${JSON.stringify(data)};\n`);

// ---- Render -----------------------------------------------------------------------------
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
await page.goto('file://' + path.join(here, 'launch.html'));
await page.evaluate(() => window.filmReady);
const { duration, fps } = await page.evaluate(() => ({ duration: window.FILM.duration, fps: window.FILM.fps }));

if (stills) {
  for (const t of stills) {
    await page.evaluate((t) => window.FILM.render(t), t);
    await page.screenshot({ path: path.join(out, `still-${String(t).replace('.', '_')}.png`) });
  }
  console.log(`${stills.length} stills in ${out}`);
} else {
  const total = Math.round(duration * fps);
  const file = path.join(out, 'cocoa-caramel-launch.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c)))));
  for (let f = 0; f < total; f++) {
    await page.evaluate((t) => window.FILM.render(t), f / fps);
    const jpg = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(jpg)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 90 === 0) console.log(`frame ${f}/${total}`);
  }
  ff.stdin.end();
  await done;
  const wav = path.join(out, 'soundtrack.wav');
  if (await fs.stat(wav).catch(() => null)) {
    const silent = file.replace('.mp4', '-silent.mp4');
    await fs.rename(file, silent);
    await new Promise((res, rej) => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', wav, '-map', '0:v', '-map', '1:a',
      '-c:v', 'copy', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', file], { stdio: 'inherit' })
      .on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg mux exited ' + c)))));
  }
  console.log(file);
}
await browser.close();
