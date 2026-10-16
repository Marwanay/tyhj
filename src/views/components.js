// Reusable view components. All return escaped HTML (Raw) via the html`` tag.
import { html, raw, cx, escape } from '../lib/html.js';
import { formatEGP } from '../lib/money.js';
import { config } from '../config.js';
import { SITE_MEDIA } from './media.js';
import { WORDMARK, MONOGRAM, STACKED } from './brand.js';

export { SITE_MEDIA };
const titled = (s, label) => s.replace('<svg ', `<svg role="img" aria-label="${escape(label)}" `);

export const wordmark = (label = 'Cocoa Caramel') => raw(titled(WORDMARK, label));
export const logoStacked = (label = 'Cocoa Caramel') => raw(titled(STACKED, label));
export const monogram = (cls = '') => html`<span class=${raw(`"monogram ${cls}"`)} aria-hidden="true">${raw(MONOGRAM.replace('<svg ', '<svg focusable="false" '))}</span>`;

export const arrow = raw('<svg class="arrow" viewBox="0 0 18 8" fill="none" stroke="currentColor" aria-hidden="true"><path d="M0 4h17M13.5.5 17 4l-3.5 3.5"/></svg>');
export const lockIcon = raw('<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><rect x="2.5" y="7" width="11" height="7.5" rx="1"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>');
export const clockIcon = raw('<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><path d="M8 4v4l2.5 1.5"/></svg>');
export const giftIcon = raw('<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><rect x="2" y="6" width="12" height="8.5"/><path d="M1.5 6h13M8 6v8.5M8 6S6.5 1.5 4.5 2.5 6 6 8 6Zm0 0s1.5-4.5 3.5-3.5S10 6 8 6Z"/></svg>');
export const truckIcon = raw('<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="M1 3.5h9v8H1zM10 6h3l2 2.5v3h-5"/><circle cx="4" cy="12.5" r="1.5"/><circle cx="12" cy="12.5" r="1.5"/></svg>');
export const zoomIcon = raw('<svg viewBox="0 0 16 16" width="14" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="7" cy="7" r="5"/><path d="m11 11 4 4M7 4.5v5M4.5 7h5"/></svg>');

/**
 * Responsive <picture> for an entry in media.json or a product image row.
 * @param {{media_key?:string,key?:string,widths:number[],width:number,height:number,alt?:string,placeholder?:string}} img
 */
/** URL of one rendered variant: build-time images live in /media, admin uploads in /m. */
export function mediaUrl(img, width, ext = 'jpg') {
  return `${img.source === 'db' ? '/m/' : '/media/'}${img.media_key || img.key}-${width}.${ext}`;
}

export function picture(img, { sizes = '100vw', alt, eager = false, cls = '' } = {}) {
  if (!img) return html`<div class=${raw(`"frame ${cls}"`)}></div>`;
  const srcset = (ext) => img.widths.map(w => `${mediaUrl(img, w, ext)} ${w}w`).join(', ');
  const largest = img.widths.at(-1);
  return html`<picture>
    <source type="image/avif" srcset="${srcset('avif')}" sizes="${sizes}">
    <source type="image/webp" srcset="${srcset('webp')}" sizes="${sizes}">
    <img src="${mediaUrl(img, largest)}" srcset="${srcset('jpg')}" sizes="${sizes}"
      width="${img.width}" height="${img.height}" alt="${alt ?? img.alt ?? ''}"
      ${raw(eager ? 'fetchpriority="high"' : 'loading="lazy"')} decoding="async">
  </picture>`;
}

export const site = (key) => ({ ...SITE_MEDIA[key], key });

export function framed(img, { mount = false, reveal = true, cls = '', style = '', ...opts } = {}) {
  const ph = img?.placeholder ? `--ph:${img.placeholder}` : '';
  return html`<div class="${cx('frame', mount && 'mount', reveal && 'reveal-img', cls)}" style="${[ph, style].filter(Boolean).join(';')}">${picture(img, opts)}</div>`;
}

export function button(label, { href, type = 'submit', variant = '', withArrow = false, attrs = '', cls = '' } = {}) {
  const c = cx('btn', variant && `btn-${variant}`, cls);
  return href
    ? html`<a class="${c}" href="${href}" ${raw(attrs)}>${label}${withArrow ? arrow : ''}</a>`
    : html`<button class="${c}" type="${type}" ${raw(attrs)}>${label}${withArrow ? arrow : ''}</button>`;
}

