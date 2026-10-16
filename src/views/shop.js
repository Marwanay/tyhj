import { html, raw, paragraphs, cx } from '../lib/html.js';
import { formatEGP } from '../lib/money.js';
import { leadTimeLabel, prettyDate } from '../lib/dates.js';
import { displayPhone } from '../lib/phone.js';
import { config } from '../config.js';
import { layout } from './layout.js';
import {
  framed, picture, button, eyebrow, monogram, price, input, textarea, select, errorSummary, pill,
  lockIcon, clockIcon, giftIcon, truckIcon, zoomIcon, arrow, mediaUrl,
} from './components.js';
import { priceRange } from '../services/catalog.js';
import { getSetting } from '../services/content.js';
import { ORDER_STATUSES, PAYMENT_STATUSES } from '../services/orders.js';

const STEPS = ['Bag', 'Delivery', 'Payment', 'Confirmation'];
const steps = (current) => html`<ol class="steps" aria-label="Checkout progress">
  ${STEPS.map((s, i) => html`<li class="${i < current ? 'done' : ''}" ${raw(i === current ? 'aria-current="step"' : '')}>${s}</li>`)}
</ol>`;

// ---- Collection -------------------------------------------------------------------

export function collectionPage({ products, cartCount }) {
  // A small collection gives every piece the full feature treatment, alternating sides;
  // a larger one features the first and lists the rest in a grid.
  const featured = products.length <= 4 ? products : products.slice(0, 1);
  const rest = products.slice(featured.length);
  const body = html`
<header class="wrap page-head">
  ${eyebrow('Cocoa Caramel')}
  <h1>The Collection</h1>
  <p class="lede">Each creation is made to order and composed to be the centrepiece of the table.</p>
</header>
<div class="wrap">
  ${featured.length ? featured.map((p, i) => featureCard(p, i + 1)) : html`<p class="lede">Our collection is being prepared. Please check back soon.</p>`}
  ${rest.length ? html`<div class="product-grid">${rest.map((p, i) => productCard(p, i + featured.length + 1))}</div>` : ''}
  <aside class="collection-note">
    ${monogram()}
    <p class="lede" style="margin:0">More creations, and seasonal collections, will join the collection here.</p>
    ${button('Plan an event', { href: '/catering', variant: 'ghost' })}
  </aside>
</div>`;
  return layout({ title: 'The Collection', body, page: 'collection', cartCount, canonical: '/collection' });
}

function featureCard(p, n) {
  const r = priceRange(p);
  return html`<a class="feature-product${n % 2 === 0 ? ' is-reverse' : ''}" href="/collection/${p.slug}">
    ${framed(p.images[0], { mount: true, sizes: '(max-width: 860px) 100vw, 56vw', eager: n === 1 })}
    <div class="info reveal">
      <p class="caption"><span class="numeral">No. ${String(n).padStart(2, '0')}</span></p>
      <h2>${p.name}</h2>
      ${p.tagline ? html`<p class="lede">${p.tagline}</p>` : ''}
      <p style="margin:22px 0 28px">${r ? html`From ${price(r.min)}` : price(null)}</p>
      <span class="link">View the details ${arrow}</span>
    </div>
  </a>`;
}

function productCard(p, n) {
  const r = priceRange(p);
  return html`<a class="product-card" href="/collection/${p.slug}">
    ${framed(p.images[0], { sizes: '(max-width: 700px) 100vw, 33vw' })}
    <p class="caption"><span class="numeral">No. ${String(n).padStart(2, '0')}</span></p>
    <h3>${p.name}</h3>
    <p>${r ? price(r.min) : price(null)}</p>
  </a>`;
}

// ---- Product ----------------------------------------------------------------------

