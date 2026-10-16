import { html, raw, cx, paragraphs, markdown } from '../lib/html.js';
import { formatEGP } from '../lib/money.js';
import { prettyDate, cairoDate, addDays } from '../lib/dates.js';
import { config } from '../config.js';
import { layout } from './layout.js';
import { site, framed, button, eyebrow, monogram, input, textarea, select, errorSummary, pill, lockIcon } from './components.js';
import { getSetting } from '../services/content.js';
import { QUOTE_STATUSES } from '../services/quotes.js';

// ---- Catering consultation ----------------------------------------------------------

export function cateringPage({ values = {}, errors = {}, cartCount }) {
  const c = getSetting('catering');
  const v = { services: [], ...values };
  const step = (n, title, sub, content, last = false) => html`
    <fieldset class="${cx('form-step', n === 1 && 'is-current', last && 'is-last')}" data-step="${n}" aria-labelledby="step-${n}-title">
      <div class="progress-label"><span class="label">Step ${n} of 4</span><span class="numeral">${['I', 'II', 'III', 'IV'][n - 1]}</span></div>
      <legend class="visually-hidden">${title}</legend>
      <h3 id="step-${n}-title">${title}</h3>
      <p class="fine">${sub}</p>
      ${content}
      ${last ? '' : html`<div class="step-actions step-nav">
        ${n > 1 ? html`<button class="btn btn-ghost" type="button" data-prev>Back</button>` : html`<span></span>`}
        <button class="btn" type="button" data-next>Continue</button>
      </div>`}
    </fieldset>`;

  const body = html`
<section class="on-plum consult-hero">
  <div class="wrap consult-grid">
    <div class="copy">
      ${eyebrow('Catering & private events', 'reveal')}
      <h1 class="reveal d1">A private <em>consultation.</em></h1>
      <p class="lede reveal d2" style="max-width:24em">${c.intro}</p>
      <div class="reveal d3" style="margin-top:32px">${button('Begin your enquiry', { href: '#enquire', withArrow: true })}</div>
    </div>
    <div class="art">${framed(site('site-table-tray'), { mount: true, sizes: '(max-width: 960px) 70vw, 30vw', eager: true, style: 'aspect-ratio:3/4' })}</div>
  </div>
</section>

<section class="section">
  <div class="wrap">
    <div class="catering-grid" style="align-items:start">
      <div class="catering-head" style="grid-column:1 / span 5">
        ${eyebrow('What we prepare')}
        <h2 style="font-size:clamp(40px,5vw,72px);color:var(--plum);margin-top:20px">For engagements, weddings, birthdays & corporate occasions.</h2>
      </div>
      <ul class="services" style="grid-column:7 / span 6">
        ${c.services.map(s => html`<li><strong>${s.name}</strong><span>${s.body}</span></li>`)}
      </ul>
    </div>
  </div>
</section>

<section class="section on-blush" style="padding-block:clamp(56px,8vw,112px)">
  <div class="wrap">
    ${eyebrow('How it works')}
    <ol class="process" style="padding:0;margin:40px 0 0">
      <li><span class="numeral">i.</span><h3>Tell us about it</h3><p>Share your date, venue, guest count and the mood you have in mind. It takes a few minutes.</p></li>
      <li><span class="numeral">ii.</span><h3>We prepare a proposal</h3><p>Our team reviews availability and sends an itemised quote to review privately online.</p></li>
      <li><span class="numeral">iii.</span><h3>Accept & reserve</h3><p>Your date is reserved once you accept the quote and the required payment is received.</p></li>
    </ol>
  </div>
</section>

<section class="section" id="enquire" aria-labelledby="enquire-title">
  <div class="wrap enquiry">
    <div class="enquiry-aside">
      ${eyebrow('Request a quote')}
      <h2 id="enquire-title">Tell us about your occasion.</h2>
      <p class="measure">Availability and pricing are confirmed after our team reviews your request. Submitting this form does not book your date.</p>
      ${monogram()}
    </div>
    <form class="form-card" method="post" action="/catering" enctype="multipart/form-data" novalidate data-steps-form>
      <div class="progress" aria-hidden="true">${[1, 2, 3, 4].map(n => html`<span class="${n === 1 ? 'current' : ''}" data-progress="${n}"></span>`)}</div>
      ${errorSummary(errors)}
      ${step(1, 'The occasion', 'What are we celebrating, and when?', html`
        <fieldset class="field ${errors.event_type ? 'has-error' : ''}" id="f-event_type">
          <legend class="flabel">Event type</legend>
          <div class="choice-grid">
            ${c.eventTypes.map(t => html`<label class="choice"><input type="radio" name="event_type" value="${t}" ${raw(v.eventType === t ? 'checked' : '')} required><span class="c-title">${t}</span></label>`)}
          </div>
          ${errors.event_type ? html`<p class="error">${errors.event_type}</p>` : ''}
        </fieldset>
        ${input('event_date', 'Event date', { type: 'date', value: v.eventDate, errors, attrs: `min="${cairoDate()}"`, hint: c.minNoticeDays ? `We recommend at least ${c.minNoticeDays} days' notice. For sooner dates, we will do our best.` : '' })}`)}
      ${step(2, 'The details', 'Where, and for how many?', html`
        ${input('venue', 'Venue or location', { value: v.venue, errors, hint: 'Venue name, or the area if it is at home.' })}
        ${input('guests', 'Approximate guest count', { type: 'number', value: v.guests, errors, inputmode: 'numeric', attrs: 'min="1" max="5000"' })}
        <fieldset class="field ${errors.services ? 'has-error' : ''}" id="f-services">
          <legend class="flabel">Service required</legend>
          <div class="choice-grid">
            ${c.services.map(s => html`<label class="choice"><input type="checkbox" name="services" value="${s.name}" ${raw(v.services.includes(s.name) ? 'checked' : '')}>
              <span><span class="c-title">${s.name}</span><span class="c-sub">${s.body}</span></span></label>`)}
          </div>
          ${errors.services ? html`<p class="error">${errors.services}</p>` : ''}
        </fieldset>
        ${select('budget', 'Budget range', c.budgetRanges.map(b => ({ value: b, label: b })), { value: v.budget, errors, optional: true, placeholder: 'Prefer not to say' })}`)}
      ${step(3, 'Your style', 'Colours, themes, flavours and anything we should know.', html`
        ${textarea('styling', 'Styling preferences & special requests', { value: v.styling, errors, rows: 5, maxlength: 2000, hint: 'Colour palette, theme, dietary needs, allergies, timings…' })}
        <div class="field">
          <span class="flabel">Inspiration images <span class="opt">(optional, up to 6)</span></span>
          <label class="dropzone" data-dropzone>
            <input type="file" name="inspiration" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple data-file-input>
            <span class="label">Choose images</span><br><span class="fine">or drag them here · JPG, PNG, WebP, HEIC · up to 8 MB each</span>
          </label>
          <div class="previews" data-previews></div>
        </div>`)}
      ${step(4, 'Your contact', 'How should we reach you with your proposal?', html`
        ${input('name', 'Full name', { value: v.name, errors, autocomplete: 'name' })}
        ${input('phone', 'Mobile number', { value: values.phoneRaw ?? v.phone, type: 'tel', errors, autocomplete: 'tel', inputmode: 'tel', hint: 'Egyptian mobile, e.g. 010 1234 5678' })}
        ${input('email', 'Email', { value: v.email, type: 'email', errors, autocomplete: 'email' })}
        <p class="fine">We use these details only to respond to your enquiry. See our <a href="/pages/privacy">privacy policy</a>.</p>`, true)}
      <div class="step-actions final-submit">
        <button class="btn btn-ghost step-nav" type="button" data-prev>Back</button>
        ${button('Request a Quote', { withArrow: true, attrs: 'data-busy-on-submit' })}
      </div>
    </form>
  </div>
</section>`;
  return layout({ title: 'Catering & Private Events', body, page: 'catering', cartCount, canonical: '/catering',
    description: 'Dessert tables, chocolate trays and gifting for engagements, weddings, birthdays and corporate events in Egypt. Request a quote.' });
}

