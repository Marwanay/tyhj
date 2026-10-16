import { html, raw, cx } from '../lib/html.js';
import { formatEGP, toInputEGP } from '../lib/money.js';
import { prettyDate, prettyDateTime, leadTimeLabel } from '../lib/dates.js';
import { displayPhone } from '../lib/phone.js';
import { config } from '../config.js';
import { monogram, pill, button, mediaUrl } from './components.js';
import { ASSET_VERSION } from './layout.js';
import { ORDER_STATUSES, PAYMENT_STATUSES } from '../services/orders.js';
import { ENQUIRY_STATUSES, QUOTE_STATUSES, quoteProblems } from '../services/quotes.js';

// ---- Primitives ---------------------------------------------------------------------

const csrfField = (s) => html`<input type="hidden" name="_csrf" value="${s.csrf}">`;
const statusTone = (s) => ({ paid: 'ok', confirmed: 'ok', completed: 'ok', paid_in_full: 'ok', paid_deposit: 'ok', pending: 'warn', awaiting_payment: 'warn', accepted: 'warn', unpaid: '', new: 'info', sent: 'info', quoted: 'info', failed: 'bad', cancelled: 'bad', refunded: 'bad', expired: 'bad', withdrawn: 'bad', declined: 'bad' }[s] || 'info');

function field(name, label, { value = '', type = 'text', hint = '', attrs = '', rows, id = `a-${name}` } = {}) {
  const control = type === 'textarea'
    ? html`<textarea class="input" id="${id}" name="${name}" rows="${rows || 4}" ${raw(attrs)}>${value ?? ''}</textarea>`
    : html`<input class="input" id="${id}" name="${name}" type="${type}" value="${value ?? ''}" ${raw(attrs)}>`;
  return html`<div class="field"><label for="${id}">${label}</label>${hint ? html`<p class="hint">${hint}</p>` : ''}${control}</div>`;
}
function selectField(name, label, options, value, hint = '') {
  return html`<div class="field"><label for="a-${name}">${label}</label>${hint ? html`<p class="hint">${hint}</p>` : ''}
    <select class="input" id="a-${name}" name="${name}">${options.map(([v, l]) => html`<option value="${v}" ${raw(String(v) === String(value) ? 'selected' : '')}>${l}</option>`)}</select></div>`;
}
const checkbox = (name, label, checked) => html`<label class="check" style="margin-bottom:12px"><input type="checkbox" name="${name}" value="1" ${raw(checked ? 'checked' : '')}><span>${label}</span></label>`;

function postButton(s, action, label, { variant = '', confirm = '', hidden = {} } = {}) {
  return html`<form class="inline-form" method="post" action="${action}" ${raw(confirm ? `data-confirm="${confirm.replace(/"/g, '&quot;')}"` : '')}>
    ${csrfField(s)}${Object.entries(hidden).map(([k, v]) => html`<input type="hidden" name="${k}" value="${v}">`)}
    <button class="${cx('btn btn-sm', variant && `btn-${variant}`)}" type="submit">${label}</button></form>`;
}

// ---- Layout -------------------------------------------------------------------------

const NAV = [
  ['Overview', [['/admin', 'Dashboard', 'dashboard']]],
  ['Shop', [['/admin/products', 'Products', 'products'], ['/admin/orders', 'Orders', 'orders'], ['/admin/delivery', 'Delivery areas', 'delivery']]],
  ['Events', [['/admin/enquiries', 'Enquiries & quotes', 'enquiries']]],
  ['Website', [['/admin/content', 'Homepage & contact', 'content'], ['/admin/pages', 'Policy pages', 'pages']]],
  ['System', [['/admin/settings', 'Payments & notifications', 'settings'], ['/admin/users', 'Team & password', 'users']]],
];

export function adminLayout({ title, body, session, section, counts = {}, flash }) {
  return html`<!doctype html><html lang="en" class="no-js"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">
<title>${title} — Cocoa Caramel admin</title>
<link rel="icon" href="/brand/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/site.css?v=${ASSET_VERSION}"><link rel="stylesheet" href="/css/admin.css?v=${ASSET_VERSION}">
<script src="/js/boot.js?v=${ASSET_VERSION}"></script><script src="/js/resize.js?v=${ASSET_VERSION}" defer></script><script src="/js/admin.js?v=${ASSET_VERSION}" defer></script></head>
<body class="admin">
${config.payments.mode === 'test' ? html`<div class="test-ribbon">Test mode — payments are simulated</div>` : ''}
<div class="admin-shell">
  <nav class="admin-nav" aria-label="Admin">
    <a class="brand-sm" href="/admin">${monogram()}<span>Cocoa Caramel</span></a>
    ${NAV.map(([group, items]) => html`<div class="group">${group}</div>${items.map(([href, label, key]) => html`
      <a class="nav-item" href="${href}" ${raw(section === key ? 'aria-current="page"' : '')}>${label}${counts[key] ? html`<span class="count">${counts[key]}</span>` : ''}</a>`)}`)}
    <a class="nav-item" href="/" target="_blank" rel="noopener">View website ↗</a>
    <div class="who">${session.name || session.email}<br>
      <form method="post" action="/admin/logout">${csrfField(session)}<button type="submit">Sign out</button></form></div>
  </nav>
  <main class="admin-main" id="main">
    ${flash ? html`<div class="${cx('flash', flash.error && 'err')}" role="status">${flash.message}</div>` : ''}
    ${body}
  </main>
</div></body></html>`;
}

export function loginPage({ error, email = '', setup = false }) {
  return html`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Sign in — Cocoa Caramel admin</title>
