// Editable site content & settings, stored as JSON documents with safe defaults.
// Anything business-specific that we could not verify is left blank and surfaced
// in the admin launch checklist rather than invented.
import { one, run, all } from '../db.js';

export const DEFAULTS = {
  system: { seeded: false },
  site: {
    tagline: 'Bringing sweet moments to life',
    phone: '',
    whatsapp: '',
    email: '',
    instagram: '',
    tiktok: '',
    facebook: '',
    city: 'Egypt',
    hours: '',
    notifyEmail: '',            // where new orders and enquiries are announced
    collectionAddress: '',
    collectionNotes: '',
    announcement: '',
  },
  store: {
    orderingOpen: true,
    maxAdvanceDays: 60,
    deliveryNote: 'Delivery fees are calculated for your area at checkout.',
  },
  home: {
    heroEyebrow: 'The Signature Collection',
    heroTitle: 'Something sweet.\nSomething unforgettable.',
    heroIntro: 'Chocolates composed like a still life, made to be shared at the moments that matter.',
    detailEyebrow: 'Up close',
    detailTitle: 'A touch of gold, a breath of flowers.',
    detailBody: 'Glossy chocolate domes, each crowned with a fleck of gold, set in a clear tray beside an arrangement of cream gerberas and folded leaves. Nothing is there by accident.',
    giftingEyebrow: 'Gifting & celebrations',
    giftingTitle: 'Arrive with something they will remember.',
    giftingBody: 'For engagements, birthdays, Eid and every quiet thank-you in between: a centrepiece that sits beautifully on the table and disappears slowly, one piece at a time.',
    cateringEyebrow: 'Catering & private events',
    cateringTitle: 'Dessert tables, composed for your guests.',
    cateringBody: 'From intimate engagements to corporate evenings, we design dessert tables, chocolate trays and gifting around your occasion. Tell us about it, and we will prepare a proposal.',
    storyEyebrow: 'Who we are',
    storyTitle: 'Two dessert lovers, one belief.',
    storyBody: 'Cocoa Caramel began as a shared passion between two dessert lovers who believed that every sweet creation should feel as special as it tastes. What started in their own kitchens — crafting desserts that impressed family and friends with both flavour and presentation — quickly grew into something more.\n\nToday we make desserts for those who value refined taste and premium quality: where every bite is worth it, and every dessert tells a story.',
  },
  catering: {
    intro: 'Every celebration has its own mood. Share yours with us and we will compose a dessert experience around it — the pieces, the presentation and the finishing touches.',
    eventTypes: ['Engagement', 'Wedding', 'Birthday', 'Corporate', 'Other celebration'],
    services: [
      { name: 'Dessert tables', body: 'A styled table of desserts designed around your event, colours and guest count.' },
      { name: 'Chocolate trays', body: 'Our signature trays, arranged as centrepieces or served to guests.' },
      { name: 'Gifting', body: 'Chocolate gifts for guests, clients and teams, prepared to your occasion.' },
    ],
    budgetRanges: ['Under EGP 10,000', 'EGP 10,000 – 25,000', 'EGP 25,000 – 50,000', 'Above EGP 50,000', 'I would rather discuss'],
    minNoticeDays: 7,
  },
  quotes: {
    defaultDepositPercent: 50,
    validityDays: 14,
    defaultTerms: '',
  },
};

// Settings are read synchronously by views, so they are held in memory and reloaded
// from the database at the start of every request (one small query). That keeps every
// serverless instance consistent with the latest admin edits.
let stored = {};

export async function loadSettings() {
  const rows = await all('SELECT key, value FROM settings');
  stored = Object.fromEntries(rows.map(r => [r.key, JSON.parse(r.value)]));
}

export function getSetting(key) {
  return { ...(DEFAULTS[key] || {}), ...(stored[key] || {}) };
}

export async function setSetting(key, patch) {
  const next = { ...getSetting(key), ...patch };
  await run(`INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`, key, JSON.stringify(next));
  stored[key] = next;
  return next;
}

// ---- Policy & information pages -------------------------------------------------