export function enquiryThanksPage({ enquiry: e, shortNotice, cartCount }) {
  const body = html`<div class="wrap status-hero" style="padding-bottom:clamp(72px,10vw,140px)">
    ${monogram()}
    <p class="ref">Reference ${e.ref}</p>
    <h1>Thank you, ${e.name.split(' ')[0]}.</h1>
    <p class="lede" style="max-width:28em;margin:0 auto 20px">We have received your enquiry for your ${e.event_type.toLowerCase()} on ${prettyDate(e.event_date)}.</p>
    <p style="max-width:34em;margin:0 auto">Our team will review availability and contact you with a proposal. <strong>Your date is not reserved yet</strong> — pricing and availability will be confirmed in your quote, and your booking is confirmed once the quote is accepted and payment is received.</p>
    ${shortNotice ? html`<p class="notice" style="max-width:34em;margin:24px auto 0">Your event is soon — we will be in touch as quickly as we can.</p>` : ''}
    <p class="fine" style="margin-top:28px">A copy of your reference has been sent to ${e.email}.</p>
    <div style="margin-top:32px">${button('Return home', { href: '/', variant: 'ghost' })}</div>
  </div>`;
  return layout({ title: 'Enquiry received', body, cartCount, noindex: true });
}

// ---- Private quote ------------------------------------------------------------------

