import { html, raw } from '../lib/html.js';
import { config } from '../config.js';
import { wordmark, logoStacked, monogram, testRibbon } from './components.js';
import { getSetting } from '../services/content.js';
import { displayPhone } from '../lib/phone.js';

const NAV = [
  { href: '/collection', label: 'The Collection', key: 'collection' },
  { href: '/catering', label: 'Events & Catering', key: 'catering' },
  { href: '/#story', label: 'Our Story', key: 'story' },
];

export function layout({ title, description, body, page = '', noindex = false, cartCount = 0, intro = false, bodyClass = '', canonical, ogImage }) {
  const s = getSetting('site');
  const fullTitle = title ? `${title} — Cocoa Caramel` : 'Cocoa Caramel — Chocolate gifting, desserts & event catering in Egypt';
  const desc = description || 'Chocolate trays, dessert tables and gifting for celebrations and private events in Egypt.';
  return html`<!doctype html>
<html lang="en" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${fullTitle}</title>
<meta name="description" content="${desc}">
${noindex ? raw('<meta name="robots" content="noindex, nofollow, noarchive">') : ''}
${canonical ? html`<link rel="canonical" href="${config.baseUrl}${canonical}">` : ''}
<meta name="theme-color" content="#faefec">
<meta property="og:site_name" content="Cocoa Caramel">
<meta property="og:title" content="${fullTitle}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${config.baseUrl}${ogImage || '/media/site-table-1080.jpg'}">
<link rel="icon" href="/brand/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png">
<link rel="preload" href="/fonts/cormorant-garamond-latin-300-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/poppins-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/site.css?v=${ASSET_VERSION}">
<script src="/js/boot.js?v=${ASSET_VERSION}"></script>
<script src="/js/resize.js?v=${ASSET_VERSION}" defer></script>
<script src="/js/site.js?v=${ASSET_VERSION}" defer></script>
</head>
<body class="${bodyClass}" data-page="${page}">
<a class="skip-link" href="#main">Skip to content</a>
${intro ? html`<div class="intro-mark" aria-hidden="true">${monogram('intro-glyph')}<span class="intro-line"></span></div>` : ''}
${testRibbon()}
${s.announcement ? html`<div class="announcement">${s.announcement}</div>` : ''}
<header class="site-header" data-header>
  <div class="wrap">
    <nav class="nav nav-start" aria-label="Main">
      ${NAV.map(n => html`<a href="${n.href}" ${raw(page === n.key ? 'aria-current="page"' : '')}>${n.label}</a>`)}
    </nav>
    <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="mobile-menu" data-menu-toggle>
      <span></span><span></span><span class="visually-hidden">Menu</span>
    </button>
    <a class="brand" href="/" aria-label="Cocoa Caramel — home">${wordmark('Cocoa Caramel')}</a>
    <nav class="nav nav-end" aria-label="Shopping">
      <a href="/catering#enquire">Plan your event</a>
      <a class="bag-link" href="/bag" aria-label="Bag, ${cartCount} ${cartCount === 1 ? 'item' : 'items'}" data-bag-link>
        <span class="label-text">Bag</span><span class="bag-count" data-count="${cartCount}" data-bag-count>${cartCount}</span>
      </a>
    </nav>
  </div>
</header>
<div class="mobile-menu" id="mobile-menu" data-mobile-menu hidden>
  <nav aria-label="Mobile">
    <a class="big" href="/">Home</a>
    ${NAV.map(n => html`<a class="big" href="${n.href}">${n.label}</a>`)}
    <a class="big" href="/bag">Your bag</a>
  </nav>
  ${monogram()}
  <p class="fine">${s.tagline}</p>
</div>
<main id="main" tabindex="-1">
${body}
</main>
${footer(s)}
</body>
</html>`;
}

function footer(s) {
  const social = [
    s.instagram && { label: 'Instagram', href: socialUrl('instagram', s.instagram) },
    s.tiktok && { label: 'TikTok', href: socialUrl('tiktok', s.tiktok) },
    s.facebook && { label: 'Facebook', href: socialUrl('facebook', s.facebook) },
  ].filter(Boolean);
  const wa = s.whatsapp && s.whatsapp.replace(/\D/g, '');
  return html`<footer class="site-footer">
  <div class="wrap">
    <div class="footer-top">
      <div class="footer-brand">
        ${logoStacked('Cocoa Caramel')}
        <p>${s.tagline}</p>
      </div>
      <div class="footer-col">
        <h3>Shop</h3>
        <ul>
          <li><a href="/collection">The Collection</a></li>
          <li><a href="/bag">Your bag</a></li>
          <li><a href="/pages/delivery">Delivery & collection</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h3>Events</h3>
        <ul>
          <li><a href="/catering">Catering & private events</a></li>
          <li><a href="/catering#enquire">Request a quote</a></li>
        </ul>
        <h3 style="margin-top:28px">Information</h3>
        <ul>
          <li><a href="/pages/cancellations-refunds">Cancellations & refunds</a></li>
          <li><a href="/pages/privacy">Privacy</a></li>
          <li><a href="/pages/terms">Terms of sale</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h3>Contact</h3>
        <ul>
          ${s.phone ? html`<li><a href="tel:${s.phone}">${displayPhone(s.phone)}</a></li>` : ''}
          ${wa ? html`<li><a href="https://wa.me/${wa}" rel="noopener">WhatsApp</a></li>` : ''}
          ${s.email ? html`<li><a href="mailto:${s.email}">${s.email}</a></li>` : ''}
          ${social.map(x => html`<li><a href="${x.href}" rel="noopener">${x.label}</a></li>`)}
          ${!s.phone && !s.email && !wa && !social.length ? html`<li class="muted">For orders and events, <a href="/catering#enquire">send us an enquiry</a>.</li>` : ''}
          ${s.hours ? html`<li class="muted">${s.hours}</li>` : ''}
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© ${new Date().getFullYear()} Cocoa Caramel · ${s.city}</span>
      ${monogram()}
      <span>Prices in Egyptian Pounds (EGP)</span>
    </div>
  </div>
</footer>`;
}

function socialUrl(network, handle) {
  if (/^https:\/\//.test(handle)) return handle;
  const h = String(handle).replace(/^@/, '');
  return { instagram: `https://instagram.com/${h}`, tiktok: `https://www.tiktok.com/@${h}`, facebook: `https://facebook.com/${h}` }[network];
}

// Stable per deployment so CDN-cached CSS/JS is reused across serverless instances.
export const ASSET_VERSION = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 8) || Date.now().toString(36);