<link rel="stylesheet" href="/css/site.css?v=${ASSET_VERSION}"><link rel="stylesheet" href="/css/admin.css?v=${ASSET_VERSION}"></head>
<body class="admin"><main class="login-wrap">
  <form class="login-card" method="post" action="/admin/login">
    ${monogram()}<h1>Studio sign in</h1>
    ${error ? html`<p class="flash err" role="alert">${error}</p>` : ''}
    <div class="field"><label for="email">Email</label><input class="input" id="email" name="email" type="email" value="${email}" autocomplete="username" required autofocus></div>
    <div class="field"><label for="password">Password</label><input class="input" id="password" name="password" type="password" autocomplete="current-password" required></div>
    <button class="btn btn-block" type="submit">Sign in</button>
    ${setup ? html`<p class="muted" style="margin-top:18px;text-align:center">First time here? <a href="/admin/setup">Create the owner account</a></p>` : ''}
  </form>
</main></body></html>`;
}

export function setupPage({ error, values = {} }) {
  return html`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Set up — Cocoa Caramel admin</title>
<link rel="stylesheet" href="/css/site.css?v=${ASSET_VERSION}"><link rel="stylesheet" href="/css/admin.css?v=${ASSET_VERSION}"></head>
<body class="admin"><main class="login-wrap">
  <form class="login-card" method="post" action="/admin/setup">
    ${monogram()}<h1>Create the owner account</h1>
    <p class="muted" style="margin-top:-12px;margin-bottom:20px;text-align:center">This page works once, while no accounts exist.</p>
    ${error ? html`<p class="flash err" role="alert">${error}</p>` : ''}
    <div class="field"><label for="token">Setup code</label><p class="hint">The ADMIN_SETUP_TOKEN value set on the server.</p><input class="input" id="token" name="token" type="password" autocomplete="off" required></div>
    <div class="field"><label for="name">Your name</label><input class="input" id="name" name="name" value="${values.name || ''}" autocomplete="name"></div>
    <div class="field"><label for="email">Email</label><input class="input" id="email" name="email" type="email" value="${values.email || ''}" autocomplete="username" required></div>
    <div class="field"><label for="password">Password</label><p class="hint">At least 12 characters.</p><input class="input" id="password" name="password" type="password" minlength="12" autocomplete="new-password" required></div>
    <button class="btn btn-block" type="submit">Create account</button>
  </form>