export function productPage({ product: p, cartCount, error }) {
  const sellable = p.variants.filter(v => v.active && v.price > 0);
  const firstAvailable = sellable.find(v => v.stock === null || v.stock > 0);
  const f = p.fulfilment;
  const site = getSetting('site');
  const r = priceRange(p);

  const gallery = html`<div class="gallery" data-gallery>
    <button class="gallery-main" type="button" data-zoom-open aria-label="Open image zoom">
      ${p.images.map((img, i) => html`<div class="${cx('frame', i === 0 && 'is-active')}" style="--ph:${img.placeholder || ''}" data-slide="${i}">
        ${picture({ ...img, alt: img.alt || p.name }, { sizes: '(max-width: 960px) 100vw, 58vw', eager: i === 0 })}
      </div>`)}
      <span class="zoom-hint">${zoomIcon} Zoom</span>
    </button>
    ${p.images.length > 1 ? html`<div class="thumbs" role="group" aria-label="Product images">
      ${p.images.map((img, i) => html`<button class="thumb" type="button" data-thumb="${i}" aria-current="${i === 0 ? 'true' : 'false'}" aria-label="Show image ${i + 1} of ${p.images.length}">
        <img src="${mediaUrl(img, img.widths[0])}" alt="" width="76" height="76" loading="lazy">
      </button>`)}
    </div>` : ''}
    <template data-zoom-sources>${p.images.map(img => html`<img data-src="${mediaUrl(img, img.widths.at(-1))}" alt="${img.alt || p.name}">`)}</template>
  </div>`;

  const buyBox = p.purchasable && firstAvailable ? html`
    <form method="post" action="/bag/add" data-add-form>
      <fieldset>
        <legend class="label">Choose a size</legend>
        <div class="variant-options">
          ${p.variants.filter(v => v.active).map(v => {
            const soldOut = !(v.price > 0) || (v.stock !== null && v.stock <= 0);
            return html`<label class="variant">
              <input type="radio" name="variant_id" value="${v.id}" ${raw(v.id === firstAvailable.id ? 'checked' : '')} ${raw(soldOut ? 'disabled' : '')}
                data-price="${formatEGP(v.price)}" data-max="${Math.min(v.max_per_order, v.stock ?? 99)}">
              <span class="v-name">${v.name}</span>
              <span class="price">${soldOut ? (v.price > 0 ? 'Sold out' : 'Unavailable') : formatEGP(v.price)}</span>
              ${v.description ? html`<span class="v-desc">${v.description}</span>` : ''}
            </label>`;
          })}
        </div>
      </fieldset>
      <div class="qty-row">
        <div class="stepper" data-stepper>
          <button type="button" data-step="-1" aria-label="Decrease quantity">−</button>
          <input type="number" name="quantity" value="1" min="1" max="${Math.min(firstAvailable.max_per_order, firstAvailable.stock ?? 99)}" inputmode="numeric" aria-label="Quantity">
          <button type="button" data-step="1" aria-label="Increase quantity">+</button>
        </div>
        ${button('Add to Bag', { withArrow: true, attrs: 'data-add-button' })}
      </div>
      ${error ? html`<p class="error" role="alert" style="margin-top:12px">${error}</p>` : ''}
      ${p.gift_message_enabled ? html`<p class="note-line">${giftIcon}<span>Add a personal gift message at checkout.</span></p>` : ''}
      <p class="note-line">${clockIcon}<span>Made to order — please allow ${leadTimeLabel(p.lead_time_hours)}. Choose your date at checkout.</span></p>
    </form>
    <div class="sticky-buy" data-sticky-buy aria-hidden="true">
      <div class="s-info"><div class="s-name">${p.name}</div><div class="price" data-sticky-price>${formatEGP(firstAvailable.price)}</div></div>
      <button class="btn" type="button" data-sticky-add tabindex="-1">Add to Bag</button>
    </div>`
    : html`<div class="unavailable" role="status">
      <h2>Not yet available online</h2>
      <p>We are finalising the details for this creation before opening online orders. In the meantime we would be delighted to prepare it for your occasion.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
        ${button('Request a Quote', { href: '/catering#enquire' })}
        ${site.whatsapp ? button('Message us', { href: `https://wa.me/${site.whatsapp.replace(/\D/g, '')}`, variant: 'ghost' }) : ''}
      </div>
    </div>`;

  const tbc = (label) => html`<span class="tbc">${label} will be published before online ordering opens.</span>`;
  const body = html`
<div class="wrap">
  <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/collection">The Collection</a><span aria-hidden="true">/</span><span aria-current="page">${p.name}</span></nav>
  <div class="product">
    ${gallery}
    <div class="product-info">
      ${eyebrow('The Collection')}
      <h1>${p.name}</h1>
      ${p.tagline ? html`<p class="tagline">${p.tagline}</p>` : ''}
      <div class="product-price">
        <span>${r ? (r.min === r.max ? price(r.min) : html`From ${price(r.min)}`) : price(null)}</span>
        <span class="fine">Prices in EGP</span>
      </div>
      <dl class="facts">
        <div><dt>Pieces</dt><dd>${p.piece_count || html`<span class="tbc">To be confirmed</span>`}</dd></div>
        <div><dt>Preparation</dt><dd>${p.lead_time_hours !== null ? leadTimeLabel(p.lead_time_hours) : html`<span class="tbc">To be confirmed</span>`}</dd></div>
        <div><dt>Delivery</dt><dd>${f.delivery ? 'Available' : p.delivery_enabled ? html`<span class="tbc">Areas to be announced</span>` : 'Not offered'}</dd></div>
        <div><dt>Collection</dt><dd>${f.collection ? 'Available' : 'Not offered'}</dd></div>
      </dl>
      ${buyBox}
      <div class="accordion">
        <details open><summary>Description</summary><div class="body">
          ${paragraphs(p.description)}
          ${p.contents ? html`<h4>Contents</h4>${paragraphs(p.contents)}` : ''}
        </div></details>
        <details><summary>Ingredients & allergens</summary><div class="body">
          <h4>Ingredients</h4>${p.ingredients ? paragraphs(p.ingredients) : tbc('Ingredients')}
          <h4>Allergens</h4>${p.allergens ? paragraphs(p.allergens) : tbc('Allergen information')}
        </div></details>
        <details><summary>Storage & care</summary><div class="body">${p.storage ? paragraphs(p.storage) : tbc('Storage guidance')}</div></details>
        <details><summary>Delivery & collection</summary><div class="body">
          <p class="note-line" style="margin-top:0">${truckIcon}<span>${getSetting('store').deliveryNote}</span></p>
          ${f.collection ? html`<p>Collection from: ${site.collectionAddress}</p>` : ''}
          <p><a href="/pages/delivery">Read our delivery information</a></p>
        </div></details>
      </div>
    </div>
  </div>
</div>
<div class="lightbox" data-lightbox role="dialog" aria-modal="true" aria-label="${p.name} — image zoom" hidden>
  <div class="lightbox-bar"><span class="label" data-lb-count></span><button type="button" data-lb-close aria-label="Close zoom">✕</button></div>
  <div class="lightbox-stage" data-lb-stage></div>
  <button class="lb-nav lb-prev" type="button" data-lb-prev aria-label="Previous image">‹</button>
  <button class="lb-nav lb-next" type="button" data-lb-next aria-label="Next image">›</button>
  <p class="lightbox-hint">Pinch, scroll or double-tap to zoom · drag to explore</p>
</div>`;
  return layout({
    title: p.name, description: (p.tagline || p.description).slice(0, 160), body, page: 'collection', cartCount,
    bodyClass: p.purchasable ? 'has-sticky-buy' : '', canonical: `/collection/${p.slug}`,
    ogImage: p.images[0] ? mediaUrl(p.images[0], p.images[0].widths.find(w => w >= 1000) || p.images[0].widths.at(-1)) : undefined,
  });
}

// ---- Bag --------------------------------------------------------------------------

export function bagPage({ priced, cartCount, notice }) {
  if (!priced.lines.length) {
    return layout({ title: 'Your bag', cartCount, noindex: true, body: html`
      <div class="wrap empty-state">
        ${monogram()}
        <h1>Your bag is waiting for something sweet.</h1>
        <p class="lede" style="margin:0 auto 32px;max-width:24em">Begin with our signature tray, or tell us about an occasion you are planning.</p>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
          ${button('Shop the Collection', { href: '/collection', withArrow: true })}
          ${button('Plan Your Event', { href: '/catering', variant: 'ghost' })}
        </div>
      </div>` });
  }
  const body = html`
<div class="wrap" style="padding-top:40px">
  ${steps(0)}
  <div class="checkout">
    <div>
      <h1>Your bag</h1>
      ${[...(priced.problems || []), ...(notice ? [notice] : [])].map(p => html`<p class="notice" role="status">${p}</p>`)}
      <div class="bag-lines">
        ${priced.lines.map(l => html`<div class="bag-line">
          ${framed(l.image, { reveal: false, sizes: '120px' })}
          <div>
            <h3><a href="/collection/${l.product.slug}" style="text-decoration:none">${l.product.name}</a></h3>
            <p class="meta">${l.variant.name} · ${formatEGP(l.unitPrice)} each</p>
            <form method="post" action="/bag/update" class="controls" data-qty-form>
              <input type="hidden" name="variant_id" value="${l.variant.id}">
              <div class="stepper" data-stepper data-autosubmit>
                <button type="button" data-step="-1" aria-label="Decrease quantity of ${l.product.name}">−</button>
                <input type="number" name="quantity" value="${l.quantity}" min="1" max="${Math.min(l.variant.max_per_order, l.variant.stock ?? 99)}" inputmode="numeric" aria-label="Quantity of ${l.product.name}">
                <button type="button" data-step="1" aria-label="Increase quantity of ${l.product.name}">+</button>
              </div>
              <noscript><button class="text-btn" type="submit">Update</button></noscript>
              <button class="text-btn" type="submit" name="quantity" value="0" formnovalidate>Remove</button>
            </form>
          </div>
          <div class="price line-total">${formatEGP(l.lineTotal)}</div>
        </div>`)}
      </div>
      <p style="margin-top:24px"><a class="link" href="/collection">Continue browsing</a></p>
    </div>
    <aside class="summary" aria-label="Order summary">
      <h2>Summary</h2>
      <div class="totals">
        <div><span>Subtotal</span><span class="price">${formatEGP(priced.subtotal)}</span></div>
        <div><span>Delivery</span><span class="fine">Calculated for your area</span></div>
      </div>
      <div style="margin-top:24px">${button('Continue to delivery', { href: '/checkout', withArrow: true, cls: 'btn-block' })}</div>
      <p class="secure-note">${lockIcon}<span>Payment is taken on our provider's secure page. Your order is confirmed once payment is verified.</span></p>
    </aside>
  </div>
</div>`;
  return layout({ title: 'Your bag', body, cartCount, noindex: true });
}

function orderSummary(lines, { subtotal, deliveryFee, total, areaName }) {
  return html`<aside class="summary" aria-label="Order summary">
    <h2>Your order</h2>
    ${lines.map(l => html`<div class="summary-line">
      ${framed(l.image, { reveal: false, sizes: '64px' })}
      <div>${l.name}<div class="q">${l.variantName} × ${l.quantity}</div></div>
      <span class="price">${formatEGP(l.total)}</span>
    </div>`)}
    <div class="totals">
      <div><span>Subtotal</span><span>${formatEGP(subtotal)}</span></div>
      <div><span>Delivery${areaName ? ` — ${areaName}` : ''}</span><span data-fee>${deliveryFee === null ? 'Choose your area' : deliveryFee === 0 ? 'No charge' : formatEGP(deliveryFee)}</span></div>
      <div class="grand"><span>Total</span><span data-total>${total === null ? '—' : formatEGP(total)}</span></div>
    </div>
    <p class="secure-note">${lockIcon}<span>Totals are calculated securely on our side before payment.</span></p>
  </aside>`;
}

const bagLinesForSummary = (priced) => priced.lines.map(l => ({ name: l.product.name, variantName: l.variant.name, quantity: l.quantity, total: l.lineTotal, image: l.image }));

// ---- Checkout: delivery details ---------------------------------------------------

export function checkoutPage({ priced, areas, values = {}, errors = {}, minDate, maxDate, cartCount }) {
  const site = getSetting('site');
  const v = { fulfilment: priced.fulfilment.delivery ? 'delivery' : 'collection', address: {}, ...values };
  const selectedArea = areas.find(a => String(a.id) === String(v.areaId));
  const fee = v.fulfilment === 'collection' ? 0 : selectedArea ? selectedArea.fee : null;
  const body = html`
<div class="wrap" style="padding-top:40px">
  ${steps(1)}
  <div class="checkout">
    <form method="post" action="/checkout" novalidate data-checkout-form>
      <h1>Delivery details</h1>
      ${errorSummary(errors)}
      ${errors.bag ? html`<p class="notice">${errors.bag}</p>` : ''}
      <h2 class="section-title">About you</h2>
      ${input('name', 'Full name', { value: v.name, errors, autocomplete: 'name' })}
      <div class="row-2">
        ${input('phone', 'Mobile number', { value: values.phoneRaw ?? v.phone, type: 'tel', errors, autocomplete: 'tel', inputmode: 'tel', hint: 'Egyptian mobile, e.g. 010 1234 5678' })}
        ${input('email', 'Email', { value: v.email, type: 'email', errors, autocomplete: 'email', hint: 'For your confirmation' })}
      </div>

      <h2 class="section-title">How would you like to receive it?</h2>
      <fieldset class="field ${errors.fulfilment ? 'has-error' : ''}" id="f-fulfilment">
        <legend class="visually-hidden">Delivery or collection</legend>
        <div class="choice-grid">
          <label class="choice"><input type="radio" name="fulfilment" value="delivery" ${raw(v.fulfilment === 'delivery' ? 'checked' : '')} ${raw(priced.fulfilment.delivery ? '' : 'disabled')} data-fulfilment>
            <span><span class="c-title">Delivery</span><span class="c-sub">${priced.fulfilment.delivery ? 'Fee depends on your area' : 'Not available for these items'}</span></span></label>
          <label class="choice"><input type="radio" name="fulfilment" value="collection" ${raw(v.fulfilment === 'collection' ? 'checked' : '')} ${raw(priced.fulfilment.collection ? '' : 'disabled')} data-fulfilment>
            <span><span class="c-title">Collection</span><span class="c-sub">${priced.fulfilment.collection ? 'No delivery fee' : 'Not available for these items'}</span></span></label>
        </div>
        ${errors.fulfilment ? html`<p class="error">${errors.fulfilment}</p>` : ''}
      </fieldset>

      <div data-when="delivery" ${raw(v.fulfilment === 'delivery' ? '' : 'hidden')}>
        ${select('area_id', 'Delivery area', areas.map(a => ({ value: a.id, label: `${a.name} — ${a.fee ? formatEGP(a.fee) : 'free delivery'}` })),
          { value: v.areaId, errors, placeholder: 'Choose your area' })}
        <template data-area-fees>${raw(JSON.stringify(Object.fromEntries(areas.map(a => [a.id, { fee: a.fee, label: a.fee ? formatEGP(a.fee) : 'No charge' }]))))}</template>
        ${input('street', 'Street address', { value: v.address.street, errors, autocomplete: 'address-line1', required: false })}
        <div class="row-3 keep">
          ${input('building', 'Building', { value: v.address.building, errors, required: false })}
          ${input('floor', 'Floor', { value: v.address.floor, errors, optional: true })}
          ${input('apartment', 'Apartment', { value: v.address.apartment, errors, optional: true })}
        </div>
        <div class="row-2">
          ${input('district', 'District / compound', { value: v.address.district, errors, optional: true, autocomplete: 'address-level3' })}
          ${input('landmark', 'Nearest landmark', { value: v.address.landmark, errors, optional: true })}
        </div>
      </div>
      <div data-when="collection" ${raw(v.fulfilment === 'collection' ? '' : 'hidden')}>
        <p class="notice">Collect from: <strong>${site.collectionAddress || 'address to be confirmed'}</strong>${site.collectionNotes ? html`<br>${site.collectionNotes}` : ''}</p>
      </div>

      <h2 class="section-title">When?</h2>
      ${input('date', 'Preferred date', { value: v.date || minDate, type: 'date', errors, hint: `Made to order — the earliest available date is ${prettyDate(minDate)}.`, attrs: `min="${minDate}" max="${maxDate}"` })}

      ${priced.giftMessage ? html`<h2 class="section-title">A few words <span class="numeral" style="font-size:.8em">(optional)</span></h2>
        ${textarea('gift_message', 'Gift message', { value: v.giftMessage, errors, maxlength: 300, rows: 3, hint: 'We will write it on a card for the recipient. Up to 300 characters.' })}` : ''}
      ${textarea('notes', 'Notes for our team', { value: v.notes, errors, maxlength: 500, rows: 3, hint: 'Delivery instructions or anything else we should know.' })}

      <div class="field ${errors.agree ? 'has-error' : ''}" id="f-agree">
        <label class="check"><input type="checkbox" name="agree" ${raw(values.agree ? 'checked' : '')} required>
          <span>I have read the <a href="/pages/terms" target="_blank">terms of sale</a>, <a href="/pages/cancellations-refunds" target="_blank">cancellation policy</a> and allergen information.</span></label>
        ${errors.agree ? html`<p class="error">${errors.agree}</p>` : ''}
      </div>
      ${button('Review & pay', { withArrow: true, cls: 'btn-block', attrs: 'data-busy-on-submit' })}
    </form>
    ${orderSummary(bagLinesForSummary(priced), { subtotal: priced.subtotal, deliveryFee: fee, total: fee === null ? null : priced.subtotal + fee, areaName: selectedArea?.name })}
  </div>
</div>`;
  return layout({ title: 'Delivery details', body, cartCount, noindex: true });
}

// ---- Checkout: review & pay -------------------------------------------------------

export function paymentPage({ order: o, token, error, providerReady, cartCount, images = {} }) {
  const lines = o.items.map(i => ({ name: i.name, variantName: i.variant_name, quantity: i.quantity, total: i.unit_price * i.quantity, image: images[i.product_id] || null }));
  const a = o.addressObj;
  const body = html`
<div class="wrap" style="padding-top:40px">
  ${steps(2)}
  <div class="checkout">
    <div>
      <h1>Review & pay</h1>
      ${config.payments.mode === 'test' ? html`<p class="notice test"><strong>Test mode.</strong> You will be taken to a simulated payment page. No real payment is taken and no real order is placed.</p>` : ''}
      ${error ? html`<p class="notice" role="alert">${error}</p>` : ''}
      <dl class="kv">
        <dt>Order</dt><dd>${o.ref}</dd>
        <dt>Name</dt><dd>${o.customer_name}</dd>
        <dt>Contact</dt><dd>${displayPhone(o.customer_phone)} · ${o.customer_email}</dd>
        <dt>${o.fulfilment === 'delivery' ? 'Delivery' : 'Collection'}</dt>
        <dd>${prettyDate(o.requested_date)}${o.fulfilment === 'delivery' ? html`<br>${[a.street, a.building && `Building ${a.building}`, a.floor && `Floor ${a.floor}`, a.apartment && `Apt ${a.apartment}`].filter(Boolean).join(', ')}<br>${[a.district, o.delivery_area_name].filter(Boolean).join(', ')}` : ''}</dd>
        ${o.gift_message ? html`<dt>Gift message</dt><dd><em>“${o.gift_message}”</em></dd>` : ''}
      </dl>
      <p style="margin:20px 0 32px"><a class="link" href="/checkout">Edit details</a></p>
      ${providerReady
        ? html`<form method="post" action="/checkout/pay/${o.ref}" data-pay-form>
            <input type="hidden" name="t" value="${token}">
            ${button(`Pay ${formatEGP(o.total)} securely`, { withArrow: true, cls: 'btn-block', attrs: 'data-busy-on-submit' })}
          </form>
          <p class="secure-note">${lockIcon}<span>You will complete payment on our payment provider's secure page. We never see or store your card details. Your order is confirmed only after the payment is verified.</span></p>`
        : html`<p class="notice" role="alert">Online payment is not available at the moment, so this order cannot be paid yet. Please contact us and quote ${o.ref}.</p>`}
    </div>
    ${orderSummary(lines, { subtotal: o.subtotal, deliveryFee: o.delivery_fee, total: o.total, areaName: o.delivery_area_name })}
  </div>
</div>`;
  return layout({ title: 'Review & pay', body, cartCount, noindex: true });
}

// ---- Order status -----------------------------------------------------------------

const FLOW = ['awaiting_payment', 'confirmed', 'preparing', 'ready', 'completed'];

export function orderPage({ order: o, token, cartCount, returned, cancelled }) {
  const paid = o.payment_status === 'paid';
  const latest = o.payments[0];
  let headline, intro, tone;
  if (o.status === 'cancelled') { headline = 'This order was cancelled.'; intro = 'If you have any questions, please contact us with your reference.'; tone = 'bad'; }
  else if (paid) { headline = 'Thank you. Your order is confirmed.'; intro = `Your payment has been verified. We will prepare everything for ${prettyDate(o.requested_date)}.`; tone = 'ok'; }
  else if (o.payment_status === 'pending') { headline = 'Your payment is being confirmed.'; intro = 'Your bank is still processing the payment. This page will update as soon as it is confirmed — there is no need to pay again.'; tone = 'warn'; }
  else if (cancelled) { headline = 'Payment not completed.'; intro = 'You left the payment page, so nothing has been charged. Your order is saved — you can pay whenever you are ready.'; tone = 'warn'; }
  else if (o.payment_status === 'failed') { headline = 'Your payment did not go through.'; intro = 'Nothing has been charged. You can try again, perhaps with a different card.'; tone = 'bad'; }
  else if (returned) { headline = 'One moment — confirming your payment.'; intro = 'We are waiting for confirmation from the payment provider. This usually takes a few seconds.'; tone = 'info'; }
  else { headline = 'Your order is awaiting payment.'; intro = 'Complete payment to confirm your order.'; tone = 'info'; }

  const waiting = o.status !== 'cancelled' && !cancelled &&
    (o.payment_status === 'pending' || (returned && o.payment_status === 'unpaid'));
  const idx = o.status === 'out_for_delivery' ? 3 : Math.max(0, FLOW.indexOf(o.status));
  const flowLabels = ['Order placed', 'Payment verified', 'Being prepared', o.fulfilment === 'delivery' ? 'On its way' : 'Ready to collect', 'Completed'];

  const body = html`
<div class="wrap">
  <section class="status-hero" aria-live="polite" ${raw(waiting ? `data-poll="/orders/${o.ref}/status?t=${encodeURIComponent(token)}" data-poll-state="${o.payment_status}:${o.status}"` : '')}>
    ${monogram()}
    <p class="ref">Order ${o.ref}</p>
    <h1>${headline}</h1>
    <p class="lede" style="max-width:28em;margin:0 auto 24px">${intro}</p>
    <p>${pill(PAYMENT_STATUSES[o.payment_status], tone)} ${pill(ORDER_STATUSES[o.status], 'info')}</p>
    ${!paid && o.status === 'awaiting_payment' && o.payment_status !== 'pending' && !waiting
      ? html`<div style="margin-top:28px">${button(o.payment_status === 'failed' || cancelled ? 'Try payment again' : 'Continue to payment', { href: `/checkout/pay/${o.ref}?t=${encodeURIComponent(token)}`, withArrow: true })}</div>` : ''}
    ${waiting ? html`<p class="fine" data-poll-note style="margin-top:20px">This page refreshes automatically.</p>` : ''}
  </section>
  ${o.status !== 'cancelled' ? html`<ol class="timeline" aria-label="Order progress">
    ${flowLabels.map((l, i) => html`<li class="${i < idx || (i === idx && paid && i > 0) ? 'done' : i === idx ? 'current' : ''}">${l}</li>`)}
  </ol>` : ''}
  <div class="detail-grid">
    <section>
      <h2>Your order</h2>
      <table class="items">
        <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Total</th></tr></thead>
        <tbody>${o.items.map(i => html`<tr><td>${i.name}<div class="fine">${i.variant_name}</div></td><td class="num">${i.quantity}</td><td class="num">${formatEGP(i.unit_price * i.quantity)}</td></tr>`)}</tbody>
        <tfoot>
          <tr><td colspan="2">Subtotal</td><td class="num">${formatEGP(o.subtotal)}</td></tr>
          <tr><td colspan="2">${o.fulfilment === 'delivery' ? `Delivery — ${o.delivery_area_name}` : 'Collection'}</td><td class="num">${o.delivery_fee ? formatEGP(o.delivery_fee) : 'No charge'}</td></tr>
          <tr class="grand"><td colspan="2">Total</td><td class="num">${formatEGP(o.total)}</td></tr>
        </tfoot>
      </table>
    </section>
    <section>
      <h2>Details</h2>
      <dl class="kv">
        <dt>${o.fulfilment === 'delivery' ? 'Delivery date' : 'Collection date'}</dt><dd>${prettyDate(o.requested_date)}</dd>
        <dt>Name</dt><dd>${o.customer_name}</dd>
        <dt>Phone</dt><dd>${displayPhone(o.customer_phone)}</dd>
        <dt>Email</dt><dd>${o.customer_email}</dd>
        ${o.gift_message ? html`<dt>Gift message</dt><dd><em>“${o.gift_message}”</em></dd>` : ''}
        ${latest ? html`<dt>Payment</dt><dd>${latest.merchant_reference}${latest.mode === 'test' ? ' (test)' : ''}</dd>` : ''}
      </dl>
      <p class="fine" style="margin-top:24px">Please keep this page's link — it is private to you. Questions? Quote ${o.ref} when you contact us.</p>
    </section>
  </div>
</div>`;
  return layout({ title: `Order ${o.ref}`, body, cartCount, noindex: true });
}
