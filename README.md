# Cocoa Caramel — website, shop & events

A complete storefront for Cocoa Caramel: an editorial homepage, a product catalogue that can grow
from the admin, a real checkout with server-side pricing and gateway-verified payments, a
private-consultation catering flow with quotes that clients accept and pay online, and a secure
admin for the team.

Built with Node.js 22, Express, SQLite (Node's built-in driver) and server-rendered HTML.
JavaScript is progressive enhancement only, so every flow also works without it.

```bash
npm install
npm run setup                                   # build responsive imagery + seed the launch product
npm run admin:create -- you@example.com "Your Name" owner
npm start                                        # http://localhost:3000  ·  admin at /admin
npm test                                         # unit tests (HMAC, money, phone, idempotency)
npm run e2e                                      # full browser test of every purchase & quote path
```

## What is complete, and what waits on the business

| Area | Status |
|---|---|
| Homepage (6 scenes), collection, product page with gallery & zoom, mobile sticky Add to Bag | **Complete** |
| Bag → delivery details → payment → confirmation; guest checkout; Egyptian mobiles; EGP | **Complete** |
| Server-side totals, unique order references, idempotent webhooks, amount checks, duplicate-payment protection | **Complete** |
| Successful / failed / cancelled / pending payments, status page that polls the server | **Complete** |
| Catering consultation page, 4-step enquiry with uploads, reference number | **Complete** |
| Admin quotes (items, expiry, terms, deposit/full), private non-indexable links, accept & pay, deposits & balances, offline payments | **Complete** |
| Admin: products, images, prices, stock, orders, delivery areas, enquiries, content, policy pages, team | **Complete** |
| Payments in **test mode** via the built-in sandbox gateway (signs callbacks exactly like Paymob) | **Working now** |
| **Live payments** with Paymob | **Awaiting merchant credentials** — see below |
| **Email delivery** | **Awaiting SMTP credentials** — messages are recorded in Admin → Payments & notifications until then |
| Product selling details: price, piece count/contents, ingredients, allergens, storage, lead time | **Awaiting the business** — the product is visible but cannot be bought until these are entered |
| Delivery areas & fees, contact details, social links | **Awaiting the business** |
| Delivery, refunds, privacy and terms pages | **Drafted with placeholders** — flagged “needs review” in the admin |

The admin dashboard shows a live **launch checklist** of everything still outstanding.

## Payments

The gateway layer (`src/payments/`) is modular: each provider implements `status()`,
`createCheckout()` and `parseWebhook()`. Two providers ship:

* **Paymob (Egypt)** — Intention API (`POST /v1/intention/`, `Authorization: Token <secret>`) and
  the hosted **Unified Checkout** (`/unifiedcheckout/?publicKey=…&clientSecret=…`). Card details
  never touch this server. Callbacks are verified with Paymob's HMAC-SHA512 over its 20 transaction
  fields; the implementation is checked against an independently computed test vector.
* **Sandbox** — a local stand-in for test mode. It shows a simulated hosted checkout and sends
  HMAC-signed callbacks in Paymob's exact format to the real webhook endpoint, so the same
  verification and fulfilment code runs. It refuses to run when `PAYMENT_MODE=live`.

Guarantees, regardless of provider:

* Prices, delivery fees and totals are calculated on the server; the browser never sends an amount.
* Only an authenticated callback (or a staff-recorded offline payment) marks money as received.
  Returning to the site from the gateway is never treated as proof — the confirmation page asks
  the server and waits.
* Each callback is stored under a unique key, so retries and replays are processed once. Amounts
  and currency must match the payment attempt exactly, or the callback is held for review.
* A paid order can't be downgraded by a late failure. A second successful payment on the same order
  is flagged for refund. Only one attempt can be pending at a time.
* Orders and quotes record whether they were created in test or live mode and can't be paid in the other.

### Activating live payments with Paymob

1. In the Paymob dashboard, collect the **live** secret key, public key, HMAC secret and the
   integration IDs for each payment method you want to offer (cards, wallets, etc.).
2. Set `PAYMENT_PROVIDER=paymob`, `PAYMENT_MODE=live`, the four `PAYMOB_*` values and an
   `https://` `BASE_URL` (see `.env.example`).
3. In Paymob, set the **transaction processed callback** to `https://<your-domain>/webhooks/paymob`.
4. Restart. Admin → Payments & notifications should show **Live · Ready**.
5. Place one small real order, confirm it shows as **Paid**, then refund it from Paymob.

To try Paymob in its own test environment first, use Paymob **test** keys with `PAYMENT_MODE=test`.
The server refuses to start payments if a live key is used in test mode, or the reverse.

> Paymob's documentation site could not be reached from the build environment, so the integration
> follows Paymob's published Intention/Unified Checkout and HMAC specification, cross-checked
> against an independent client's test vectors. Step 5 above is the final confirmation against
> your merchant account.

## Security

* Admin: scrypt-hashed passwords, server-side sessions (12 h, `HttpOnly`, `SameSite=Strict`),
  per-session CSRF tokens, login throttling, owner/staff roles. Create the first owner from the CLI.
* Public forms: same-origin checks on every POST, rate limits on enquiries and quote links.
* Strict Content-Security-Policy (no inline scripts), HSTS on https, no third-party scripts or fonts.
* Order and quote links use 192-/256-bit random tokens, stored hashed (and sealed with AES-GCM so
  they can be re-sent by email). Private pages send `noindex` and `no-store` and are disallowed in robots.txt.
* Inspiration uploads are re-encoded (metadata stripped) and stored outside the public folder;
  only signed-in staff can view them.
* Secrets live only in environment variables; the admin shows which are missing, never their values.

## Content & brand

* The logo, wordmark and monogram are traced to SVG from the rasters in the brand identity PDF
  (`public/brand/`), so they stay crisp and take any brand colour.
* Imagery uses only the two approved Signature Chocolate Tray renders and crops of them
  (`assets/source/`, built by `npm run build:media` into AVIF/WebP/JPEG at several widths).
  Higher-resolution originals (2500 px+) would make the close-up crops sharper on retina screens.
* **Fonts.** The identity names Hamburg Hand and Actalou. Only subsetted copies are embedded in the
  PDF, and a web licence wasn't supplied, so the site uses open-licence stand-ins: *Cormorant
  Garamond* for editorial headlines (in place of Actalou), *Archivo Expanded* for small capitals
  (in place of Hamburg Hand) and *Poppins* — named in the identity — for shopping and checkout text.
  To switch, add licensed `.woff2` files to `public/fonts/` and change `--font-display` /
  `--font-label` in `public/css/site.css`.
* All wording on the homepage and catering page, plus contact details and policy pages, can be
  edited in the admin.

## Project layout

```
src/
  server.js            app setup, security headers, routing
  config.js            environment & payment mode
  db.js                schema & migrations (SQLite, money in piastres)
  lib/                 html escaping, money, Egyptian phone numbers, dates (Cairo), images, http
  payments/            paymob.js, sandbox.js, hmac.js, provider registry
  services/            catalog, cart, orders, payments, quotes, content, notify, auth
  routes/              shop.js, events.js (catering, quotes, webhooks), admin.js
  views/               layout, components, home, shop, catering, admin
public/                css, js, fonts, brand marks, generated media
scripts/               build-media, seed, create-admin, e2e
test/                  unit tests
```

## Deploying

Any host that runs Node 22.13+ with a persistent disk works (a small VPS, Render, Railway or Fly.io).
Keep `DATA_DIR` and `public/media` on persistent storage and back up `DATA_DIR` daily. Put the app
behind HTTPS (set `TRUST_PROXY` to the number of proxies). Run `npm run setup` once, then
`npm start` under a process manager.
