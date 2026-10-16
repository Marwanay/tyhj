// Build Your Dessert Table — the page shell. The interactive table is driven by
// public/js/table-builder.js from the configuration embedded below; quotes go through the
// existing catering enquiry form.
import { html, raw } from '../lib/html.js';
import { layout, ASSET_VERSION } from './layout.js';
import { eyebrow, monogram, button } from './components.js';
import { MENU, itemLabel } from '../services/menu.js';
import { ZONES, ZONE_LABELS, acceptsFor, displayFor } from '../services/table.js';

const v = (url) => (url ? `${url}?v=${ASSET_VERSION}` : '');

/** Everything the browser needs: surfaces, and per dessert where it fits and how it is drawn. */
export function tableConfig() {
  const products = MENU.flatMap(cat => cat.items.map(i => {
    const d = displayFor(i);
    return {
      id: i.id, name: i.name, variant: i.note && !/flavours|varieties/i.test(i.note) ? i.note : '', label: itemLabel(i),
      note: /flavours|varieties/i.test(i.note) ? i.note : '', desc: i.desc, category: cat.id, categoryName: cat.name,
      unit: i.unit, step: i.step, max: i.max, accepts: acceptsFor(i),
      display: { ...d, src: v(d.src) }, thumb: v(d.mode === 'asset' ? d.src : i.photo),
    };
  }));
  return { zones: ZONES, zoneLabels: ZONE_LABELS, products, categories: MENU.map(c => ({ id: c.id, name: c.name })) };
}

