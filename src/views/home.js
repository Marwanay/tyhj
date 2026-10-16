import { html } from '../lib/html.js';
import { paragraphs } from '../lib/html.js';
import { layout } from './layout.js';
import { site, framed, picture, button, eyebrow, titleLines, monogram, price } from './components.js';
import { getSetting } from '../services/content.js';
import { priceRange } from '../services/catalog.js';

export function homePage({ featured, cartCount }) {
  const h = getSetting('home');
  const c = getSetting('catering');
  const productHref = featured ? `/collection/${featured.slug}` : '/collection';
  const range = featured && priceRange(featured);

  const body = html`
<!-- 1 · The signature product -->
<section class="hero" aria-labelledby="hero-title">
  <div class="wrap hero-grid">
    <div class="hero-copy">
      ${eyebrow(h.heroEyebrow, 'reveal')}
      <h1 class="hero-title reveal d1" id="hero-title">${titleLines(h.heroTitle)}</h1>
      <p class="hero-intro reveal d2">${h.heroIntro}</p>
      <div class="hero-actions reveal d3">
        ${button('Shop the Collection', { href: '/collection', withArrow: true })}
        ${button('Plan Your Event', { href: '/catering', variant: 'ghost' })}
      </div>
    </div>
    <div class="hero-art">
      ${monogram('hero-monogram')}
      <a href="${productHref}" aria-label="${featured ? featured.name : 'The Collection'}">
        ${framed(site('site-hero'), { mount: true, reveal: false, eager: true, sizes: '(max-width: 960px) 100vw, 58vw' })}
      </a>
      <div class="hero-meta">
        <p class="caption"><span class="numeral">No. 01</span> ${featured ? featured.name : 'The Signature Chocolate Tray'}</p>
        <p class="caption">${range ? price(range.min) : ''}</p>
      </div>
      <p class="hero-side label" aria-hidden="true">Cocoa Caramel · Est. 2025</p>
    </div>
  </div>
</section>

<!-- 2 · A close look -->
<section class="section on-plum details" aria-labelledby="detail-title">
  <div class="wrap details-grid">
    <div class="details-copy">
      ${eyebrow(h.detailEyebrow, 'reveal')}
      <h2 id="detail-title" class="reveal d1">${h.detailTitle}</h2>
      <p class="reveal d2 measure">${h.detailBody}</p>
      <a class="link reveal d3" href="${productHref}">Discover the tray</a>
    </div>
    <figure class="details-a">
      ${framed(site('site-detail-flowers'), { mount: true, sizes: '(max-width: 960px) 66vw, 30vw' })}
      <figcaption class="caption"><span class="numeral">i.</span> Cream gerberas & folded leaves</figcaption>
    </figure>
    <figure class="details-b">
      ${framed(site('site-detail-gold'), { mount: true, sizes: '(max-width: 960px) 66vw, 30vw' })}
      <figcaption class="caption"><span class="numeral">ii.</span> Gold details on glossy chocolate</figcaption>
    </figure>
    <div class="details-note reveal">
      <span class="numeral" aria-hidden="true">&</span>
      <p class="lede">Presented in a clear tray, so the first thing anyone sees is the chocolate itself.</p>
    </div>
  </div>
</section>

<!-- 3 · Gifting & celebrations -->
<section class="section gifting on-blush" aria-labelledby="gift-title">
  <div class="wrap gifting-grid">
    <div class="gifting-art">
      <div class="frame gifting-slides" style="--ph:${site('event-terrace').placeholder}">
        ${['event-terrace', 'event-garden', 'event-dusk'].map(key => html`<div class="gifting-slide">${picture(site(key), { sizes: '(max-width: 960px) 100vw, 64vw' })}</div>`)}
        <p class="gifting-slides-note label">From our events</p>
      </div>
    </div>
    <div class="gifting-card reveal">
      ${eyebrow(h.giftingEyebrow)}
      <h2 id="gift-title">${h.giftingTitle}</h2>
      <p>${h.giftingBody}</p>
      <ul class="occasions">
        <li><span>Engagements</span><span>I</span></li>
        <li><span>Birthdays</span><span>II</span></li>
        <li><span>Eid & Ramadan</span><span>III</span></li>
        <li><span>A simple thank-you</span><span>IV</span></li>
      </ul>
      ${button('Shop the Collection', { href: '/collection', withArrow: true })}
    </div>
  </div>
</section>

<!-- 4 · Catering & private events -->
<section class="section on-plum on-plum-deep" aria-labelledby="cater-title">
  <div class="wrap catering-grid">
    <div class="catering-head">
      ${eyebrow(h.cateringEyebrow, 'reveal')}
      <h2 id="cater-title" class="reveal d1">${titleLines(h.cateringTitle.replace(', ', ',\n'))}</h2>
    </div>
    <div class="catering-art">
      ${framed(site('event-terrace'), { mount: true, sizes: '(max-width: 960px) 80vw, 30vw' })}
    </div>
    <div class="catering-body">
      <div class="reveal">
        <p class="lede">${h.cateringBody}</p>
        <div style="margin-top:32px">${button('Plan Your Event', { href: '/catering', withArrow: true })}</div>
      </div>
      <ul class="services reveal d1">
        ${c.services.map(s => html`<li><strong>${s.name}</strong><span>${s.body}</span></li>`)}
      </ul>
    </div>
  </div>
</section>

<!-- 5 · Our story -->
<section class="section story" id="story" aria-labelledby="story-title">
  <div class="wrap">
    ${monogram('reveal')}
    ${eyebrow(h.storyEyebrow, 'plain reveal')}
    <h2 id="story-title" class="reveal d1">${h.storyTitle}</h2>
    <div class="story-body reveal d2">${paragraphs(h.storyBody)}</div>
    <div class="story-sign reveal">
      <span class="gold-rule"></span>
      <span class="label">${getSetting('site').tagline}</span>
    </div>
  </div>
</section>`;

  return layout({ body, page: 'home', cartCount, intro: true, canonical: '/' });
}
