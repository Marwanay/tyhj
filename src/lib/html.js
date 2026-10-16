// Tiny, safe HTML templating: every interpolation is escaped unless wrapped in raw().
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escape = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s ?? ''));

function render(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return escape(v);
}

/** Tagged template: html`<p>${userText}</p>` → Raw (escaped). */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return new Raw(out);
}

/** Build a class attribute value from a map of conditions. */
export const cx = (...parts) => parts.flat().filter(Boolean).join(' ');

/** Plain text with blank-line paragraphs and single line breaks. */
export function paragraphs(text, cls = '') {
  const blocks = String(text || '').trim().split(/\n\s*\n/).filter(Boolean);
  return raw(blocks.map(b => `<p${cls ? ` class="${cls}"` : ''}>${escape(b).replace(/\n/g, '<br>')}</p>`).join(''));
}

/**
 * Minimal, safe markdown for editable policy pages: #/## headings, - lists,
 * **bold**, [link](url) and paragraphs. HTML in the source is escaped.
 */
export function markdown(src) {
  const inline = (s) => escape(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[(.+?)\]\(((?:https?:\/\/|\/|mailto:|tel:)[^)\s]+)\)/g, '<a href="$2">$1</a>');
  const out = [];
  for (const block of String(src || '').replace(/\r/g, '').split(/\n\s*\n/)) {
    const lines = block.split('\n').filter(l => l.trim());
    if (!lines.length) continue;
    if (lines.every(l => /^\s*[-*] /.test(l))) {
      out.push('<ul>' + lines.map(l => `<li>${inline(l.replace(/^\s*[-*] /, ''))}</li>`).join('') + '</ul>');
    } else if (/^### /.test(lines[0])) out.push(`<h4>${inline(lines[0].slice(4))}</h4>`);
    else if (/^## /.test(lines[0])) out.push(`<h3>${inline(lines[0].slice(3))}</h3>`);
    else if (/^# /.test(lines[0])) out.push(`<h2>${inline(lines[0].slice(2))}</h2>`);
    else if (/^> /.test(lines[0])) out.push(`<aside class="flag">${inline(lines.map(l => l.replace(/^> ?/, '')).join(' '))}</aside>`);
    else out.push(`<p>${lines.map(inline).join('<br>')}</p>`);
  }
  return raw(out.join('\n'));
}
