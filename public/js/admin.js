(() => {
  'use strict';
  document.querySelectorAll('input[type=file][name=images]').forEach(i => window.ccResizeInput && window.ccResizeInput(i, { max: 2400, quality: 0.92 }));
  // Confirmation for destructive or outward-facing actions.
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-confirm]');
    if (el && el.tagName === 'BUTTON' && !confirm(el.dataset.confirm)) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (f.dataset.confirm && !(e.submitter && e.submitter.dataset.confirm) && !confirm(f.dataset.confirm)) e.preventDefault();
  });
  // Copy private links.
  document.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', async () => {
    const src = b.parentElement.querySelector('[data-copy-source]');
    try { await navigator.clipboard.writeText(src.value); b.textContent = 'Copied'; } catch { src.select(); }
    setTimeout(() => { b.textContent = 'Copy'; }, 1800);
  }));
  // Quote line items.
  const rows = document.querySelector('[data-quote-rows]');
  if (rows) {
    document.querySelector('[data-add-row]').addEventListener('click', () => {
      const tpl = rows.querySelector('[data-row]');
      const row = tpl.cloneNode(true);
      row.querySelectorAll('input').forEach(i => { i.value = i.name === 'item_quantity' ? '1' : ''; });
      rows.appendChild(row); row.querySelector('input').focus();
    });
    rows.addEventListener('click', (e) => {
      if (!e.target.closest('[data-remove-row]')) return;
      const all = rows.querySelectorAll('[data-row]');
      const row = e.target.closest('[data-row]');
      if (all.length > 1) row.remove(); else row.querySelectorAll('input').forEach(i => { i.value = i.name === 'item_quantity' ? '1' : ''; });
    });
  }
})();
