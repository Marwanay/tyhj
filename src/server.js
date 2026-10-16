import express from 'express';
import path from 'node:path';
import { config } from './config.js';
import { securityHeaders, sameOrigin, parseCookies } from './lib/http.js';
import { ensurePages } from './services/content.js';
import { ADMIN_COOKIE, sessionFor } from './services/auth.js';
import { expireQuotes } from './services/quotes.js';
import { shop } from './routes/shop.js';
import { events } from './routes/events.js';
import { admin } from './routes/admin.js';
import { messagePage } from './views/catering.js';
import { activeProviderStatus } from './payments/index.js';

export function createApp() {
  ensurePages();
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', /^\d+$/.test(config.trustProxy) ? Number(config.trustProxy) : config.trustProxy);

  app.use(securityHeaders);
  app.use(express.static(path.join(config.root, 'public'), {
    maxAge: config.isProduction ? '30d' : 0,
    setHeaders: (res, file) => { if (/\/media\//.test(file) || /\/fonts\//.test(file)) res.set('Cache-Control', 'public, max-age=31536000, immutable'); },
  }));

  app.get('/robots.txt', (req, res) => res.type('text/plain').send(
    `User-agent: *\nDisallow: /admin\nDisallow: /q/\nDisallow: /orders/\nDisallow: /checkout\nDisallow: /bag\nDisallow: /sandbox-gateway/\nSitemap: ${config.baseUrl}/sitemap.xml\n`));
  app.get('/healthz', (req, res) => res.json({ ok: true, payments: { provider: activeProviderStatus().provider, mode: config.payments.mode, ready: activeProviderStatus().ready } }));

  // Webhooks are server-to-server: no cookies, no origin checks, JSON body parsed per route.
  app.use(express.urlencoded({ extended: false, limit: '200kb', parameterLimit: 400 }));
  app.use((req, res, next) => (req.path.startsWith('/webhooks/') ? next() : sameOrigin(req, res, next)));
  app.use((req, res, next) => { req.admin = sessionFor(parseCookies(req)[ADMIN_COOKIE]); next(); });

  app.use(shop);
  app.use(events);
  app.use(admin);

  app.get('/sitemap.xml', async (req, res) => {
    const { listProducts } = await import('./services/catalog.js');
    const urls = ['/', '/collection', '/catering', ...listProducts().map(p => `/collection/${p.slug}`), '/pages/delivery', '/pages/cancellations-refunds', '/pages/privacy', '/pages/terms'];
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u => `<url><loc>${config.baseUrl}${u}</loc></url>`).join('')}</urlset>`);
  });

  app.use((req, res) => {
    res.status(404).send(String(messagePage({ status: '404', title: 'This page has melted away.', message: 'The page you were looking for is not here. Perhaps something sweet instead?', cartCount: res.locals.cartCount || 0 })));
  });
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send(String(messagePage({ status: '500', title: 'Something went wrong.', message: 'Please try again in a moment. If you were paying, your payment status is safe — check your order link before trying again.' })));
  });
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = createApp();
  setInterval(expireQuotes, 3600_000).unref();
  app.listen(config.port, () => {
    const p = activeProviderStatus();
    console.log(`Cocoa Caramel running at ${config.baseUrl} (port ${config.port})`);
    console.log(`Payments: ${p.label} · ${p.mode} mode · ${p.ready ? 'ready' : `NOT READY — ${[...p.missing, ...p.problems].join(', ')}`}`);
  });
}
