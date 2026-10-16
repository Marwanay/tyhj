// Cocoa Caramel storefront — progressive enhancement only. Every flow works without JS.
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Header & menu -----------------------------------------------------------------
  const header = $('[data-header]');
  const onScroll = () => header && header.classList.toggle('is-scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  const toggle = $('[data-menu-toggle]'), menu = $('[data-mobile-menu]');
  if (toggle && menu) {
    const setOpen = (open) => {
      toggle.setAttribute('aria-expanded', String(open));
      if (open) { menu.hidden = false; requestAnimationFrame(() => menu.classList.add('is-open')); document.body.style.overflow = 'hidden'; menu.querySelector('a')?.focus(); }
      else { menu.classList.remove('is-open'); document.body.style.overflow = ''; setTimeout(() => { if (!menu.classList.contains('is-open')) menu.hidden = true; }, 450); }
    };
    toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { setOpen(false); toggle.focus(); } });
  }

  // ---- Reveal on scroll ----------------------------------------------------------------
  const revealables = $$('.reveal, .reveal-img');
  if (reduceMotion || !('IntersectionObserver' in window)) revealables.forEach(el => el.classList.add('is-in'));
  else {
    const io = new IntersectionObserver((entries) => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealables.forEach(el => io.observe(el));
  }

  // ---- Error summaries take focus ------------------------------------------------------
  const summary = $('[data-focus-on-load]');
  if (summary) summary.focus();

  // ---- Prevent double submits ------------------------------------------------------------
  $$('form').forEach(f => f.addEventListener('submit', (e) => {
    const btn = e.submitter && e.submitter.matches('[data-busy-on-submit]') ? e.submitter : f.querySelector('[data-busy-on-submit]');
    if (!btn || e.defaultPrevented) return;
    if (f.dataset.submitted) { e.preventDefault(); return; }
    f.dataset.submitted = '1';
    btn.classList.add('is-busy'); btn.setAttribute('aria-busy', 'true');
    setTimeout(() => { delete f.dataset.submitted; btn.classList.remove('is-busy'); btn.removeAttribute('aria-busy'); }, 15000);
  }));

  // ---- Quantity steppers -----------------------------------------------------------------
  $$('[data-stepper]').forEach(st => {
    const input = $('input', st);
    let timer;
    st.addEventListener('click', (e) => {
      const b = e.target.closest('[data-step]'); if (!b) return;
      const max = Number(input.max) || 99, min = Number(input.min) || 1;
      input.value = Math.max(min, Math.min(max, (Number(input.value) || 1) + Number(b.dataset.step)));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    if (st.hasAttribute('data-autosubmit')) input.addEventListener('change', () => {
      clearTimeout(timer); timer = setTimeout(() => st.closest('form').requestSubmit(), 450);
    });
  });

  // ---- Add to bag ----------------------------------------------------------------------------
  const addForm = $('[data-add-form]');
  const badge = $('[data-bag-count]'), bagLink = $('[data-bag-link]');
  let toastEl;
  function toast(html) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.innerHTML = html;
    requestAnimationFrame(() => toastEl.classList.add('is-visible'));
    clearTimeout(toastEl._t); toastEl._t = setTimeout(() => toastEl.classList.remove('is-visible'), 5200);
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  if (addForm) {
    const qty = $('input[name="quantity"]', addForm);
    const stickyPrice = $('[data-sticky-price]');
    $$('input[name="variant_id"]', addForm).forEach(r => r.addEventListener('change', () => {
      qty.max = r.dataset.max; if (Number(qty.value) > Number(qty.max)) qty.value = qty.max;
      if (stickyPrice) stickyPrice.textContent = r.dataset.price;
    }));
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('[data-add-button]', addForm);
      if (btn.classList.contains('is-busy')) return;
      btn.classList.add('is-busy');
      try {
        const res = await fetch(addForm.action, { method: 'POST', headers: { Accept: 'application/json' }, body: new URLSearchParams(new FormData(addForm)), credentials: 'same-origin' });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'Sorry, something went wrong.');
        if (badge) { badge.textContent = data.count; badge.dataset.count = data.count; badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump'); }
        if (bagLink) bagLink.setAttribute('aria-label', `Bag, ${data.count} ${data.count === 1 ? 'item' : 'items'}`);
        toast(`${data.image ? `<img src="${esc(data.image)}" alt="">` : ''}<span><strong>Added to your bag.</strong><br>${esc(data.name)} — ${esc(data.variant)}</span><a href="/bag">View bag</a>`);
      } catch (err) {
        toast(`<span>${esc(err.message)}</span>`);
      } finally { btn.classList.remove('is-busy'); }
    });

    // Mobile sticky "Add to Bag" — shown once the main button scrolls away.
    const sticky = $('[data-sticky-buy]'), mainBtn = $('[data-add-button]', addForm);
    if (sticky && mainBtn && 'IntersectionObserver' in window) {
      new IntersectionObserver(([en]) => {
        const show = !en.isIntersecting && en.boundingClientRect.top < 0;
        sticky.classList.toggle('is-visible', show);
        sticky.setAttribute('aria-hidden', String(!show));
        $('[data-sticky-add]', sticky).tabIndex = show ? 0 : -1;
      }).observe(mainBtn);
      $('[data-sticky-add]', sticky).addEventListener('click', () => addForm.requestSubmit());
    }
  }

  // ---- Gallery & zoom -----------------------------------------------------------------------
  const gallery = $('[data-gallery]');
  if (gallery) {
    const slides = $$('[data-slide]', gallery), thumbs = $$('[data-thumb]', gallery);
    let current = 0;
    const show = (i) => {
      current = (i + slides.length) % slides.length;
      slides.forEach((s, j) => s.classList.toggle('is-active', j === current));
      thumbs.forEach((t, j) => t.setAttribute('aria-current', String(j === current)));
    };
    thumbs.forEach(t => t.addEventListener('click', () => show(Number(t.dataset.thumb))));

    // Swipe between images on touch devices.
    const main = $('[data-zoom-open]', gallery);
    let sx = null;
    main.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    main.addEventListener('touchend', (e) => {
      if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) > 40 && slides.length > 1) { show(current + (dx < 0 ? 1 : -1)); main.dataset.swiped = '1'; }
    });

    const lb = $('[data-lightbox]'), stage = $('[data-lb-stage]', lb), count = $('[data-lb-count]', lb);
    const sources = $$('img', $('[data-zoom-sources]', gallery).content);
    let img, scale = 1, tx = 0, ty = 0, lastFocus, lbIndex = 0;
    const apply = () => { if (img) img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; };
    const clamp = () => {
      if (!img) return;
      const r = stage.getBoundingClientRect(), w = img.offsetWidth * scale, h = img.offsetHeight * scale;
      const bx = img.offsetLeft, by = img.offsetTop;
      const minX = Math.min(0, r.width - w - bx), maxX = Math.max(0, -bx);
      const minY = Math.min(0, r.height - h - by), maxY = Math.max(0, -by);
      if (scale <= 1) { tx = 0; ty = 0; } else { tx = Math.min(maxX, Math.max(minX, tx)); ty = Math.min(maxY, Math.max(minY, ty)); }
    };
    const zoomAt = (cx, cy, next) => {
      next = Math.max(1, Math.min(4, next));
      const r = img.getBoundingClientRect();
      const px = (cx - r.left) / scale, py = (cy - r.top) / scale;
      tx = cx - stage.getBoundingClientRect().left - img.offsetLeft - px * next;
      ty = cy - stage.getBoundingClientRect().top - img.offsetTop - py * next;
      scale = next; clamp(); apply();
    };
    const load = (i) => {
      lbIndex = (i + sources.length) % sources.length;
      stage.innerHTML = ''; img = document.createElement('img');
      img.src = sources[lbIndex].dataset.src; img.alt = sources[lbIndex].alt; img.draggable = false;
      stage.appendChild(img); scale = 1; tx = ty = 0; apply();
      count.textContent = `${lbIndex + 1} / ${sources.length}`;
    };
    const open = () => {
      if (main.dataset.swiped) { delete main.dataset.swiped; return; }
      lastFocus = document.activeElement; lb.hidden = false; lb.classList.add('is-open'); document.body.style.overflow = 'hidden';
      load(current); $('[data-lb-close]', lb).focus();
    };
    const close = () => { lb.classList.remove('is-open'); lb.hidden = true; document.body.style.overflow = ''; lastFocus && lastFocus.focus(); };
    main.addEventListener('click', open);
    $('[data-lb-close]', lb).addEventListener('click', close);
    $('[data-lb-prev]', lb).addEventListener('click', () => load(lbIndex - 1));
    $('[data-lb-next]', lb).addEventListener('click', () => load(lbIndex + 1));
    if (sources.length < 2) $$('.lb-nav', lb).forEach(b => b.hidden = true);
    lb.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') load(lbIndex + 1);
      if (e.key === 'ArrowLeft') load(lbIndex - 1);
      if (e.key === 'Tab') { const f = $$('button:not([hidden])', lb); const i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f.at(-1).focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
    });
    stage.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: false });
    stage.addEventListener('dblclick', (e) => zoomAt(e.clientX, e.clientY, scale > 1 ? 1 : 2.5));
    // Pointer pan & pinch.
    const pts = new Map(); let pinch0 = null, last = null, tapTime = 0;
    stage.addEventListener('pointerdown', (e) => { stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, e); last = { x: e.clientX, y: e.clientY };
      if (pts.size === 1 && e.pointerType === 'touch') { const now = Date.now(); if (now - tapTime < 300) zoomAt(e.clientX, e.clientY, scale > 1 ? 1 : 2.5); tapTime = now; } });
    stage.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, e);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (!pinch0) pinch0 = { d, s: scale }; else zoomAt((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2, pinch0.s * d / pinch0.d);
      } else if (scale > 1 && last) { tx += e.clientX - last.x; ty += e.clientY - last.y; clamp(); apply(); }
      last = { x: e.clientX, y: e.clientY };
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = null; last = null; };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  }

  // ---- Checkout: fulfilment & live delivery fee ------------------------------------------------
  const checkout = $('[data-checkout-form]');
  if (checkout) {
    const fees = JSON.parse($('[data-area-fees]')?.innerHTML || '{}');
    const area = $('#f-area_id'), feeEl = $('[data-fee]'), totalEl = $('[data-total]');
    const subtotalText = $$('.totals div span:last-child')[0]?.textContent || '';
    const subtotal = Number(subtotalText.replace(/[^\d.]/g, '')) * 100;
    const fmt = (p) => 'EGP ' + new Intl.NumberFormat('en-EG', { maximumFractionDigits: 2 }).format(p / 100);
    const update = () => {
      const mode = $('input[name="fulfilment"]:checked', checkout)?.value || 'delivery';
      $$('[data-when]', checkout).forEach(el => { el.hidden = el.dataset.when !== mode; });
      ['street', 'building'].forEach(n => { const i = $(`#f-${n}`); if (i) i.required = mode === 'delivery'; });
      if (area) area.required = mode === 'delivery';
      let fee = null;
      if (mode === 'collection') fee = 0; else if (area && fees[area.value]) fee = fees[area.value].fee;
      if (feeEl) feeEl.textContent = fee === null ? 'Choose your area' : fee === 0 ? 'No charge' : fmt(fee);
      if (totalEl) totalEl.textContent = fee === null ? '—' : fmt(subtotal + fee);
    };
    $$('[data-fulfilment]', checkout).forEach(r => r.addEventListener('change', update));
    area && area.addEventListener('change', update);
    update();
  }

  // ---- Catering: multi-step consultation form ---------------------------------------------------
  const stepsForm = $('[data-steps-form]');
  if (stepsForm) {
    const steps = $$('.form-step', stepsForm), bars = $$('[data-progress]', stepsForm);
    const finalBar = $('.final-submit', stepsForm);
    let idx = 0;
    const go = (i, focus = true) => {
      idx = Math.max(0, Math.min(steps.length - 1, i));
      steps.forEach((s, j) => s.classList.toggle('is-current', j === idx));
      bars.forEach((b, j) => { b.classList.toggle('done', j < idx); b.classList.toggle('current', j === idx); });
      finalBar.classList.toggle('show', idx === steps.length - 1);
      if (focus) { const h = $('h3', steps[idx]); h.tabIndex = -1; h.focus({ preventScroll: true }); stepsForm.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); }
    };
    const validStep = (s) => {
      $$('.field.js-error', s).forEach(f => { f.classList.remove('has-error', 'js-error'); f.querySelector('.error.js')?.remove(); });
      let firstBad = null;
      const mark = (el, msg) => {
        const f = el.closest('.field') || el.closest('fieldset'); if (!f) return;
        f.classList.add('has-error', 'js-error');
        const p = document.createElement('p'); p.className = 'error js'; p.textContent = msg; f.appendChild(p);
        firstBad = firstBad || el;
      };
      const radiosSeen = new Set();
      $$('input[required], select[required], textarea[required]', s).forEach(el => {
        if (el.type === 'radio') {
          if (radiosSeen.has(el.name)) return;
          radiosSeen.add(el.name);
          if (!$(`input[name="${el.name}"]:checked`, s)) mark(el, 'Please choose one.');
        } else if (!el.checkValidity()) mark(el, el.validationMessage || 'Please complete this field.');
      });
      const services = $$('input[name="services"]', s);
      if (services.length && !services.some(c => c.checked)) mark(services[0], 'Please choose at least one service.');
      if (firstBad) firstBad.focus();
      return !firstBad;
    };
    stepsForm.addEventListener('click', (e) => {
      if (e.target.closest('[data-next]')) { if (validStep(steps[idx])) go(idx + 1); }
      if (e.target.closest('[data-prev]')) go(idx - 1);
    });
    stepsForm.addEventListener('submit', (e) => {
      for (let i = 0; i < steps.length; i++) if (!validStep(steps[i])) { e.preventDefault(); go(i, false); validStep(steps[i]); return; }
    });
    // Menu picker: one category at a time, live table of everything chosen.
    const menu = $('[data-menu]', stepsForm);
    if (menu) {
      const items = $$('[data-menu-item]', menu), cats = $$('[data-menu-cat]', menu), tabs = $$('[data-menu-tab]', menu);
      const summary = $('[data-menu-summary]', menu), rows = $('[data-menu-rows]', menu), totals = $('[data-menu-totals]', menu);
      const fmt = (n, unit) => unit === 'kg' ? `${n} kg` : `${n} ${n === 1 ? (unit === 'piece' ? 'piece' : unit) : (unit === 'piece' ? 'pieces' : unit + 's')}`;
      const qtyOf = (li) => { const n = Number(String($('input', li).value).replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : 0; };
      const show = (id) => {
        cats.forEach(c => { c.hidden = c.dataset.menuCat !== id; });
        tabs.forEach(t => t.setAttribute('aria-pressed', String(t.dataset.menuTab === id)));
        const active = tabs.find(t => t.dataset.menuTab === id);
        if (active && active.parentElement.scrollWidth > active.parentElement.clientWidth) {
          const strip = active.parentElement;
          strip.scrollTo({ left: active.offsetLeft - strip.clientWidth / 2 + active.offsetWidth / 2, behavior: reduceMotion ? 'auto' : 'smooth' });
        }
      };
      const esc = (s) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

      // ---- Live dessert table: each chosen dessert pops onto a stand, tray or bowl in the photo ----
      const scene = $('[data-table-scene]', menu), layer = $('[data-scene-layer]', menu);
      const hint = $('[data-scene-hint]', menu), more = $('[data-scene-more]', menu);
      // Spots in the 1536×1024 table photo: [centre x, surface y, usable width].
      const SPOTS = {
        stand: [[795, 471, 170], [338, 482, 170], [640, 516, 160], [947, 512, 160], [1133, 512, 150], [470, 585, 190], [1090, 580, 190], [490, 512, 110], [205, 557, 100]],
        tray: [[680, 735, 190], [862, 735, 190], [667, 652, 190], [870, 652, 195], [275, 728, 160], [445, 728, 160], [1130, 738, 170], [1305, 738, 160]],
        bowl: [[390, 652, 80], [1018, 660, 72], [185, 652, 110], [1210, 652, 150], [260, 682, 60], [532, 668, 60]],
        tower: [[1240, 600, 150]],
      };
      const FALLBACK = { stand: ['tray', 'bowl'], tray: ['stand', 'bowl'], bowl: ['tray', 'stand'], tower: ['stand', 'tray'] };
      const placed = new Map(); // item id → { el, spot }
      const taken = new Set();
      const spotFor = (kind) => {
        for (const k of [kind, ...(FALLBACK[kind] || [])]) {
          const i = (SPOTS[k] || []).findIndex((_, n) => !taken.has(`${k}:${n}`));
          if (i >= 0) return { key: `${k}:${i}`, kind: k, xyw: SPOTS[k][i] };
        }
        return null;
      };
      const sparkle = (host) => {
        if (reduceMotion) return;
        for (let i = 0; i < 10; i++) {
          const s = document.createElement('i');
          s.className = 'spark';
          const a = (i / 10) * Math.PI * 2 + Math.random() * 0.5, d = 28 + Math.random() * 34;
          s.style.setProperty('--dx', `${Math.cos(a) * d}px`); s.style.setProperty('--dy', `${Math.sin(a) * d - 18}px`);
          s.style.animationDelay = `${Math.random() * 90}ms`;
          host.appendChild(s);
          setTimeout(() => s.remove(), 900);
        }
      };
      // The name card shows as a dessert lands or changes quantity, then fades so the table stays uncluttered.
      const flashCard = (p) => {
        clearTimeout(p.timer);
        p.el.classList.add('show-card');
        p.timer = setTimeout(() => p.el.classList.remove('show-card'), 2600);
      };
      // A small verrine with layered fillings, for desserts served in glasses.
      const glassSVG = ([a, b, c]) => `<svg viewBox="0 0 40 56" aria-hidden="true">` +
        `<path d="M9.3 34h21.4l-1 14.2a3 3 0 0 1-3 2.8H13.3a3 3 0 0 1-3-2.8z" fill="${a}"/>` +
        `<path d="M8.4 22h23.2l-.9 12H9.3z" fill="${b}"/>` +
        `<path d="M7.8 14h24.4l-.6 8H8.4z" fill="${a}" opacity=".85"/>` +
        `<circle cx="16" cy="12.5" r="3.4" fill="${c}"/><circle cx="23" cy="11.5" r="2.6" fill="${c}" opacity=".85"/>` +
        `<path d="M6 4h28l-3.1 44.3A4 4 0 0 1 26.9 52H13.1a4 4 0 0 1-4-3.7z" fill="rgb(255 255 255 / .18)" stroke="rgb(255 255 255 / .95)" stroke-width="1.3"/>` +
        `<path d="M10.5 9l1.6 36" stroke="#fff" stroke-opacity=".6" stroke-width="1.6" stroke-linecap="round"/></svg>`;
      const syncScene = (chosen) => {
        if (!scene) return;
        const ids = new Set(chosen.map(li => li.dataset.menuItem));
        for (const [id, p] of placed) if (!ids.has(id)) {   // taken off the table
          placed.delete(id); taken.delete(p.spot.key);
          p.el.classList.add('is-leaving');
          setTimeout(() => p.el.remove(), reduceMotion ? 0 : 380);
        }
        let overflow = 0;
        chosen.forEach(li => {
          const id = li.dataset.menuItem, qty = fmt(qtyOf(li), li.dataset.unit);
          const p = placed.get(id);
          if (p) {
            const tag = $('.scene-qty', p.el);
            if (tag.textContent !== qty) { tag.textContent = qty; flashCard(p); }
            return;
          }
          const spot = spotFor(li.dataset.place || 'tray');
          if (!spot) { overflow++; return; }
          taken.add(spot.key);
          const [x, y, w] = spot.xyw, photo = li.dataset.photo, glass = li.dataset.glass, inPhoto = li.dataset.inPhoto === '1';
          const look = inPhoto ? 'in-photo' : photo ? 'has-photo' : glass ? 'has-glass' : 'no-photo';
          const el = document.createElement('div');
          el.className = `scene-item on-${spot.kind} ${look}`;
          el.style.left = `${(x / 1536) * 100}%`; el.style.top = `${(y / 1024) * 100}%`;
          el.style.setProperty('--w', `${(w / 1536) * 100}cqw`);
          el.style.zIndex = String(y);
          const art = inPhoto ? '<span class="scene-glow"></span>'
            : photo ? `<img src="${esc(photo)}" alt="">`
            : glass ? `<span class="scene-glasses">${glassSVG(glass.split(','))}${glassSVG(glass.split(','))}${glassSVG(glass.split(','))}</span>` : '';
          el.innerHTML = `<div class="scene-pop">${art}<span class="scene-card"><span class="scene-name">${esc(li.dataset.name)}</span><span class="scene-qty">${esc(qty)}</span></span></div>`;
          layer.appendChild(el);
          placed.set(id, { el, spot });
          sparkle($('.scene-pop', el));
          flashCard(placed.get(id));
        });
        // Anything beyond the table's spots is still in the selection table below; say so here.
        more.hidden = !overflow;
        more.textContent = overflow ? `+ ${overflow} more on your list` : '';
        hint.hidden = chosen.length > 0;
        scene.classList.toggle('is-set', chosen.length > 0);
      };

      const render = () => {
        const chosen = items.filter(li => qtyOf(li) > 0);
        syncScene(chosen);
        items.forEach(li => li.classList.toggle('is-chosen', qtyOf(li) > 0));
        cats.forEach(c => {
          const n = $$('[data-menu-item]', c).filter(li => qtyOf(li) > 0).length;
          const badge = $(`[data-menu-count="${c.dataset.menuCat}"]`, menu);
          if (badge) badge.textContent = n ? String(n) : '';
        });
        summary.hidden = !chosen.length;
        rows.innerHTML = chosen.map(li => `<tr data-row-for="${li.dataset.menuItem}"><td>${esc(li.dataset.name)}</td><td>${esc(li.dataset.category)}</td>` +
          `<td class="num">${fmt(qtyOf(li), li.dataset.unit)}</td><td class="num"><button type="button" class="menu-remove" data-menu-remove="${li.dataset.menuItem}" aria-label="Remove ${esc(li.dataset.name)}">×</button></td></tr>`).join('');
        const kg = chosen.filter(li => li.dataset.unit === 'kg').reduce((t, li) => t + qtyOf(li), 0);
        const parts = [`${chosen.length} ${chosen.length === 1 ? 'item' : 'items'}`];
        if (kg) parts.push(`${kg} kg of chocolates`);
        totals.textContent = parts.join(' · ');
      };
      const bump = (li, dir) => {
        const input = $('input', li), step = Number(input.step) || 1, max = Number(input.max) || 9999;
        const next = Math.max(0, Math.min(max, Math.round((qtyOf(li) + dir * step) / step) * step));
        input.value = next ? String(next) : '';
        render();
        if (dir > 0 && next === step) { li.classList.remove('just-added'); void li.offsetWidth; li.classList.add('just-added'); }
      };
      menu.addEventListener('click', (e) => {
        const tab = e.target.closest('[data-menu-tab]');
        if (tab) return show(tab.dataset.menuTab);
        const li = e.target.closest('[data-menu-item]');
        if (li && e.target.closest('[data-menu-inc]')) return bump(li, 1);
        if (li && e.target.closest('[data-menu-dec]')) return bump(li, -1);
        const rm = e.target.closest('[data-menu-remove]');
        if (rm) { const it = items.find(x => x.dataset.menuItem === rm.dataset.menuRemove); if (it) { $('input', it).value = ''; render(); } }
        const row = e.target.closest('[data-row-for]');
        if (row && !rm) { const it = items.find(x => x.dataset.menuItem === row.dataset.rowFor); if (it) { show(it.closest('[data-menu-cat]').dataset.menuCat); $('input', it).focus(); } }
      });
      menu.addEventListener('input', render);
      // Enter in a quantity field confirms the number instead of submitting the whole form.
      menu.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.mi-input')) { e.preventDefault(); e.target.blur(); } });
      // Snap typed values to the item's step (e.g. half kilos) when the field is left.
      menu.addEventListener('change', (e) => {
        const li = e.target.closest('[data-menu-item]'); if (!li) return;
        const input = e.target, step = Number(input.step) || 1, max = Number(input.max) || 9999, q = qtyOf(li);
        const snapped = q ? Math.min(max, Math.max(step, Math.round(q / step) * step)) : 0;
        input.value = snapped ? String(snapped) : '';
        render();
      });
      $('[data-menu-tabs]', menu).hidden = false;
      if (scene) scene.hidden = false;
      const firstChosen = items.find(li => qtyOf(li) > 0);
      show(firstChosen ? firstChosen.closest('[data-menu-cat]').dataset.menuCat : cats[0].dataset.menuCat);
      render();
    }

    // After a server-side validation error, open the first step with a problem.
    const errStep = steps.findIndex(s => $('.has-error', s));
    go(errStep > 0 ? errStep : 0, false);

    // Inspiration uploads: drag & drop and previews.
    const dz = $('[data-dropzone]'), fileInput = $('[data-file-input]'), previews = $('[data-previews]');
    if (dz && fileInput) {
      const render = () => {
        previews.innerHTML = '';
        Array.from(fileInput.files).slice(0, 6).forEach(f => { const im = document.createElement('img'); im.alt = f.name; im.src = URL.createObjectURL(f); previews.appendChild(im); });
      };
      fileInput.addEventListener('cc-resized', render);
      fileInput.addEventListener('change', render);
      window.ccResizeInput && window.ccResizeInput(fileInput, { max: 1800, quality: 0.85 });
      ['dragenter', 'dragover'].forEach(t => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.add('is-over'); }));
      ['dragleave', 'drop'].forEach(t => dz.addEventListener(t, () => dz.classList.remove('is-over')));
      dz.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer?.files?.length) { fileInput.files = e.dataTransfer.files; fileInput.dispatchEvent(new Event('change')); } });
    }
  }

  // ---- Payment status polling (never trusts the redirect — asks the server) --------------------
  const poll = $('[data-poll]');
  if (poll) {
    let n = 0;
    const tick = async () => {
      n++;
      try {
        const r = await fetch(poll.dataset.poll, { headers: { Accept: 'application/json' }, cache: 'no-store' });
        const d = await r.json();
        if (d.ok && d.state !== poll.dataset.pollState) { location.replace(location.pathname + location.search.replace(/([?&])return=1&?/, '$1').replace(/[?&]$/, '')); return; }
      } catch { /* network blip — keep waiting */ }
      if (n < 60) setTimeout(tick, n < 10 ? 2000 : 5000);
      else { const note = $('[data-poll-note]'); if (note) note.textContent = 'Still waiting for confirmation. If you closed the payment page, nothing has been charged — you can safely try again from this page later.'; }
    };
    setTimeout(tick, 1500);
  }
})();