export function tableBuilderPage({ cartCount }) {
  const cfg = tableConfig();
  // Desserts that come in variants (flavour, shape) share one card with a choice of variant.
  const groups = [];
  for (const p of cfg.products) {
    const g = groups.find(x => x.category === p.category && x.name === p.name && p.variant);
    if (g) g.items.push(p); else groups.push({ category: p.category, categoryName: p.categoryName, name: p.name, items: [p] });
  }
  // Every dessert on the table is its own render; the ones still being rendered say so.
  const badge = (p) => p.display.mode === 'asset' ? html`<span class="tb-badge">Concept render</span>`
    : html`<span class="tb-badge is-pending">Preview coming soon</span>`;

  const body = html`
<section class="tb-intro on-plum" data-tb-intro>
  <div class="tb-intro-art" aria-hidden="true"><img src="${v('/media/table/table-960.jpg')}" alt="" width="960" height="640" fetchpriority="high"></div>
  <div class="wrap tb-intro-copy">
    ${eyebrow('Catering & private events')}
    <h1>Build Your <em>Dessert Table</em></h1>
    <p class="lede">Your celebration. Your selection. Beautifully arranged.</p>
    <p class="tb-intro-text">Choose from the Cocoa Caramel menu and watch each creation take its place on the table — cakes on marble stands, chocolates on gilded trays. When it looks just right, send it to us for a quote.</p>
    <div class="tb-intro-actions">
      <button class="btn" type="button" data-tb-start>Start Creating</button>
      <button class="btn btn-ghost on-dark" type="button" data-tb-continue hidden>Continue my design</button>
    </div>
    <p class="fine">Prices are confirmed in your quote. Prefer to talk it through? <a href="/catering#enquire">Request a consultation</a>.</p>
  </div>
</section>

<section class="tb-app" data-tb-app hidden aria-label="Dessert table builder">
  <div class="tb-layout">
    <aside class="tb-menu" data-tb-menu aria-label="Dessert menu">
      <button class="tb-drawer-handle" type="button" data-tb-drawer aria-expanded="false"><span></span>Choose desserts</button>
      <div class="tb-menu-head">
        <h2>The menu</h2>
        <label class="tb-search"><span class="visually-hidden">Search desserts</span><input type="search" placeholder="Search desserts" data-tb-search autocomplete="off"></label>
        <div class="tb-cats" data-tb-cats>
          <button type="button" class="tb-cat" data-tb-cat="" aria-pressed="true">All</button>
          ${cfg.categories.map(c => html`<button type="button" class="tb-cat" data-tb-cat="${c.id}" aria-pressed="false">${c.name}</button>`)}
        </div>
        <p class="tb-filter-note" data-tb-filter-note hidden></p>
      </div>
      <div class="tb-products" data-tb-products>
        ${groups.map(g => {
          const p = g.items[0];
          return html`<article class="tb-card" data-tb-card data-category="${g.category}" data-search="${(g.name + ' ' + g.categoryName + ' ' + g.items.map(i => i.variant).join(' ')).toLowerCase()}" data-ids="${g.items.map(i => i.id).join(' ')}">
            <div class="tb-card-img">${p.thumb ? html`<img src="${p.thumb}" alt="" loading="lazy" decoding="async">` : monogram('tb-card-mono')}</div>
            <div class="tb-card-body">
              <p class="tb-card-cat">${g.categoryName}</p>
              <h3>${g.name}</h3>
              ${p.note ? html`<p class="tb-card-note">${p.note}</p>` : ''}
              ${g.items.length > 1 ? html`<div class="tb-variants" role="group" aria-label="${g.name} options">
                ${g.items.map((i, n) => html`<button type="button" class="tb-variant" data-tb-variant="${i.id}" aria-pressed="${n === 0 ? 'true' : 'false'}">${i.variant}</button>`)}
              </div>` : ''}
              <p class="tb-card-meta">${badge(p)}<span class="tb-price">Price on request</span></p>
            </div>
            <button class="tb-add" type="button" data-tb-add="${p.id}" aria-label="Add ${p.label} to the table">Add</button>
          </article>`;
        })}
        <a class="tb-bespoke" href="/catering#enquire">
          <span class="label">Customised cakes & cookies</span>
          <span>Something made just for you? Tailored to taste and styled for your celebration — by consultation.</span>
        </a>
      </div>
    </aside>

    <div class="tb-stage-col">
      <div class="tb-toolbar">
        <p class="tb-status" data-tb-status aria-live="polite">Choose a dessert from the menu to begin.</p>
        <div class="tb-tools">
          <button type="button" class="tb-tool" data-tb-place-auto hidden>Place it for me</button>
          <button type="button" class="tb-tool" data-tb-cancel hidden>Cancel</button>
          <button type="button" class="tb-tool tb-only-touch" data-tb-reset-view>Reset view</button>
          <button type="button" class="tb-tool" data-tb-designs>My designs</button>
          <button type="button" class="tb-tool" data-tb-reset>Reset table</button>
        </div>
      </div>
      <div class="tb-viewport" data-tb-viewport>
        <div class="tb-stage" data-tb-stage>
          <picture>
            <source type="image/webp" srcset="${v('/media/table/table-960.webp')} 960w, ${v('/media/table/table-1536.webp')} 1536w" sizes="(max-width: 960px) 100vw, 70vw">
            <img class="tb-table" src="${v('/media/table/table-960.jpg')}" srcset="${v('/media/table/table-960.jpg')} 960w, ${v('/media/table/table-1536.jpg')} 1536w" sizes="(max-width: 960px) 100vw, 70vw" width="1536" height="1024" alt="An elegant dessert table from above: marble cake stands, gilded trays, glass bowls, pink florals and candles">
          </picture>
          <div class="tb-items" data-tb-items></div>
          <div class="tb-zones" data-tb-zones>
            ${cfg.zones.map(z => html`<button type="button" class="tb-zone is-${z.shape}" data-tb-zone="${z.id}" style="left:${(z.x - z.w / 2) * 100}%;top:${(z.y - z.h / 2) * 100}%;width:${z.w * 100}%;height:${z.h * 100}%" aria-label="${z.label} — empty"></button>`)}
          </div>
        </div>
      </div>
      <div class="tb-summary">
        <p class="tb-count" data-tb-count>Your table is empty</p>
        <div class="tb-summary-actions">
          <button type="button" class="btn btn-ghost" data-tb-save>Save my design</button>
          <button type="button" class="btn btn-ghost" data-tb-review disabled>Review my table</button>
          <button type="button" class="btn" data-tb-quote disabled>Request a quote</button>
        </div>
      </div>
    </div>
  </div>

  <div class="tb-pop" data-tb-pop hidden role="dialog" aria-modal="false" aria-labelledby="tb-pop-title">
    <button type="button" class="tb-pop-close" data-tb-pop-close aria-label="Close">×</button>
    <p class="tb-pop-kind" data-tb-pop-kind></p>
    <h3 id="tb-pop-title" data-tb-pop-title></h3>
    <div data-tb-pop-body></div>
  </div>

  <dialog class="tb-dialog" data-tb-review-dialog aria-labelledby="tb-review-title">
    <form method="dialog" class="tb-dialog-inner">
      <button class="tb-pop-close" value="close" aria-label="Close">×</button>
      ${eyebrow('Your dessert table')}
      <h2 id="tb-review-title">Review my table</h2>
      <div class="tb-review-stage" data-tb-review-stage></div>
      <div class="table-scroll"><table class="menu-table tb-review-table">
        <thead><tr><th scope="col">Dessert</th><th scope="col">Served on</th><th scope="col" class="num">Quantity</th><th scope="col"><span class="visually-hidden">Remove</span></th></tr></thead>
        <tbody data-tb-review-rows></tbody>
      </table></div>
      <p class="fine">Prices on request — our team confirms availability and pricing in your quote.</p>
      <div class="tb-dialog-actions">
        <button type="button" class="btn btn-ghost" data-tb-save>Save my design</button>
        <button type="button" class="btn" data-tb-quote>Request a quote</button>
      </div>
    </form>
  </dialog>

  <dialog class="tb-dialog" data-tb-designs-dialog aria-labelledby="tb-designs-title">
    <form method="dialog" class="tb-dialog-inner">
      <button class="tb-pop-close" value="close" aria-label="Close">×</button>
      <h2 id="tb-designs-title">My designs</h2>
      <p class="fine">Designs are saved on this device.</p>
      <ul class="tb-designs" data-tb-designs-list></ul>
    </form>
  </dialog>
</section>
<script type="application/json" id="tb-config">${raw(JSON.stringify(cfg).replace(/</g, '\\u003c'))}</script>
<script src="${v('/js/table-builder.js')}" defer></script>`;
  return layout({
    title: 'Build Your Dessert Table', body, page: 'table', cartCount, canonical: '/build-your-table',
    description: 'Design your own Cocoa Caramel dessert table: choose cakes, chocolates and desserts and see them arranged on the table, then request a quote.',
  });
}
