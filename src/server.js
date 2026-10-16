import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { one } from './db.js';
import { securityHeaders, sameOrigin, parseCookies } from './lib/http.js';
import { loadSettings } from './services/content.js';
import { bootstrap } from './services/bootstrap.js';
import { ADMIN_COOKIE, sessionFor } from './services/auth.js';
import { listProducts } from './services/catalog.js';
import { shop } from './routes/shop.js';
import { events } from './routes/events.js';
import { admin } from './routes/admin.js';
import { messagePage } from './views/catering.js';
import { activeProviderStatus } from './payments/index.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', /^\d+$/.test(config.trustProxy) ? Number(config.trustProxy) : config.trustProxy);

  app.use(securityHeaders);
  // On Vercel, files in public/ are served by the CDN before requests reach this app.
  app.use(express.static(path.join(config.root, 'public'), {
    maxAge: config.isProduction ? '30d' : 0,
    setHeaders: (res, file) => { if (/[\\/](media|fonts)[\\/]/.test(file)) res.set('Cache-Control', 'public, max-age=31536000, immutable'); },
  }));

  app.get('/robots.txt', (req, res) => res.type('text/plain').send(
    `User-agent: *\nDisallow: /admin\nDisallow: /q/\nDisallow: /orders/\nDisallow: /checkout\nDisallow: /bag\nDisallow: /sandbox-gateway/\nSitemap: ${config.baseUrl}/sitemap.xml\n`));

  // Database ready (migrated & seeded once per instance) and settings fresh for this request.
  app.use(async (req, res, next) => {
    await bootstrap();
    await loadSettings();
    next();
  });

  app.get('/healthz', (req, res) => res.json({ ok: true, payments: { provider: activeProviderStatus().provider, mode: config.payments.mode, ready: activeProviderStatus().ready } }));

  // Images uploaded through the admin, stored in Postgres. Keys are unique per upload, so
  // responses are immutable and cached by the CDN after the first request.
  app.get('/m/:file', async (req, res, next) => {
    const m = /^([a-z0-9-]+)-(\d+)\.(avif|webp|jpg)$/.exec(req.params.file);
    if (!m) return next();
    const row = await one('SELECT mime, data FROM media WHERE key = ? AND width = ? AND ext = ?', m[1], Number(m[2]), m[3]);
    if (!row) return next();
    res.set({ 'Content-Type': row.mime, 'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable' }).send(row.data);
  });

  // Webhooks are server-to-server: no cookies, no origin checks, JSON body parsed per route.
  app.use(express.urlencoded({ extended: false, limit: '200kb', parameterLimit: 400 }));
  app.use((req, res, next) => (req.path.startsWith('/webhooks/') ? next() : sameOrigin(req, res, next)));
  app.use(async (req, res, next) => {
    const token = parseCookies(req)[ADMIN_COOKIE];
    req.admin = token ? await sessionFor(token) : null;
    next();
  });

  app.use(shop);
  app.use(events);
  app.use(admin);

  app.get('/sitemap.xml', async (req, res) => {
    const urls = ['/', '/collection', '/catering', ...(await listProducts()).map(p => `/collection/${p.slug}`), '/pages/delivery', '/pages/cancellations-refunds', '/pages/privacy', '/pages/terms'];
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u => `<url><loc>${config.baseUrl}${u}</loc></url>`).join('')}</urlset>`);
  });

  app.use((req, res) => {
    res.status(404).send(String(messagePage({ status: '404', title: 'This page has melted away.', message: 'The page you were looking for is not here. Perhaps something sweet instead?', cartCount: res.locals.cartCount || 0 })));
  });
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    if (err.status === 413 || err.type === 'entity.too.large') return res.status(413).send(String(messagePage({ status: '413', title: 'That upload was too large.', message: 'Please choose smaller images and try again.' })));
    res.status(500).send(String(messagePage({ status: '500', title: 'Something went wrong.', message: 'Please try again in a moment. If you were paying, your payment status is safe — check your order link before trying again.' })));
  });
  return app;
}

const app = createApp();
export default app;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await bootstrap();
  app.listen(config.port, () => {
    const p = activeProviderStatus();
    console.log(`Cocoa Caramel running at ${config.baseUrl} (port ${config.port}) · database: ${config.databaseUrl ? 'Postgres' : 'embedded (PGlite)'}`);
    console.log(`Payments: ${p.label} · ${p.mode} mode · ${p.ready ? 'ready' : `NOT READY — ${[...p.missing, ...p.problems].join(', ')}`}`);
  });
}