export const price = (p) => (p === null || p === undefined ? html`<span class="price-tbc">Price to be announced</span>` : html`<span class="price">${formatEGP(p)}</span>`);

export const eyebrow = (text, cls = '') => html`<p class="${cx('eyebrow', cls)}">${text}</p>`;

/** Multi-line title: "\n" separates lines; the second line is set in italics. */
export function titleLines(text) {
  return String(text).split('\n').map((l, i) => html`<span class="line">${i ? html`<em>${l}</em>` : l}</span>`);
}

// ---- Form fields ----------------------------------------------------------------

function fieldWrap(name, label, control, { errors = {}, hint, optional, cls = '' } = {}) {
  const err = errors[name];
  return html`<div class="${cx('field', err && 'has-error', cls)}">
    <label for="f-${name}">${label}${optional ? html` <span class="opt">(optional)</span>` : ''}</label>
    ${hint ? html`<p class="hint" id="h-${name}">${hint}</p>` : ''}
    ${control}
    ${err ? html`<p class="error" id="e-${name}">${err}</p>` : ''}
  </div>`;
}

const describedBy = (name, errors, hint) => [hint && `h-${name}`, errors?.[name] && `e-${name}`].filter(Boolean).join(' ');

export function input(name, label, { value = '', type = 'text', errors = {}, hint, optional, autocomplete, inputmode, required = !optional, attrs = '', cls } = {}) {
  const db = describedBy(name, errors, hint);
  return fieldWrap(name, label, html`<input class="input" id="f-${name}" name="${name}" type="${type}" value="${value ?? ''}"
    ${raw(required ? 'required' : '')} ${autocomplete ? raw(`autocomplete="${escape(autocomplete)}"`) : ''}
    ${inputmode ? raw(`inputmode="${escape(inputmode)}"`) : ''} ${db ? raw(`aria-describedby="${db}"`) : ''}
    ${errors[name] ? raw('aria-invalid="true"') : ''} ${raw(attrs)}>`, { errors, hint, optional, cls });
}

export function textarea(name, label, { value = '', errors = {}, hint, optional = true, maxlength, rows = 4 } = {}) {
  const db = describedBy(name, errors, hint);
  return fieldWrap(name, label, html`<textarea class="input" id="f-${name}" name="${name}" rows="${rows}"
    ${maxlength ? raw(`maxlength="${maxlength}"`) : ''} ${db ? raw(`aria-describedby="${db}"`) : ''}
    ${errors[name] ? raw('aria-invalid="true"') : ''} ${raw(optional ? '' : 'required')}>${value}</textarea>`, { errors, hint, optional });
}

export function select(name, label, options, { value = '', errors = {}, hint, optional, placeholder = 'Please choose' } = {}) {
  const db = describedBy(name, errors, hint);
  return fieldWrap(name, label, html`<select class="input" id="f-${name}" name="${name}" ${raw(optional ? '' : 'required')}
    ${db ? raw(`aria-describedby="${db}"`) : ''} ${errors[name] ? raw('aria-invalid="true"') : ''}>
    <option value="">${placeholder}</option>
    ${options.map(o => html`<option value="${o.value}" ${raw(String(o.value) === String(value) ? 'selected' : '')}>${o.label}</option>`)}
  </select>`, { errors, hint, optional });
}

export function errorSummary(errors, labels = {}) {
  const keys = Object.keys(errors || {});
  if (!keys.length) return '';
  return html`<div class="form-errors" role="alert" tabindex="-1" data-focus-on-load>
    <h2>Please check ${keys.length === 1 ? 'one detail' : `${keys.length} details`}</h2>
    <ul>${keys.map(k => html`<li><a href="#f-${k}">${errors[k]}</a></li>`)}</ul>
  </div>`;
}

export function pill(label, tone = '') {
  return html`<span class="${cx('pill', tone)}">${label}</span>`;
}

export const testRibbon = () => config.payments.mode === 'test'
  ? html`<div class="test-ribbon" role="note">Test mode — payments are simulated and no money is taken</div>` : '';