export function quotePage({ quote: q, enquiry: e, token, error, notice, providerReady, returned, cancelled }) {
  const terms = q.terms ? markdown(q.terms) : '';
  const isOpen = q.status === 'sent' && !q.isExpired;
  const waiting = returned && !cancelled && q.payments[0] && ['created', 'pending'].includes(q.payments[0].status);
  const statusTone = { paid_deposit: 'ok', paid_in_full: 'ok', accepted: 'warn', sent: 'info', expired: 'bad', withdrawn: 'bad' }[q.status] || 'info';
  const body = html`
<div class="wrap" style="padding-block:clamp(32px,6vw,88px)">
  <article class="proposal" ${raw(waiting ? `data-poll="/q/${encodeURIComponent(token)}/status" data-poll-state="${q.status}:${q.amount_paid}"` : '')} aria-live="polite">
    <header class="proposal-head">
      ${monogram()}
      ${eyebrow('A proposal for', 'plain')}
      <h1>${e.name}</h1>
      <p class="fine">${e.event_type} · ${prettyDate(e.event_date)} · ${e.venue} · ${e.guest_count} guests</p>
      <p style="margin-top:14px">${pill(q.isExpired ? 'Expired' : QUOTE_STATUSES[q.status], q.isExpired ? 'bad' : statusTone)} <span class="fine">Ref ${q.ref}</span></p>
    </header>
    ${config.payments.mode === 'test' && q.due > 0 ? html`<p class="notice test"><strong>Test mode.</strong> Payments on this page are simulated.</p>` : ''}
    ${error ? html`<p class="notice" role="alert">${error}</p>` : ''}
    ${notice ? html`<p class="notice" role="status">${notice}</p>` : ''}
    ${waiting ? html`<p class="notice" role="status">We are confirming your payment with the provider. This page will update automatically.</p>` : ''}
    ${q.intro ? paragraphs(q.intro) : ''}
    <table class="items">
      <thead><tr><th>Item</th><th class="num hide-sm">Qty</th><th class="num hide-sm">Unit</th><th class="num">Amount</th></tr></thead>
      <tbody>${q.items.map(i => html`<tr><td>${i.description}</td><td class="num hide-sm">${i.quantity}</td><td class="num hide-sm">${formatEGP(i.unit_price)}</td><td class="num">${formatEGP(i.unit_price * i.quantity)}</td></tr>`)}</tbody>
      <tfoot>
        <tr><td colspan="3">Subtotal</td><td class="num">${formatEGP(q.subtotal)}</td></tr>
        ${q.discount ? html`<tr><td colspan="3">Discount</td><td class="num">− ${formatEGP(q.discount)}</td></tr>` : ''}
        <tr class="grand"><td colspan="3">Total</td><td class="num">${formatEGP(q.total)}</td></tr>
        ${q.payment_option === 'deposit' ? html`<tr><td colspan="3">Deposit to reserve your date (${q.deposit_percent}%)</td><td class="num">${formatEGP(q.deposit_amount)}</td></tr>` : ''}
        ${q.amount_paid ? html`<tr><td colspan="3">Paid</td><td class="num">${formatEGP(q.amount_paid)}</td></tr>
          <tr><td colspan="3"><strong>Remaining balance</strong></td><td class="num"><strong>${formatEGP(q.balance)}</strong></td></tr>` : ''}
      </tfoot>
    </table>
    ${q.expires_at && ['sent', 'expired'].includes(q.status) ? html`<p class="fine">This proposal is valid until ${prettyDate(q.expires_at)}.</p>` : ''}
    ${terms ? html`<h2 style="font-size:26px;color:var(--plum);margin:32px 0 12px">Terms</h2><div class="terms-box" tabindex="0">${terms}</div>` : ''}

    <div style="margin-top:36px;padding-top:28px;border-top:1px solid var(--rule)">
      ${isOpen ? html`<form method="post" action="/q/${token}/accept" novalidate>
          <h2 style="font-size:28px;color:var(--plum);margin-bottom:16px">Accept this proposal</h2>
          ${input('accepted_name', 'Type your full name to accept', { value: '', autocomplete: 'name' })}
          <label class="check" style="margin-bottom:20px"><input type="checkbox" name="agree" required><span>I accept this proposal and its terms.${q.payment_option === 'deposit' ? ` I understand my date is reserved once the deposit of ${formatEGP(q.deposit_amount)} is paid.` : ` I understand my date is reserved once payment of ${formatEGP(q.total)} is received.`}</span></label>
          ${button('Accept proposal', { withArrow: true })}
        </form>`
      : q.isExpired || q.status === 'expired' ? html`<p>This proposal has expired. Please contact us and we will be happy to prepare an updated one.</p>`
      : q.status === 'withdrawn' ? html`<p>This proposal has been withdrawn. Please contact us for details.</p>`
      : q.due > 0 && !waiting ? html`
          ${q.status === 'accepted' ? html`<p>Accepted by ${q.accepted_name}. ${q.duePurpose === 'deposit' ? 'Pay the deposit to reserve your date.' : 'Complete payment to reserve your date.'}</p>` : html`<p>Your date is reserved. You can settle the remaining balance online whenever you are ready.</p>`}
          ${providerReady ? html`<form method="post" action="/q/${token}/pay">
            ${button(`Pay ${q.duePurpose === 'deposit' ? 'deposit' : q.duePurpose === 'balance' ? 'balance' : ''} ${formatEGP(q.due)} securely`.replace('  ', ' '), { withArrow: true, attrs: 'data-busy-on-submit' })}
          </form>
          <p class="secure-note">${lockIcon}<span>Payment is completed on our provider's secure page. We never see or store your card details.</span></p>`
          : html`<p class="notice">Online payment is not available right now. Please contact us to arrange payment, quoting ${q.ref}.</p>`}`
      : q.status === 'paid_in_full' ? html`<p class="lede">Thank you — your booking is paid in full. We look forward to your ${e.event_type.toLowerCase()}.</p>`
      : q.status === 'paid_deposit' ? html`<p class="lede">Thank you — your deposit is received and your date is reserved.</p><p>Remaining balance: ${formatEGP(q.balance)}. We will be in touch about the final details.</p>`
      : ''}
    </div>
  </article>
</div>`;
  return layout({ title: `Proposal ${q.ref}`, body, noindex: true });
}