</main></body></html>`;
}

const head = (title, sub = '', actions = '') => html`<header class="admin-head"><div><h1>${title}</h1>${sub ? html`<p class="sub">${sub}</p>` : ''}</div><div class="actions">${actions}</div></header>`;

// ---- Dashboard ----------------------------------------------------------------------

export function dashboardView({ checklist, orders, enquiries, payment, stats }) {
  return html`${head('Good day', 'What needs attention, and what remains before launch.')}
  <div class="grid-3">
    <div class="card"><p class="label muted">Paid orders · 30 days</p><p style="font-size:30px;margin:6px 0 0">${stats.paidOrders}</p><p class="muted">${formatEGP(stats.revenue)}</p></div>
    <div class="card"><p class="label muted">New enquiries</p><p style="font-size:30px;margin:6px 0 0">${stats.newEnquiries}</p><p class="muted">awaiting review</p></div>
    <div class="card"><p class="label muted">Payments</p><p style="font-size:22px;margin:6px 0 4px">${payment.label} · ${payment.mode === 'live' ? 'Live' : 'Test mode'}</p>${pill(payment.ready ? 'Ready' : 'Not ready', payment.ready ? 'ok' : 'bad')}</div>
  </div>
  <div class="grid-main">
    <div>
      <div class="card"><h2>Recent orders</h2>${ordersTable(orders, true)}<p><a href="/admin/orders">All orders →</a></p></div>
      <div class="card"><h2>Latest enquiries</h2>${enquiriesTable(enquiries)}<p><a href="/admin/enquiries">All enquiries →</a></p></div>
    </div>
    <div class="card"><h2>Launch checklist</h2>
      <ul class="checklist">${checklist.map(c => html`<li class="${c.ok ? 'ok' : c.blocking ? 'block' : 'todo'}"><span>${c.href && !c.ok ? html`<a href="${c.href}">${c.label}</a>` : c.label}${c.detail ? html`<small>${c.detail}</small>` : ''}</span></li>`)}</ul>
    </div>
  </div>`;
}

// ---- Products -----------------------------------------------------------------------

export function productsView({ products, s }) {
  return html`${head('Products', 'Everything in the collection. Products stay unpurchasable until every required selling detail is set.',
    html`<form method="post" action="/admin/products/new">${csrfField(s)}<button class="btn btn-sm">New product</button></form>`)}
  <div class="card table-wrap"><table class="table"><thead><tr><th></th><th>Product</th><th>Status</th><th>Ready to sell</th><th class="num">Price</th></tr></thead><tbody>
  ${products.map(p => html`<tr>
    <td style="width:64px">${p.images[0] ? html`<img src="${mediaUrl(p.images[0], p.images[0].widths[0])}" alt="" width="56" height="56" style="object-fit:cover;aspect-ratio:1">` : ''}</td>
    <td><a href="/admin/products/${p.id}">${p.name}</a><div class="muted">/collection/${p.slug}</div></td>
    <td>${pill(p.status, p.status === 'published' ? 'ok' : '')}</td>
    <td>${p.readiness.ready ? pill('Ready', 'ok') : html`${pill(`${p.readiness.missing.length} missing`, 'warn')}`}</td>
    <td class="num">${p.variants.filter(v => v.price).map(v => formatEGP(v.price)).join(' / ') || '—'}</td></tr>`)}
  </tbody></table></div>`;
}

export function productEditView({ p, s }) {
  return html`${head(p.name, html`<a href="/collection/${p.slug}" target="_blank">View on site ↗</a>`,
    html`${pill(p.status, p.status === 'published' ? 'ok' : '')} ${p.readiness.ready ? pill('Ready to sell', 'ok') : pill('Not purchasable yet', 'warn')}`)}
  ${!p.readiness.ready ? html`<div class="card"><h2>Before this can be bought online</h2><ul class="checklist">${p.readiness.missing.map(m => html`<li class="todo">${m}</li>`)}</ul></div>` : ''}
  <div class="grid-main">
    <form class="card" method="post" action="/admin/products/${p.id}">${csrfField(s)}
      <h2>Details</h2>
      ${field('name', 'Name', { value: p.name, attrs: 'required' })}
      ${field('slug', 'Web address', { value: p.slug, hint: 'Lowercase letters, numbers and dashes.' })}
      ${field('tagline', 'Short line', { value: p.tagline })}
      ${field('description', 'Description', { value: p.description, type: 'textarea', rows: 5 })}
      ${field('contents', 'Contents', { value: p.contents, type: 'textarea', rows: 3, hint: 'What is inside the box or tray.' })}
      ${field('piece_count', 'Piece count', { value: p.piece_count, hint: 'e.g. "48 pieces". Leave blank until confirmed.' })}
      ${field('ingredients', 'Ingredients', { value: p.ingredients, type: 'textarea', rows: 3 })}
      ${field('allergens', 'Allergens', { value: p.allergens, type: 'textarea', rows: 2, hint: 'Contains / may contain.' })}
      ${field('storage', 'Storage guidance', { value: p.storage, type: 'textarea', rows: 2 })}
      ${field('lead_time_hours', 'Preparation lead time (hours)', { value: p.lead_time_hours ?? '', type: 'number', attrs: 'min="0" max="2000"', hint: p.lead_time_hours !== null ? `Shown to customers as “${leadTimeLabel(p.lead_time_hours)}”.` : 'Required before the product can be sold.' })}
      <h3>Options</h3>
      ${checkbox('gift_message_enabled', 'Offer an optional gift message at checkout', p.gift_message_enabled)}
      ${checkbox('delivery_enabled', 'Available for delivery (to the configured delivery areas)', p.delivery_enabled)}
      ${checkbox('collection_enabled', 'Available for collection (needs a collection address in Homepage & contact)', p.collection_enabled)}
      ${checkbox('featured', 'Feature on the homepage', p.featured)}
      ${selectField('status', 'Visibility', [['draft', 'Draft — hidden'], ['published', 'Published — visible on the website'], ['archived', 'Archived']], p.status,
        'A published product can be viewed but is only purchasable once ready.')}
      ${button('Save product')}
    </form>
    <div>
      <div class="card"><h2>Sizes & prices</h2>
        ${p.variants.map(v => html`<form method="post" action="/admin/products/${p.id}/variants/${v.id}" style="border-bottom:1px solid var(--rule);padding-bottom:14px;margin-bottom:14px">${csrfField(s)}
          ${field('name', 'Size / variant name', { value: v.name, id: `v${v.id}-name` })}
          ${field('description', 'Note', { value: v.description, hint: 'Optional, e.g. "Serves 20".', id: `v${v.id}-description` })}
          <div class="grid-2">${field('price', 'Price (EGP)', { value: toInputEGP(v.price), attrs: 'inputmode="decimal"', hint: v.price ? formatEGP(v.price) : 'Not set', id: `v${v.id}-price` })}
          ${field('stock', 'Stock', { value: v.stock ?? '', type: 'number', attrs: 'min="0"', hint: 'Blank = made to order', id: `v${v.id}-stock` })}</div>
          ${field('max_per_order', 'Max per order', { value: v.max_per_order, type: 'number', attrs: 'min="1" max="50"', id: `v${v.id}-max` })}
          ${checkbox('active', 'Available', v.active)}
          <div class="actions"><button class="btn btn-sm">Save</button>
          <button class="btn btn-sm btn-danger" formaction="/admin/products/${p.id}/variants/${v.id}/delete" data-confirm="Delete this variant?">Delete</button></div>
        </form>`)}
        <form method="post" action="/admin/products/${p.id}/variants">${csrfField(s)}<button class="btn btn-sm btn-ghost">Add a size / variant</button></form>
      </div>
      <div class="card"><h2>Images</h2>
        <p class="muted">The first image is the main image. Upload large originals (2000px+) — we create sharp, fast versions automatically.</p>
        <div class="img-list">${p.images.map((img, i) => html`<div class="img-item">
          <img src="${mediaUrl(img, img.widths[0])}" alt="${img.alt}">
          <form method="post" action="/admin/products/${p.id}/images/${img.id}">${csrfField(s)}
            <input class="input" name="alt" value="${img.alt}" aria-label="Image description" placeholder="Describe the image">
            <div class="actions" style="margin-top:6px">
              <button class="btn btn-sm btn-ghost" name="op" value="save">Save</button>
              ${i > 0 ? html`<button class="btn btn-sm btn-ghost" name="op" value="first">Make main</button>` : ''}
              <button class="btn btn-sm btn-danger" name="op" value="delete" data-confirm="Remove this image?">✕</button>
            </div></form></div>`)}</div>
        <form method="post" action="/admin/products/${p.id}/images?_csrf=${encodeURIComponent(s.csrf)}" enctype="multipart/form-data" style="margin-top:16px">
          <input class="input" type="file" name="images" accept="image/*" multiple required aria-label="Choose images">
          <div style="margin-top:10px"><button class="btn btn-sm">Upload</button></div>
        </form>
      </div>
      <div class="card"><h2>Remove</h2>${postButton(s, `/admin/products/${p.id}/delete`, 'Delete product', { variant: 'danger', confirm: 'Delete this product permanently? Past orders keep their details.' })}</div>
    </div>
  </div>`;
}

// ---- Orders -------------------------------------------------------------------------

function ordersTable(orders, compact = false) {
  if (!orders.length) return html`<p class="muted">No orders yet.</p>`;
  return html`<div class="table-wrap"><table class="table"><thead><tr><th>Order</th><th>Customer</th>${compact ? '' : html`<th>Date needed</th>`}<th>Payment</th><th>Status</th><th class="num">Total</th></tr></thead><tbody>
  ${orders.map(o => html`<tr><td><a href="/admin/orders/${o.id}">${o.ref}</a><div class="muted">${prettyDateTime(o.created_at)}${o.payment_mode === 'test' ? ' · test' : ''}</div></td>
    <td>${o.customer_name}<div class="muted">${displayPhone(o.customer_phone)}</div></td>
    ${compact ? '' : html`<td>${prettyDate(o.requested_date)}<div class="muted">${o.fulfilment === 'delivery' ? o.delivery_area_name : 'Collection'}</div></td>`}
    <td>${pill(PAYMENT_STATUSES[o.payment_status], statusTone(o.payment_status))}</td>
    <td>${pill(ORDER_STATUSES[o.status], statusTone(o.status))}</td><td class="num">${formatEGP(o.total)}</td></tr>`)}
  </tbody></table></div>`;
}

export function ordersView({ orders, filter }) {
  const tabs = [['', 'All'], ['paid', 'Paid'], ['awaiting', 'Awaiting payment'], ['active', 'In progress'], ['completed', 'Completed'], ['cancelled', 'Cancelled']];
  return html`${head('Orders', 'Orders become “Confirmed” only after the payment provider verifies payment.')}
  <nav class="tabs-inline">${tabs.map(([k, l]) => html`<a href="/admin/orders${k ? `?f=${k}` : ''}" aria-current="${filter === k ? 'true' : 'false'}">${l}</a>`)}</nav>
  <div class="card">${ordersTable(orders)}</div>`;
}

export function orderView({ o, s }) {
  const a = o.addressObj || {};
  return html`${head(`Order ${o.ref}`, `Placed ${prettyDateTime(o.created_at)}${o.payment_mode === 'test' ? ' · TEST ORDER' : ''}`,
    html`${pill(PAYMENT_STATUSES[o.payment_status], statusTone(o.payment_status))} ${pill(ORDER_STATUSES[o.status], statusTone(o.status))}`)}
  <div class="grid-main">
    <div>
      <div class="card"><h2>Items</h2>
        <table class="table"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Total</th></tr></thead><tbody>
        ${o.items.map(i => html`<tr><td>${i.name}<div class="muted">${i.variant_name}</div></td><td class="num">${i.quantity}</td><td class="num">${formatEGP(i.unit_price)}</td><td class="num">${formatEGP(i.unit_price * i.quantity)}</td></tr>`)}
        <tr><td colspan="3">Delivery ${o.delivery_area_name ? `— ${o.delivery_area_name}` : '(collection)'}</td><td class="num">${formatEGP(o.delivery_fee)}</td></tr>
        <tr><td colspan="3"><strong>Total</strong></td><td class="num"><strong>${formatEGP(o.total)}</strong></td></tr></tbody></table>
        ${o.gift_message ? html`<h3>Gift message</h3><p><em>“${o.gift_message}”</em></p>` : ''}
        ${o.notes ? html`<h3>Customer notes</h3><p>${o.notes}</p>` : ''}
      </div>
      <div class="card"><h2>Payments</h2>${paymentsLedger(o.payments)}</div>
      <div class="card"><h2>History</h2><ul class="checklist">${o.events.map(e => html`<li class="ok"><span>${e.message}<small>${prettyDateTime(e.created_at)} · ${e.actor}</small></span></li>`)}</ul></div>
    </div>
    <div>
      <div class="card"><h2>Customer</h2>
        <dl class="kv"><dt>Name</dt><dd>${o.customer_name}</dd><dt>Phone</dt><dd><a href="tel:${o.customer_phone}">${displayPhone(o.customer_phone)}</a></dd>
        <dt>Email</dt><dd><a href="mailto:${o.customer_email}">${o.customer_email}</a></dd>
        <dt>${o.fulfilment === 'delivery' ? 'Deliver on' : 'Collect on'}</dt><dd>${prettyDate(o.requested_date)}</dd>
        ${o.fulfilment === 'delivery' ? html`<dt>Address</dt><dd>${[a.street, a.building && `Bldg ${a.building}`, a.floor && `Floor ${a.floor}`, a.apartment && `Apt ${a.apartment}`].filter(Boolean).join(', ')}<br>${[a.district, o.delivery_area_name].filter(Boolean).join(', ')}${a.landmark ? html`<br><span class="muted">Near ${a.landmark}</span>` : ''}</dd>` : ''}</dl>
      </div>
      <form class="card" method="post" action="/admin/orders/${o.id}/status">${csrfField(s)}
        <h2>Fulfilment</h2>
        ${o.payment_status !== 'paid' ? html`<p class="muted">This order has not been paid. Fulfilment statuses unlock once payment is verified.</p>` : ''}
        ${selectField('status', 'Order status', Object.entries(ORDER_STATUSES).filter(([k]) => o.payment_status === 'paid' ? k !== 'awaiting_payment' : ['awaiting_payment', 'cancelled'].includes(k)), o.status)}
        ${field('note', 'Internal note (optional)', { type: 'textarea', rows: 2 })}
        ${button('Update')}
      </form>
    </div>
  </div>`;
}

function paymentsLedger(payments) {
  if (!payments.length) return html`<p class="muted">No payment attempts yet.</p>`;
  return html`<div class="table-wrap"><table class="table ledger"><thead><tr><th>Reference</th><th>Provider</th><th>Purpose</th><th>Status</th><th class="num">Amount</th></tr></thead><tbody>
  ${payments.map(p => html`<tr><td>${p.merchant_reference}<div class="muted">${prettyDateTime(p.updated_at)}</div>${p.detail ? html`<div class="muted">${p.detail}</div>` : ''}</td>
  <td>${p.provider}${p.mode === 'test' ? ' (test)' : ''}${p.provider_txn_id ? html`<div class="muted">txn ${p.provider_txn_id}</div>` : ''}</td>
  <td>${p.purpose}</td><td>${pill(p.status, statusTone(p.status))}</td><td class="num">${formatEGP(p.amount)}</td></tr>`)}</tbody></table></div>`;
}

// ---- Delivery -----------------------------------------------------------------------

export function deliveryView({ areas, s }) {
  return html`${head('Delivery areas', 'Customers choose one of these at checkout. The fee is added to their total on the server.')}
  <div class="card table-wrap"><table class="table"><thead><tr><th>Area</th><th>Fee (EGP)</th><th>Extra lead time (hours)</th><th>Note</th><th>Active</th><th></th></tr></thead><tbody>
  ${areas.map(a => html`<tr><td colspan="6"><form method="post" action="/admin/delivery/${a.id}" class="actions" style="align-items:flex-end">${csrfField(s)}
    <input class="input" name="name" value="${a.name}" aria-label="Area name" style="max-width:220px">
    <input class="input" name="fee" value="${toInputEGP(a.fee)}" aria-label="Fee" inputmode="decimal" style="max-width:120px">
    <input class="input" name="extra_lead_hours" value="${a.extra_lead_hours}" type="number" min="0" aria-label="Extra lead hours" style="max-width:110px">
    <input class="input" name="notes" value="${a.notes}" aria-label="Note" style="max-width:220px">
    <label class="check"><input type="checkbox" name="active" value="1" ${raw(a.active ? 'checked' : '')}><span>Active</span></label>
    <button class="btn btn-sm">Save</button>
    <button class="btn btn-sm btn-danger" formaction="/admin/delivery/${a.id}/delete" data-confirm="Delete this area?">Delete</button>
  </form></td></tr>`)}
  </tbody></table>${!areas.length ? html`<p class="muted">No delivery areas yet — delivery is unavailable until you add one.</p>` : ''}</div>
  <form class="card" method="post" action="/admin/delivery">${csrfField(s)}<h2>Add an area</h2>
    <div class="grid-3">${field('name', 'Area name', { attrs: 'required', hint: 'e.g. New Cairo, Zamalek, Sheikh Zayed' })}${field('fee', 'Fee (EGP)', { attrs: 'required inputmode="decimal"' })}${field('extra_lead_hours', 'Extra lead time (hours)', { type: 'number', value: 0, attrs: 'min="0"' })}</div>
    ${button('Add area')}</form>`;
}

// ---- Enquiries & quotes -------------------------------------------------------------

function enquiriesTable(list) {
  if (!list.length) return html`<p class="muted">No enquiries yet.</p>`;
  return html`<div class="table-wrap"><table class="table"><thead><tr><th>Reference</th><th>Client</th><th>Event</th><th>Status</th></tr></thead><tbody>
  ${list.map(e => html`<tr><td><a href="/admin/enquiries/${e.id}">${e.ref}</a><div class="muted">${prettyDateTime(e.created_at)}</div></td>
  <td>${e.name}<div class="muted">${displayPhone(e.phone)}</div></td><td>${e.event_type}<div class="muted">${prettyDate(e.event_date)} · ${e.guest_count} guests</div></td>
  <td>${pill(ENQUIRY_STATUSES[e.status], statusTone(e.status))}</td></tr>`)}</tbody></table></div>`;
}

export function enquiriesView({ list, filter }) {
  const tabs = [['', 'All'], ['new', 'New'], ['open', 'Quoted / accepted'], ['confirmed', 'Confirmed'], ['closed', 'Closed']];
  return html`${head('Enquiries & quotes', 'An event is confirmed only once a quote is accepted and its payment received.')}
  <nav class="tabs-inline">${tabs.map(([k, l]) => html`<a href="/admin/enquiries${k ? `?f=${k}` : ''}" aria-current="${filter === k ? 'true' : 'false'}">${l}</a>`)}</nav>
  <div class="card">${enquiriesTable(list)}</div>`;
}

export function enquiryView({ e, quote, link, s }) {
  return html`${head(`${e.name} — ${e.event_type}`, `${e.ref} · received ${prettyDateTime(e.created_at)}`, pill(ENQUIRY_STATUSES[e.status], statusTone(e.status)))}
  <div class="grid-main">
    <div>
      <div class="card"><h2>The request</h2>
        <dl class="kv"><dt>Event</dt><dd>${e.event_type} on ${prettyDate(e.event_date)}</dd><dt>Venue</dt><dd>${e.venue}</dd><dt>Guests</dt><dd>${e.guest_count}</dd>
        <dt>Services</dt><dd>${e.servicesList.join(', ')}</dd><dt>Budget</dt><dd>${e.budget || '—'}</dd>
        <dt>Contact</dt><dd>${displayPhone(e.phone)} · <a href="mailto:${e.email}">${e.email}</a></dd></dl>
        ${e.styling ? html`<h3>Styling & requests</h3><p style="white-space:pre-wrap">${e.styling}</p>` : ''}
        ${e.files.length ? html`<h3>Inspiration</h3><div class="img-list">${e.files.map(f => html`<a class="img-item" href="/admin/files/${f.id}" target="_blank"><img src="/admin/files/${f.id}" alt="${f.original_name}" loading="lazy"></a>`)}</div>` : ''}
      </div>
      ${quote ? quoteEditor({ e, q: quote, link, s }) : html`<div class="card"><h2>Quote</h2><p class="muted">Prepare an itemised quote with an expiry date, terms and a deposit or full-payment option.</p>
        ${postButton(s, `/admin/enquiries/${e.id}/quotes`, 'Prepare a quote')}</div>`}
      ${e.quotes.length > 1 ? html`<div class="card"><h2>Earlier quotes</h2><ul>${e.quotes.slice(1).map(q => html`<li>${q.ref} — ${QUOTE_STATUSES[q.status]} — ${formatEGP(q.total)}</li>`)}</ul></div>` : ''}
    </div>
    <div>
      <form class="card" method="post" action="/admin/enquiries/${e.id}">${csrfField(s)}<h2>Status & notes</h2>
        ${selectField('status', 'Status', Object.entries(ENQUIRY_STATUSES).filter(([k]) => k !== 'confirmed' || e.status === 'confirmed' || e.status === 'completed'), e.status,
          '“Confirmed” is set automatically when the deposit or full payment is received.')}
        ${field('internal_notes', 'Internal notes', { type: 'textarea', value: e.internal_notes, rows: 5 })}
        ${button('Save')}</form>
      ${quote && quote.status !== 'draft' ? html`<div class="card"><h2>Balance</h2>
        <dl class="kv"><dt>Total</dt><dd>${formatEGP(quote.total)}</dd>${quote.payment_option === 'deposit' ? html`<dt>Deposit</dt><dd>${formatEGP(quote.deposit_amount)} (${quote.deposit_percent}%)</dd>` : ''}
        <dt>Paid</dt><dd>${formatEGP(quote.amount_paid)}</dd><dt>Balance</dt><dd><strong>${formatEGP(quote.balance)}</strong></dd></dl>
        ${['accepted', 'paid_deposit'].includes(quote.status) ? html`<form method="post" action="/admin/quotes/${quote.id}/manual-payment" style="margin-top:16px">${csrfField(s)}
          <h3>Record an offline payment</h3><p class="muted">Cash, bank transfer or InstaPay received directly.</p>
          ${field('amount', 'Amount (EGP)', { attrs: 'required inputmode="decimal"', id: 'mp-amount' })}${field('note', 'Reference / note', { attrs: 'required', id: 'mp-note' })}
          <button class="btn btn-sm" data-confirm="Record this payment as received?">Record payment</button></form>` : ''}
      </div>` : ''}
    </div>
  </div>`;
}

function quoteEditor({ e, q, link, s }) {
  const problems = quoteProblems(q);
  const rows = q.items.length ? q.items : [{ description: '', quantity: 1, unit_price: null }];
  return html`<div class="card" id="quote"><h2>Quote ${q.ref} ${pill(QUOTE_STATUSES[q.status], statusTone(q.status))}</h2>
    ${q.status !== 'draft' && link ? html`<h3>Private link</h3><div class="copy-row"><input class="input" readonly value="${link}" aria-label="Private quote link" data-copy-source>
      <button class="btn btn-sm btn-ghost" type="button" data-copy>Copy</button></div>
      <p class="muted">Anyone with this link can view and pay the quote. Re-issuing creates a new link and disables the old one.</p>` : ''}
    ${q.editable ? html`<form method="post" action="/admin/quotes/${q.id}" data-quote-form>${csrfField(s)}
      ${field('intro', 'Personal note to the client', { type: 'textarea', value: q.intro, rows: 3 })}
      <h3>Line items</h3>
      <div class="quote-rows" data-quote-rows>
        <div class="q-row q-head"><span>Description</span><span>Qty</span><span>Unit price (EGP)</span><span></span></div>
        ${[...rows, ...Array(q.items.length ? 0 : 2).fill({ description: '', quantity: 1, unit_price: null })].map(r => html`<div class="q-row" data-row>
          <input class="input" name="item_description" value="${r.description}" aria-label="Description">
          <input class="input" name="item_quantity" value="${r.quantity}" type="number" min="1" aria-label="Quantity">
          <input class="input" name="item_price" value="${toInputEGP(r.unit_price)}" inputmode="decimal" aria-label="Unit price">
          <button class="remove-row" type="button" data-remove-row aria-label="Remove line">×</button></div>`)}
      </div>
      <button class="btn btn-sm btn-ghost" type="button" data-add-row>Add line</button>
      <div class="grid-2" style="margin-top:16px">
        ${field('discount', 'Discount (EGP)', { value: toInputEGP(q.discount) || '', attrs: 'inputmode="decimal"' })}
        ${field('expires_at', 'Valid until', { type: 'date', value: q.expires_at || '' })}
      </div>
      <div class="grid-2">
        ${selectField('payment_option', 'Payment required to confirm', [['deposit', 'Deposit'], ['full', 'Full payment']], q.payment_option)}
        ${field('deposit_percent', 'Deposit %', { type: 'number', value: q.deposit_percent, attrs: 'min="1" max="100"' })}
      </div>
      ${checkbox('allow_online_balance', 'Let the client pay the remaining balance online after the deposit', q.allow_online_balance)}
      ${field('terms', 'Terms', { type: 'textarea', value: q.terms, rows: 6, hint: 'Shown on the quote. Simple formatting: ## heading, - list, **bold**.' })}
      <p><strong>Total ${formatEGP(q.total)}</strong>${q.payment_option === 'deposit' ? ` · deposit ${formatEGP(q.deposit_amount)}` : ''} <span class="muted">(updates when saved)</span></p>
      <div class="actions"><button class="btn btn-sm">Save quote</button>
        ${q.status === 'draft' ? html`<button class="btn btn-sm" formaction="/admin/quotes/${q.id}/send" ${raw(problems.length ? 'disabled' : '')} data-confirm="Send this quote to ${e.email}?">Save & send to client</button>` : html`<button class="btn btn-sm" formaction="/admin/quotes/${q.id}/send" data-confirm="Re-issue the link and email it to ${e.email}? The old link will stop working.">Save & re-send</button>`}
      </div>
      ${problems.length ? html`<p class="muted" style="margin-top:10px">Before sending: ${problems.join(' ')}</p>` : ''}
    </form>` : html`
      <table class="table"><tbody>${q.items.map(i => html`<tr><td>${i.description}</td><td class="num">${i.quantity} × ${formatEGP(i.unit_price)}</td><td class="num">${formatEGP(i.unit_price * i.quantity)}</td></tr>`)}
      <tr><td colspan="2"><strong>Total</strong></td><td class="num"><strong>${formatEGP(q.total)}</strong></td></tr></tbody></table>
      <p class="muted">Accepted by ${q.accepted_name} on ${prettyDateTime(q.accepted_at)}. Accepted quotes are locked.</p>`}
    ${q.payments.length ? html`<h3>Payments</h3>${paymentsLedger(q.payments)}` : ''}
    ${['draft', 'sent', 'expired'].includes(q.status) ? html`<div style="margin-top:14px">${postButton(s, `/admin/quotes/${q.id}/withdraw`, 'Withdraw quote', { variant: 'danger', confirm: 'Withdraw this quote? The link will show it as withdrawn.' })}</div>` : ''}
    ${['withdrawn', 'expired'].includes(q.status) ? html`<div style="margin-top:14px">${postButton(s, `/admin/enquiries/${e.id}/quotes`, 'Prepare a new quote')}</div>` : ''}
  </div>`;
}

// ---- Content ------------------------------------------------------------------------

export function contentView({ site, home, catering, store, quotes, s }) {
  const f = (scope, key, label, opts = {}) => field(`${scope}.${key}`, label, { value: ({ site, home, catering, store, quotes })[scope][key], ...opts });
  return html`${head('Homepage & contact', 'Edit the words on the website. Changes appear immediately.')}
  <form method="post" action="/admin/content">${csrfField(s)}
  <div class="grid-2">
    <div class="card"><h2>Contact & social</h2>
      ${f('site', 'phone', 'Phone (shown in footer)', { hint: 'e.g. +20 10 1234 5678' })}
      ${f('site', 'whatsapp', 'WhatsApp number', { hint: 'International format, e.g. 201012345678' })}
      ${f('site', 'email', 'Public email')}
      ${f('site', 'instagram', 'Instagram handle or URL')}${f('site', 'tiktok', 'TikTok handle or URL')}${f('site', 'facebook', 'Facebook page or URL')}
      ${f('site', 'hours', 'Hours / response times')}
      ${f('site', 'city', 'City / country line')}
      ${f('site', 'notifyEmail', 'Team notification email', { hint: 'New paid orders and enquiries are sent here.' })}
      ${f('site', 'collectionAddress', 'Collection address', { hint: 'Required to offer collection.' })}
      ${f('site', 'collectionNotes', 'Collection notes', { type: 'textarea', rows: 2 })}
      ${f('site', 'announcement', 'Announcement bar (optional)')}
      ${f('site', 'tagline', 'Tagline')}
    </div>
    <div>
      <div class="card"><h2>Ordering</h2>
        ${checkbox('store.orderingOpen', 'Online ordering is open', store.orderingOpen)}
        ${f('store', 'maxAdvanceDays', 'How far ahead customers can order (days)', { type: 'number', attrs: 'min="1" max="365"' })}
        ${f('store', 'deliveryNote', 'Delivery note on product pages', { type: 'textarea', rows: 2 })}
      </div>
      <div class="card"><h2>Quote defaults</h2>
        ${f('quotes', 'defaultDepositPercent', 'Default deposit %', { type: 'number', attrs: 'min="1" max="100"' })}
        ${f('quotes', 'validityDays', 'Quotes valid for (days)', { type: 'number', attrs: 'min="1" max="120"' })}
        ${f('quotes', 'defaultTerms', 'Default quote terms', { type: 'textarea', rows: 6, hint: 'Pre-filled on new quotes. To be defined by the business.' })}
      </div>
    </div>
  </div>
  <div class="card"><h2>Homepage</h2><div class="grid-2">
    <div>${f('home', 'heroEyebrow', 'Opening — small line')}${f('home', 'heroTitle', 'Opening — headline', { type: 'textarea', rows: 2, hint: 'Use a new line for the italic second line.' })}${f('home', 'heroIntro', 'Opening — introduction', { type: 'textarea', rows: 2 })}
      ${f('home', 'detailEyebrow', 'Details — small line')}${f('home', 'detailTitle', 'Details — headline')}${f('home', 'detailBody', 'Details — text', { type: 'textarea', rows: 3 })}</div>
    <div>${f('home', 'giftingEyebrow', 'Gifting — small line')}${f('home', 'giftingTitle', 'Gifting — headline')}${f('home', 'giftingBody', 'Gifting — text', { type: 'textarea', rows: 3 })}
      ${f('home', 'cateringEyebrow', 'Catering — small line')}${f('home', 'cateringTitle', 'Catering — headline')}${f('home', 'cateringBody', 'Catering — text', { type: 'textarea', rows: 3 })}
      ${f('home', 'storyEyebrow', 'Story — small line')}${f('home', 'storyTitle', 'Story — headline')}${f('home', 'storyBody', 'Story — text', { type: 'textarea', rows: 6 })}</div>
  </div></div>
  <div class="card"><h2>Catering page</h2><div class="grid-2">
    <div>${f('catering', 'intro', 'Introduction', { type: 'textarea', rows: 3 })}
      ${field('catering.services', 'Services (one per line: Name | description)', { type: 'textarea', rows: 5, value: catering.services.map(x => `${x.name} | ${x.body}`).join('\n'), hint: 'Only list services the business offers.' })}</div>
    <div>${field('catering.eventTypes', 'Event types (one per line)', { type: 'textarea', rows: 5, value: catering.eventTypes.join('\n') })}
      ${field('catering.budgetRanges', 'Budget ranges (one per line)', { type: 'textarea', rows: 5, value: catering.budgetRanges.join('\n') })}
      ${f('catering', 'minNoticeDays', 'Recommended notice (days)', { type: 'number', attrs: 'min="0" max="365"' })}</div>
  </div></div>
  <div style="position:sticky;bottom:16px">${button('Save all changes')}</div>
  </form>`;
}

export function pagesView({ pages }) {
  return html`${head('Policy pages', 'Delivery, refunds, privacy and terms. Pages marked for review contain placeholders the business must complete before launch.')}
  <div class="card"><table class="table"><thead><tr><th>Page</th><th>Status</th><th>Updated</th></tr></thead><tbody>
  ${pages.map(p => html`<tr><td><a href="/admin/pages/${p.slug}">${p.title}</a><div class="muted">/pages/${p.slug}</div></td><td>${p.needs_review ? pill('Needs review before launch', 'warn') : pill('Reviewed', 'ok')}</td><td>${prettyDateTime(p.updated_at)}</td></tr>`)}
  </tbody></table></div>`;
}

export function pageEditView({ page, s }) {
  return html`${head(page.title, html`<a href="/pages/${page.slug}" target="_blank">View page ↗</a>`)}
  <form class="card" method="post" action="/admin/pages/${page.slug}">${csrfField(s)}
    ${field('title', 'Title', { value: page.title })}
    ${field('body', 'Content', { type: 'textarea', value: page.body, rows: 22, hint: 'Formatting: ## Heading · - list item · **bold** · [link](https://…) · a line starting with > is shown as a highlighted note.' })}
    ${checkbox('reviewed', 'This page has been reviewed and approved for launch', !page.needs_review)}
    ${button('Save page')}
  </form>`;
}

// ---- Settings -----------------------------------------------------------------------

export function settingsView({ payment, providers, channel, outbox, webhookUrl }) {
  return html`${head('Payments & notifications', 'Credentials are read from the server environment and never shown or stored in the database.')}
  <div class="grid-2">
    <div class="card"><h2>Payment gateway</h2>
      <dl class="kv"><dt>Provider</dt><dd>${payment.label} (${payment.provider})</dd><dt>Mode</dt><dd>${payment.mode === 'live' ? pill('Live', 'ok') : pill('Test', 'warn')}</dd>
      <dt>Status</dt><dd>${payment.ready ? pill('Ready', 'ok') : pill('Not ready', 'bad')}</dd><dt>Webhook URL</dt><dd><span class="kbd">${webhookUrl}</span></dd></dl>
      ${payment.missing.length ? html`<h3>Missing settings</h3><ul>${payment.missing.map(m => html`<li><span class="kbd">${m}</span></li>`)}</ul>` : ''}
      ${payment.problems.length ? html`<h3>Problems</h3><ul>${payment.problems.map(m => html`<li>${m}</li>`)}</ul>` : ''}
      <h3>To go live with Paymob</h3>
      <ol class="muted" style="padding-left:18px">
        <li>In the Paymob dashboard, copy the <strong>live</strong> secret key, public key, HMAC secret and the integration IDs for each payment method.</li>
        <li>Set them on the server: <span class="kbd">PAYMENT_PROVIDER=paymob</span> <span class="kbd">PAYMENT_MODE=live</span> <span class="kbd">PAYMOB_SECRET_KEY</span> <span class="kbd">PAYMOB_PUBLIC_KEY</span> <span class="kbd">PAYMOB_HMAC_SECRET</span> <span class="kbd">PAYMOB_INTEGRATION_IDS</span>, and <span class="kbd">BASE_URL</span> to the https address.</li>
        <li>Set the transaction processed callback in Paymob to the webhook URL above.</li>
        <li>Restart the server, place one small live order, confirm it shows as Paid here, then refund it from Paymob.</li>
      </ol>
      <p class="muted">Available providers: ${providers.map(p => p.label).join(', ')}.</p>
    </div>
    <div class="card"><h2>Notifications</h2>
      <p>Channel: ${channel === 'smtp' ? pill('Email (SMTP)', 'ok') : pill('Logged only — set SMTP_URL to send email', 'warn')}</p>
      <div class="table-wrap"><table class="table"><thead><tr><th>To</th><th>Subject</th><th>Status</th></tr></thead><tbody>
      ${outbox.map(m => html`<tr><td>${m.recipient}<div class="muted">${prettyDateTime(m.created_at)}</div></td><td><span>${m.subject}</span><details><summary class="muted">Message</summary><pre style="white-space:pre-wrap;font-size:12px">${m.body}</pre></details></td><td>${pill(m.status, m.status === 'sent' ? 'ok' : m.status === 'failed' ? 'bad' : '')}${m.error ? html`<div class="muted">${m.error}</div>` : ''}</td></tr>`)}
      </tbody></table></div>
    </div>
  </div>`;
}

export function usersView({ admins, s }) {
  return html`${head('Team & password')}
  <div class="grid-2">
    <form class="card" method="post" action="/admin/users/password">${csrfField(s)}<h2>Change your password</h2>
      ${field('current', 'Current password', { type: 'password', attrs: 'autocomplete="current-password" required' })}
      ${field('password', 'New password', { type: 'password', attrs: 'autocomplete="new-password" minlength="12" required', hint: 'At least 12 characters. Signs out other sessions.' })}
      ${button('Update password')}</form>
    <div class="card"><h2>Team</h2>
      <table class="table"><tbody>${admins.map(a => html`<tr><td>${a.name || a.email}<div class="muted">${a.email}</div></td><td>${a.role}</td><td class="muted">${a.last_login_at ? prettyDateTime(a.last_login_at) : 'Never signed in'}</td>
        <td>${s.role === 'owner' && a.id !== s.id ? postButton(s, `/admin/users/${a.id}/delete`, 'Remove', { variant: 'danger', confirm: 'Remove this team member?' }) : ''}</td></tr>`)}</tbody></table>
      ${s.role === 'owner' ? html`<form method="post" action="/admin/users" style="margin-top:18px">${csrfField(s)}<h3>Add a team member</h3>
        ${field('name', 'Name')}${field('email', 'Email', { type: 'email', attrs: 'required' })}${field('password', 'Temporary password', { type: 'password', attrs: 'minlength="12" required autocomplete="new-password"' })}
        ${selectField('role', 'Role', [['staff', 'Staff — orders, products, enquiries'], ['owner', 'Owner — everything, including team']], 'staff')}
        ${button('Add')}</form>` : ''}
    </div>
  </div>`;
}