export const POLICY_PAGES = [
  {
    slug: 'delivery',
    title: 'Delivery & Collection',
    body: `## Where we deliver
We deliver to the areas listed at checkout. The delivery fee for your area is shown at checkout before you pay.

## Preparation time
Every creation is made to order. The preparation time is shown on each product page, and checkout only offers delivery dates that leave us enough time to prepare your order.

## Delivery day
You choose your delivery date at checkout. We will contact you on the phone number you give at checkout to arrange a delivery time.

## Collection
Where collection is available for the items in your bag, you can choose it at checkout. The collection address and any collection notes are shown there.

## Receiving your order
Please make sure someone is available to receive your order. Chocolate is sensitive to heat: please refrigerate or store it as advised on the product page as soon as it arrives.

If anything arrives damaged or is not what you ordered, please contact us the same day with your order reference and a photo, and we will replace it or refund it.`,
  },
  {
    slug: 'cancellations-refunds',
    title: 'Cancellations & Refunds',
    body: `## Changing or cancelling an order
You can change or cancel an order up to **48 hours before your delivery or collection date** for a full refund. Please contact us with your order reference.

Because every order is made specially for you, orders cannot be cancelled or refunded within 48 hours of the delivery or collection date.

## How refunds are paid
Refunds are paid back to the original payment method. Depending on your bank or wallet provider, a refund can take **7–14 business days** to appear.

## Damaged or incorrect orders
If anything arrives damaged or is not what you ordered, please contact us **on the same day** with your order reference and a photo. We will replace the affected items or refund them.

## Events & catering deposits
Deposits paid to confirm an event are non-refundable. With at least **7 days' notice** before the event, you can move your booking to a new date once, and your deposit will be carried over.`,
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    body: `## What we collect
When you place an order or send an enquiry, we collect your name, phone number, email address, delivery address and any details you choose to share about your event, including inspiration images.

## How we use it
We use your information only to prepare, deliver and support your order or event, and to contact you about it.

## Payments
Card and wallet payments are processed by our payment provider, Paymob, on its secure hosted checkout. We never see or store your full card details.

## Sharing
We share delivery details with our delivery partners only as needed to deliver your order. We do not sell your information.

## How long we keep it
We keep order records for as long as we need them to support your order and to meet our legal and accounting obligations.

## Your choices
You can ask us to access, correct or delete your information at any time. Please contact us using the phone, WhatsApp or email details shown on this website.`,
  },
  {
    slug: 'terms',
    title: 'Terms of Sale',
    // Stays flagged in the admin until the business's legal name and registration are added.
    needsReview: true,
    body: `## Orders
An order is confirmed only once your payment has been verified by our payment provider. You will receive a confirmation with your order reference.

## Prices
All prices are in Egyptian Pounds (EGP). Delivery fees are shown at checkout before payment.

## Allergens
Our kitchen handles common allergens. Please read the allergen information on each product carefully, and contact us before ordering if you have an allergy.

## Cancellations & refunds
Orders can be changed or cancelled up to 48 hours before the delivery or collection date. Full details are in our [Cancellations & Refunds](/pages/cancellations-refunds) policy.

## Events and quotes
Quotes are valid until the expiry date shown. An event booking is confirmed only after the quote is accepted and the required deposit has been received.

## Contact
[To be completed: legal business name and commercial registration number.]

You can reach us using the phone, WhatsApp or email details shown on this website.`,
  },
];

// The first drafts shipped with the site. A stored page whose body still matches its
// draft has never been edited, so ensurePages() replaces it with the current text.
const DRAFT_PAGES = [
  {
    slug: 'delivery',
    title: 'Delivery & Collection',
    body: `> Draft — the Cocoa Caramel team must review and complete this page before launch.

## Where we deliver
We deliver to the areas listed at checkout. The delivery fee for your area is shown before you pay.

## Preparation time
Each creation is made to order. The preparation time is shown on every product page, and the earliest available date is offered at checkout.

## Delivery windows
[To be completed: delivery days, time windows and how customers are contacted on the day.]

## Collection
[To be completed: whether collection is offered, the address and collection hours.]

## Receiving your order
Please make sure someone is available to receive your order. Chocolate is sensitive to heat — please refrigerate or store as advised on the product page as soon as it arrives.`,
  },
  {
    slug: 'cancellations-refunds',
    title: 'Cancellations & Refunds',
    body: `> Draft — the Cocoa Caramel team must define and approve this policy before launch.

## Changing or cancelling an order
[To be completed: until when an order can be changed or cancelled, and how to request it.]

## Refunds
[To be completed: when refunds are offered, how they are issued (to the original payment method) and how long they take.]

## Events & catering deposits
[To be completed: whether event deposits are refundable, and the cancellation schedule for confirmed events.]

## Quality concerns
If anything is not right with your order, please contact us on the day of delivery with your order reference so we can make it right.`,
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    body: `> Draft — please have this reviewed for compliance with Egypt's Personal Data Protection Law (Law No. 151 of 2020) before launch.

## What we collect
When you place an order or send an enquiry we collect your name, phone number, email address, delivery address and any details you choose to share about your event, including inspiration images.

## How we use it
We use your information only to prepare, deliver and support your order or event, and to contact you about it.

## Payments
Card payments are processed by our payment provider on its secure hosted checkout. We never see or store your full card details.

## Sharing
We share delivery details with our delivery partners only as needed to deliver your order. We do not sell your information.

## Your choices
You can ask us to access, correct or delete your information by contacting us. [To be completed: contact method and retention periods.]`,
  },
  {
    slug: 'terms',
    title: 'Terms of Sale',
    body: `> Draft — the Cocoa Caramel team must review and complete these terms before launch.

## Orders
An order is confirmed only once your payment has been verified by our payment provider. You will receive a confirmation with your order reference.

## Prices
All prices are in Egyptian Pounds (EGP). Delivery fees are shown at checkout before payment.

## Allergens
Our kitchen handles nuts, dairy, gluten and other allergens. Please read the allergen information on each product carefully. [To be confirmed by the kitchen.]

## Events and quotes
Quotes are valid until the expiry date shown. An event booking is confirmed only after the quote is accepted and the required payment has been received.

## Contact
[To be completed: legal business name, commercial registration and contact details.]`,
  },
];

export async function ensurePages() {
  for (const [i, p] of POLICY_PAGES.entries()) {
    const needsReview = p.needsReview ? 1 : 0;
    await run('INSERT INTO pages (slug, title, body, needs_review, sort) VALUES (?, ?, ?, ?, ?) ON CONFLICT (slug) DO NOTHING', p.slug, p.title, p.body, needsReview, i);
    const draft = DRAFT_PAGES.find(d => d.slug === p.slug);
    if (draft) {
      await run('UPDATE pages SET title = ?, body = ?, needs_review = ?, updated_at = now() WHERE slug = ? AND body = ?',
        p.title, p.body, needsReview, p.slug, draft.body);
    }
  }
}

export const getPage = (slug) => one('SELECT * FROM pages WHERE slug = ?', slug);
export const listPages = () => all('SELECT slug, title, needs_review, updated_at FROM pages ORDER BY sort, slug');