// ---- Policy & misc pages ------------------------------------------------------------

export function contentPage({ page, cartCount }) {
  const body = html`<header class="wrap page-head">${eyebrow('Information')}<h1>${page.title}</h1></header>
  <div class="wrap"><div class="prose">${markdown(page.body)}</div></div>`;
  return layout({ title: page.title, body, cartCount, canonical: `/pages/${page.slug}` });
}

export function messagePage({ title, message, status = '', cartCount, action }) {
  const body = html`<div class="wrap empty-state">
    ${monogram()}
    ${status ? html`<p class="label">${status}</p>` : ''}
    <h1>${title}</h1>
    <p class="lede" style="max-width:26em;margin:0 auto 32px">${message}</p>
    ${action || button('Return home', { href: '/', variant: 'ghost' })}
  </div>`;
  return layout({ title, body, cartCount, noindex: true });
}

// ---- Sandbox gateway (test mode only) ---------------------------------------------

export function sandboxGatewayPage({ payment, label, done }) {
  return html`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Test payment — sandbox</title><link rel="stylesheet" href="/css/site.css"></head>
<body style="background:#eee9e6">
<div class="test-ribbon">Sandbox gateway — test mode only — no real payment</div>
<main class="wrap" style="max-width:520px;padding-block:48px">
  <div class="form-card">
    <p class="label">Simulated hosted checkout</p>
    <h1 style="font-family:var(--font-body);font-size:24px;font-weight:600;margin:12px 0 4px">${label}</h1>
    <p class="fine">Reference ${payment.merchant_reference}</p>
    <p style="font-size:32px;font-weight:600;margin:20px 0">${formatEGP(payment.amount)}</p>
    ${done ? html`<p class="notice">This test payment has already been completed (${payment.status}).</p>` : html`
    <p class="fine" style="margin-bottom:20px">Choose how the bank responds. Each option sends an HMAC-signed callback to the store's webhook, exactly as the live gateway would, then returns you to the store.</p>
    <form method="post" style="display:grid;gap:10px">
      <button class="btn" name="outcome" value="paid">Approve payment</button>
      <button class="btn btn-ghost" name="outcome" value="failed">Decline (card declined)</button>
      <button class="btn btn-ghost" name="outcome" value="pending">Leave pending (bank processing)</button>
      <button class="btn btn-ghost" name="outcome" value="cancel">Cancel and return to store</button>
    </form>`}
  </div>
</main></body></html>`;
}
