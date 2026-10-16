// Build Your Dessert Table — interactive configurator.
// One authoritative state model (`design`): which dessert sits on which surface, and how much.
// Surfaces and dessert display rules come from the server (#tb-config) in normalised table
// coordinates, so overlays, hit areas and the server-side preview always line up.
(() => {
  const cfgEl = document.getElementById('tb-config');
  if (!cfgEl) return;
  const CFG = JSON.parse(cfgEl.textContent);
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ZONES = new Map(CFG.zones.map(z => [z.id, z]));
  const PRODUCTS = new Map(CFG.products.map(p => [p.id, p]));
  const STORE = 'cc.table.current', DESIGNS = 'cc.table.designs';
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: keep working in memory */ } },
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const pct = (n) => `${(n * 100).toFixed(3)}%`;
  const uid = () => Math.random().toString(36).slice(2, 10);
  const fmt = (n, unit) => unit === 'kg' ? `${n} kg` : `${n} ${n === 1 ? (unit === 'piece' ? 'piece' : unit) : (unit === 'piece' ? 'pieces' : unit + 's')}`;
  const isTouch = matchMedia('(max-width: 960px)').matches || matchMedia('(pointer: coarse)').matches;

  // ---- State -------------------------------------------------------------------------------
  const blank = () => { const now = new Date().toISOString(); return { id: uid(), name: '', items: [], created: now, modified: now }; };
  function normalize(d) {
    if (!d || !Array.isArray(d.items)) return null;
    const seen = new Set();
    d.items = d.items.filter(it => {
      const z = ZONES.get(it.zone), p = PRODUCTS.get(it.id);
      if (!z || !p || !p.accepts.includes(z.kind) || seen.has(it.zone)) return false;
      seen.add(it.zone);
      const q = Number(it.qty);
      it.qty = q > 0 ? Math.min(p.max, Math.round(q / p.step) * p.step) || p.step : p.step;
      return true;
    });
    d.id ||= uid();
    return d;
  }
  let design = normalize(store.get(STORE, null)) || blank();
  let mode = null;      // { type: 'place', productId, fromZone? } | { type: 'filter', zone } | { type: 'replace', zone }
  let popZone = null;
  const itemAt = (zoneId) => design.items.find(i => i.zone === zoneId);
  const save = () => { design.modified = new Date().toISOString(); store.set(STORE, design); };

  // ---- Elements ----------------------------------------------------------------------------
  const intro = $('[data-tb-intro]'), app = $('[data-tb-app]');
  const stage = $('[data-tb-stage]'), viewport = $('[data-tb-viewport]'), layer = $('[data-tb-items]');
  const zoneBtns = $$('[data-tb-zone]');
  const statusEl = $('[data-tb-status]'), countEl = $('[data-tb-count]');
  const pop = $('[data-tb-pop]'), menuEl = $('[data-tb-menu]');
  const cards = $$('[data-tb-card]');
  const btnAuto = $('[data-tb-place-auto]'), btnCancel = $('[data-tb-cancel]');
  const status = (msg) => { statusEl.textContent = msg; };

  // ---- Placement engine ----------------------------------------------------------------------
  /** Compatible surfaces for a dessert: free ones, and taken ones it could replace. */
  function targetsFor(productId, except) {
    const p = PRODUCTS.get(productId), free = [], taken = [];
    for (const z of CFG.zones) {
      if (!p.accepts.includes(z.kind) || z.id === except) continue;
      (itemAt(z.id) ? taken : free).push(z.id);
    }
    return { free, taken };
  }

  function place(productId, zoneId) {
    const p = PRODUCTS.get(productId);
    design.items.push({ zone: zoneId, id: productId, qty: p.step });
    endMode();
    commit(`${p.label} is on your table.`);
    pulse(zoneId);
  }
  function replaceAt(zoneId, productId) {
    const it = itemAt(zoneId), p = PRODUCTS.get(productId);
    if (!it || !p.accepts.includes(ZONES.get(zoneId).kind)) return;
    const prev = PRODUCTS.get(it.id);
    it.id = productId;
    if (prev.unit !== p.unit) it.qty = p.step;
    endMode();
    commit(`${prev.label} was replaced with ${p.label}.`);
  }
  function moveTo(fromZone, toZone) {
    const it = itemAt(fromZone);
    if (!it) return;
    it.zone = toZone;
    endMode();
    commit(`${PRODUCTS.get(it.id).label} moved to the ${ZONES.get(toZone).label.toLowerCase()}.`);
    pulse(toZone);
  }
  function remove(zoneId) {
    const it = itemAt(zoneId);
    if (!it) return;
    design.items = design.items.filter(i => i !== it);
    closePop();
    commit(`${PRODUCTS.get(it.id).label} was removed.`);
  }

  function add(productId) {
    const p = PRODUCTS.get(productId);
    if (mode?.type === 'replace') return replaceAt(mode.zone, productId);
    if (mode?.type === 'filter') {
      const z = ZONES.get(mode.zone);
      if (p.accepts.includes(z.kind) && !itemAt(z.id)) return place(productId, z.id);
    }
    closePop();
    const { free, taken } = targetsFor(productId);
    if (free.length === 1) { closeDrawer(); return place(productId, free[0]); }
    if (!free.length && !taken.length) return status(`${p.label} can't be served on this table.`);
    mode = { type: 'place', productId, replaceOnly: !free.length };
    status(free.length
      ? `Where shall we serve the ${p.label}? Tap a glowing spot — or let us place it.`
      : `Every suitable spot is taken — tap a glowing one to swap in the ${p.label}, or remove a dessert first.`);
    btnAuto.hidden = !free.length; btnCancel.hidden = false;
    closeDrawer();
    render();
  }
  function endMode() {
    mode = null;
    btnAuto.hidden = true; btnCancel.hidden = true;
    menuEl.classList.remove('is-filtered');
    $('[data-tb-filter-note]').hidden = true;
    filterCards();
  }

  // ---- Rendering -----------------------------------------------------------------------------
  /** Mirrors placementBox() in src/services/table.js. */
  function box(z, d) {
    const kindFit = z.kind === 'platter-sm' ? 1.05 : 1;
    if (d.mode === 'cutout') {
      const cap = d.aspect && d.maxH ? z.h * d.maxH * d.aspect * (1024 / 1536) : Infinity;
      const width = Math.min(z.w * d.fit * kindFit, cap);
      return { left: z.x - width / 2, bottom: z.y + (z.h / 2) * d.lift, width };
    }
    const f = d.mode === 'card' ? 0.8 : (d.fit || 0.9);
    return { left: z.x - (z.w * f) / 2, top: z.y - (z.h * f) / 2, width: z.w * f, height: z.h * f };
  }
  const glassSVG = ([a, b, c]) => `<svg viewBox="0 0 40 56" aria-hidden="true">` +
    `<path d="M9.3 34h21.4l-1 14.2a3 3 0 0 1-3 2.8H13.3a3 3 0 0 1-3-2.8z" fill="${a}"/><path d="M8.4 22h23.2l-.9 12H9.3z" fill="${b}"/>` +
    `<path d="M7.8 14h24.4l-.6 8H8.4z" fill="${a}" opacity=".85"/><circle cx="16" cy="12.5" r="3.4" fill="${c}"/><circle cx="23" cy="11.5" r="2.6" fill="${c}" opacity=".85"/>` +
    `<path d="M6 4h28l-3.1 44.3A4 4 0 0 1 26.9 52H13.1a4 4 0 0 1-4-3.7z" fill="rgb(255 255 255 / .18)" stroke="rgb(255 255 255 / .95)" stroke-width="1.3"/>` +
    `<path d="M10.5 9l1.6 36" stroke="#fff" stroke-opacity=".6" stroke-width="1.6" stroke-linecap="round"/></svg>`;

  function itemEl(it, { animate = true } = {}) {
    const p = PRODUCTS.get(it.id), z = ZONES.get(it.zone), d = p.display, b = box(z, d);
    const el = document.createElement('div');
    el.className = `tb-item mode-${d.mode} shape-${z.shape}${animate && !reduceMotion ? ' is-entering' : ''}`;
    el.dataset.zone = z.id; el.dataset.id = p.id;
    el.style.left = pct(b.left); el.style.width = pct(b.width);
    el.style.zIndex = String(Math.round(z.y * 1000));
    if (d.mode === 'cutout') {
      el.style.top = pct(b.bottom);
      el.innerHTML = `<div class="tb-item-in"><img src="${esc(d.src)}" alt="" draggable="false"></div>`;
    } else {
      el.style.top = pct(b.top); el.style.height = pct(b.height);
      const inner = d.mode === 'fill' ? `<img src="${esc(d.src)}" alt="" draggable="false">`
        : d.mode === 'glass' ? `<span class="tb-glasses">${glassSVG(d.colors).repeat(3)}</span>`
        : `<span class="tb-place-card"><span class="tb-place-name">${esc(p.name)}</span>${p.variant ? `<span class="tb-place-variant">${esc(p.variant)}</span>` : ''}</span>`;
      el.innerHTML = `<div class="tb-item-in">${inner}</div>`;
    }
    if (animate && !reduceMotion) setTimeout(() => el.classList.remove('is-entering'), 600);
    return el;
  }

  const shown = new Map(); // zone → { el, id }
  function renderItems() {
    const want = new Map(design.items.map(i => [i.zone, i]));
    for (const [zone, s] of shown) {
      const it = want.get(zone);
      if (!it || it.id !== s.id) {   // removed, moved away or replaced: fade out
        shown.delete(zone);
        s.el.classList.add('is-leaving');
        setTimeout(() => s.el.remove(), reduceMotion ? 0 : 320);
      }
    }
    for (const it of design.items) {
      if (shown.has(it.zone)) continue;
      const el = itemEl(it);
      layer.appendChild(el);
      shown.set(it.zone, { el, id: it.id });
    }
  }

  function render() {
    const targets = mode?.type === 'place' ? targetsFor(mode.productId, mode.fromZone) : null;
    for (const btn of zoneBtns) {
      const z = ZONES.get(btn.dataset.tbZone), it = itemAt(z.id);
      const isTarget = !!targets && (mode.replaceOnly ? targets.taken : targets.free).includes(z.id);
      btn.classList.toggle('is-filled', !!it);
      btn.classList.toggle('is-target', isTarget);
      btn.classList.toggle('is-dim', !!mode && !isTarget && mode.type === 'place');
      btn.classList.toggle('is-selected', popZone === z.id || (mode?.type !== 'place' && mode?.zone === z.id));
      btn.setAttribute('aria-label', it
        ? `${z.label} — ${PRODUCTS.get(it.id).label}, ${fmt(it.qty, PRODUCTS.get(it.id).unit)}`
        : `${z.label} — empty${isTarget ? ', available' : ''}`);
    }
    renderItems();
    const n = design.items.length;
    countEl.textContent = n ? `${n} ${n === 1 ? 'dessert' : 'desserts'} on your table` : 'Your table is empty';
    $$('[data-tb-review], [data-tb-quote]').forEach(b => { b.disabled = !n; });
    app.classList.toggle('is-placing', mode?.type === 'place');
  }
  function commit(msg) { save(); render(); if (msg) status(msg); }
  function pulse(zoneId) {
    const btn = zoneBtns.find(b => b.dataset.tbZone === zoneId);
    if (!btn || reduceMotion) return;
    btn.classList.remove('is-pulse'); void btn.offsetWidth; btn.classList.add('is-pulse');
  }

  // ---- Menu ----------------------------------------------------------------------------------
  let cat = '', query = '';
  function filterCards() {
    const zone = mode && mode.type !== 'place' ? ZONES.get(mode.zone) : null;
    for (const card of cards) {
      const ids = card.dataset.ids.split(' ');
      const fits = !zone || ids.some(id => PRODUCTS.get(id).accepts.includes(zone.kind));
      const match = (!cat || card.dataset.category === cat) && (!query || card.dataset.search.includes(query));
      card.hidden = !(match && fits);
    }
  }
  function showZoneMenu(zoneId, type) {
    const z = ZONES.get(zoneId);
    mode = { type, zone: zoneId };
    menuEl.classList.add('is-filtered');
    const note = $('[data-tb-filter-note]');
    note.hidden = false;
    note.innerHTML = `Showing desserts for the <strong>${esc(z.label.toLowerCase())}</strong>. <button type="button" class="tb-link" data-tb-clear-filter>Show all</button>`;
    btnCancel.hidden = false;
    status(type === 'replace' ? `Choose a dessert to replace the ${PRODUCTS.get(itemAt(zoneId).id).label}.` : `Choose a dessert for the ${z.label.toLowerCase()}.`);
    filterCards();
    render();
    openDrawer();
  }

  menuEl.addEventListener('click', (e) => {
    const c = e.target.closest('[data-tb-cat]');
    if (c) {
      cat = c.dataset.tbCat;
      $$('[data-tb-cat]', menuEl).forEach(b => b.setAttribute('aria-pressed', String(b === c)));
      return filterCards();
    }
    const v = e.target.closest('[data-tb-variant]');
    if (v) {
      const card = v.closest('[data-tb-card]');
      $$('[data-tb-variant]', card).forEach(b => b.setAttribute('aria-pressed', String(b === v)));
      const addBtn = $('[data-tb-add]', card);
      addBtn.dataset.tbAdd = v.dataset.tbVariant;
      addBtn.setAttribute('aria-label', `Add ${PRODUCTS.get(v.dataset.tbVariant).label} to the table`);
      return;
    }
    if (e.target.closest('[data-tb-clear-filter]')) { endMode(); status('Choose a dessert from the menu.'); return render(); }
    const a = e.target.closest('[data-tb-add]');
    if (a) add(a.dataset.tbAdd);
  });
  $('[data-tb-search]').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); filterCards(); });

  // Mobile: the menu is a bottom drawer.
  const drawerBtn = $('[data-tb-drawer]');
  function openDrawer() { if (!isTouch) return; menuEl.classList.add('is-open'); drawerBtn.setAttribute('aria-expanded', 'true'); }
  function closeDrawer() { menuEl.classList.remove('is-open'); drawerBtn.setAttribute('aria-expanded', 'false'); }
  drawerBtn.addEventListener('click', () => (menuEl.classList.contains('is-open') ? closeDrawer() : openDrawer()));

  // ---- Surfaces: tap to place, select or browse ----------------------------------------------
  stage.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tb-zone]');
    if (!btn) return;
    const zoneId = btn.dataset.tbZone;
    if (mode?.type === 'place') {
      const t = targetsFor(mode.productId, mode.fromZone);
      if (mode.fromZone && t.free.includes(zoneId)) return moveTo(mode.fromZone, zoneId);
      if (!mode.replaceOnly && t.free.includes(zoneId)) return place(mode.productId, zoneId);
      if (mode.replaceOnly && t.taken.includes(zoneId)) return replaceAt(zoneId, mode.productId);
      return status(`The ${ZONES.get(zoneId).label.toLowerCase()} isn't suitable — choose a highlighted spot.`);
    }
    if (itemAt(zoneId)) return openPop(zoneId, btn);
    showZoneMenu(zoneId, 'filter');
  });

  function openPop(zoneId, anchor) {
    const it = itemAt(zoneId), p = PRODUCTS.get(it.id), z = ZONES.get(zoneId);
    popZone = zoneId;
    endMode();
    const siblings = CFG.products.filter(x => x.category === p.category && x.name === p.name && x.variant && x.accepts.includes(z.kind));
    $('[data-tb-pop-kind]').textContent = z.label;
    $('[data-tb-pop-title]').textContent = p.name;
    $('[data-tb-pop-body]').innerHTML =
      (siblings.length > 1 ? `<div class="tb-variants" role="group" aria-label="Options">${siblings.map(s =>
        `<button type="button" class="tb-variant" data-pop-variant="${s.id}" aria-pressed="${s.id === p.id}">${esc(s.variant)}</button>`).join('')}</div>` : '') +
      (p.desc ? `<p class="tb-pop-desc">${esc(p.desc)}</p>` : '') +
      `<div class="tb-qty"><span class="label">Quantity</span><span class="mi-qty">` +
      `<button type="button" class="mi-btn" data-pop-qty="-1" aria-label="Less">−</button><output data-pop-out>${esc(fmt(it.qty, p.unit))}</output>` +
      `<button type="button" class="mi-btn" data-menu-inc data-pop-qty="1" aria-label="More">+</button></span></div>` +
      `<div class="tb-pop-actions"><button type="button" class="tb-tool" data-pop-move>Move</button>` +
      `<button type="button" class="tb-tool" data-pop-replace>Replace</button><button type="button" class="tb-tool is-danger" data-pop-remove>Remove</button></div>`;
    pop.hidden = false;
    positionPop(anchor);
    render();
    $('button', pop).focus({ preventScroll: true });
  }
  function positionPop(anchor) {
    if (isTouch) { pop.style.left = ''; pop.style.top = ''; return; }   // bottom sheet on phones
    // The popover is positioned within the app section (position: relative).
    const r = anchor.getBoundingClientRect(), host = app.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    let left = r.left + r.width / 2 - w / 2 - host.left, top = r.bottom + 10 - host.top;
    if (r.bottom + 10 + h > innerHeight) top = r.top - h - 10 - host.top;
    pop.style.left = `${Math.max(8, Math.min(host.width - w - 8, left))}px`;
    pop.style.top = `${Math.max(8, top)}px`;
  }
  function closePop() { pop.hidden = true; popZone = null; }
  pop.addEventListener('click', (e) => {
    const zoneId = popZone, it = itemAt(zoneId);
    if (e.target.closest('[data-tb-pop-close]')) { closePop(); return render(); }
    if (!it) return;
    const p = PRODUCTS.get(it.id);
    const q = e.target.closest('[data-pop-qty]');
    if (q) {
      it.qty = Math.max(p.step, Math.min(p.max, Math.round((it.qty + Number(q.dataset.popQty) * p.step) / p.step) * p.step));
      $('[data-pop-out]', pop).textContent = fmt(it.qty, p.unit);
      return commit();
    }
    const v = e.target.closest('[data-pop-variant]');
    if (v && v.dataset.popVariant !== it.id) {
      replaceAt(zoneId, v.dataset.popVariant);
      return openPop(zoneId, zoneBtns.find(b => b.dataset.tbZone === zoneId));
    }
    if (e.target.closest('[data-pop-remove]')) return remove(zoneId);
    if (e.target.closest('[data-pop-replace]')) { closePop(); return showZoneMenu(zoneId, 'replace'); }
    if (e.target.closest('[data-pop-move]')) {
      const t = targetsFor(it.id, zoneId);
      closePop();
      if (!t.free.length) return status(`There's no other free spot for the ${p.label} — remove a dessert to make room.`);
      mode = { type: 'place', productId: it.id, fromZone: zoneId };
      btnCancel.hidden = false;
      status(`Tap a highlighted spot to move the ${p.label}.`);
      return render();
    }
  });

  btnCancel.addEventListener('click', () => { endMode(); closePop(); status('Choose a dessert from the menu.'); render(); });
  btnAuto.addEventListener('click', () => {
    if (mode?.type !== 'place') return;
    const t = targetsFor(mode.productId, mode.fromZone);
    if (t.free.length) mode.fromZone ? moveTo(mode.fromZone, t.free[0]) : place(mode.productId, t.free[0]);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!pop.hidden) { closePop(); render(); } else if (mode) { endMode(); status('Choose a dessert from the menu.'); render(); }
  });

  $('[data-tb-reset]').addEventListener('click', () => {
    if (!design.items.length || !confirm('Clear every dessert from the table?')) return;
    design.items = []; closePop(); endMode();
    commit('Your table is clear — choose a dessert to begin again.');
  });

  // ---- Zoom & pan (pinch, drag, double-tap, ctrl+wheel) ---------------------------------------
  const view = { scale: 1, x: 0, y: 0 };
  const pointers = new Map();
  let gesture = null, moved = 0, lastTap = { t: 0, x: 0, y: 0 };
  function applyView() {
    const vw = viewport.clientWidth, vh = viewport.clientHeight;
    view.scale = Math.max(1, Math.min(3, view.scale));
    view.x = Math.min(0, Math.max(vw - vw * view.scale, view.x));
    view.y = Math.min(0, Math.max(vh - vh * view.scale, view.y));
    stage.style.transform = view.scale === 1 ? '' : `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    viewport.classList.toggle('is-zoomed', view.scale > 1);
  }
  function zoomAt(scale, cx, cy) {
    const r = viewport.getBoundingClientRect(), px = cx - r.left, py = cy - r.top;
    const k = Math.max(1, Math.min(3, scale)) / view.scale;
    view.x = px - (px - view.x) * k; view.y = py - (py - view.y) * k; view.scale *= k;
    applyView();
  }
  viewport.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) { moved = 0; gesture = { type: 'pan', x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale };
    }
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture?.type === 'pinch' && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      zoomAt(gesture.scale * Math.hypot(a.x - b.x, a.y - b.y) / gesture.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
      moved = 99;
    } else if (gesture?.type === 'pan' && view.scale > 1) {
      moved = Math.max(moved, Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y));
      view.x = gesture.vx + e.clientX - gesture.x; view.y = gesture.vy + e.clientY - gesture.y;
      applyView();
    }
  });
  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      if (e.type === 'pointerup' && moved < 8 && e.pointerType === 'touch') {   // double-tap to zoom in / out
        const now = Date.now();
        if (now - lastTap.t < 300 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
          zoomAt(view.scale > 1 ? 1 : 2, e.clientX, e.clientY); moved = 99; lastTap.t = 0;
        } else lastTap = { t: now, x: e.clientX, y: e.clientY };
      }
      gesture = null;
    }
  };
  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);
  viewport.addEventListener('click', (e) => { if (moved >= 8) { e.stopPropagation(); e.preventDefault(); } moved = 0; }, true);
  viewport.addEventListener('wheel', (e) => { if (!e.ctrlKey) return; e.preventDefault(); zoomAt(view.scale * (e.deltaY < 0 ? 1.12 : 0.89), e.clientX, e.clientY); }, { passive: false });
  $('[data-tb-reset-view]').addEventListener('click', () => { view.scale = 1; view.x = 0; view.y = 0; applyView(); });
  addEventListener('resize', applyView);

  // ---- Review, save, designs, quote --------------------------------------------------------
  const reviewDlg = $('[data-tb-review-dialog]'), designsDlg = $('[data-tb-designs-dialog]');
  function renderReview() {
    const host = $('[data-tb-review-stage]');
    host.innerHTML = `<div class="tb-stage tb-stage-static"><img class="tb-table" src="${esc($('.tb-table').currentSrc || $('.tb-table').src)}" alt="Your dessert table"><div class="tb-items"></div></div>`;
    const lay = $('.tb-items', host);
    design.items.forEach(it => lay.appendChild(itemEl(it, { animate: false })));
    $('[data-tb-review-rows]').innerHTML = design.items.map(it => {
      const p = PRODUCTS.get(it.id);
      return `<tr><td>${esc(p.label)}</td><td>${esc(ZONES.get(it.zone).label)}</td>` +
        `<td class="num"><span class="mi-qty"><button type="button" class="mi-btn" data-rv-qty="-1" data-zone="${it.zone}" aria-label="Less ${esc(p.label)}">−</button>` +
        `<output>${esc(fmt(it.qty, p.unit))}</output><button type="button" class="mi-btn" data-menu-inc data-rv-qty="1" data-zone="${it.zone}" aria-label="More ${esc(p.label)}">+</button></span></td>` +
        `<td class="num"><button type="button" class="menu-remove" data-rv-remove="${it.zone}" aria-label="Remove ${esc(p.label)}">×</button></td></tr>`;
    }).join('') || `<tr><td colspan="4">Your table is empty.</td></tr>`;
  }
  reviewDlg.addEventListener('click', (e) => {
    const q = e.target.closest('[data-rv-qty]');
    if (q) {
      const it = itemAt(q.dataset.zone), p = PRODUCTS.get(it.id);
      it.qty = Math.max(p.step, Math.min(p.max, Math.round((it.qty + Number(q.dataset.rvQty) * p.step) / p.step) * p.step));
      commit(); return renderReview();
    }
    const r = e.target.closest('[data-rv-remove]');
    if (r) { remove(r.dataset.rvRemove); return renderReview(); }
  });
  $$('[data-tb-review]').forEach(b => b.addEventListener('click', () => { closePop(); renderReview(); reviewDlg.showModal(); }));

  function saveDesign() {
    const name = prompt('Name this design', design.name || 'My dessert table');
    if (name === null) return;
    design.name = name.trim().slice(0, 60) || 'My dessert table';
    save();
    const list = store.get(DESIGNS, []).filter(d => d.id !== design.id);
    list.unshift(JSON.parse(JSON.stringify(design)));
    store.set(DESIGNS, list.slice(0, 20));
    status(`“${design.name}” is saved on this device.`);
  }
  $$('[data-tb-save]').forEach(b => b.addEventListener('click', saveDesign));

  function renderDesigns() {
    const list = store.get(DESIGNS, []);
    $('[data-tb-designs-list]').innerHTML = list.length ? list.map(d =>
      `<li><div><strong>${esc(d.name)}</strong><span class="fine">${d.items.length} desserts · ${esc(new Date(d.modified).toLocaleDateString())}</span></div>` +
      `<div><button type="button" class="tb-tool" data-dz-load="${esc(d.id)}">Open</button><button type="button" class="tb-tool is-danger" data-dz-delete="${esc(d.id)}">Delete</button></div></li>`).join('')
      : '<li class="fine">No saved designs yet — use “Save my design”.</li>';
  }
  $('[data-tb-designs]').addEventListener('click', () => { renderDesigns(); designsDlg.showModal(); });
  designsDlg.addEventListener('click', (e) => {
    const load = e.target.closest('[data-dz-load]'), del = e.target.closest('[data-dz-delete]');
    if (load) {
      const d = normalize(JSON.parse(JSON.stringify(store.get(DESIGNS, []).find(x => x.id === load.dataset.dzLoad))));
      if (!d) return;
      design = d; endMode(); closePop();
      commit(`“${d.name}” is open.`);
      designsDlg.close();
    }
    if (del) {
      if (!confirm('Delete this saved design?')) return;
      store.set(DESIGNS, store.get(DESIGNS, []).filter(x => x.id !== del.dataset.dzDelete));
      renderDesigns();
    }
  });

  // The design travels to the existing quote form, which pre-fills the menu quantities and
  // attaches the design (the server renders the preview image for the team).
  $$('[data-tb-quote]').forEach(b => b.addEventListener('click', () => {
    if (!design.items.length) return;
    save();
    location.href = '/catering?design=1#enquire';
  }));

  // ---- Start --------------------------------------------------------------------------------
  function start() {
    intro.hidden = true; app.hidden = false;
    document.body.classList.add('tb-active');
    window.scrollTo({ top: 0 });
    render();
    status(design.items.length ? 'Welcome back — your table is just as you left it.' : 'Your table is set. Choose a dessert from the menu to begin.');
  }
  $('[data-tb-start]').addEventListener('click', () => { if (design.items.length && !$('[data-tb-continue]').hidden) { design = blank(); save(); } start(); });
  $('[data-tb-continue]').addEventListener('click', start);
  if (design.items.length) {
    $('[data-tb-continue]').hidden = false;
    $('[data-tb-start]').textContent = 'Start a new table';
  }
  if (location.hash === '#start') start();
})();
