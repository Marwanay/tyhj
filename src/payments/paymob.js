// Paymob (Egypt) — Intention API + Unified Checkout (hosted). Card data never touches our server.
//   Create intention: POST {base}/v1/intention/   Authorization: Token <secret key>
//   Hosted checkout:  {base}/unifiedcheckout/?publicKey=…&clientSecret=…
//   Callback:         POST to notification_url, JSON {type:'TRANSACTION', obj:{…}}, ?hmac=<sha512>
import { config } from '../config.js';
import { verifyTransactionHmac, outcomeOf } from './hmac.js';

const cfg = () => config.payments.paymob;

export const paymob = {
  name: 'paymob',
  label: 'Paymob',

  status() {
    const c = cfg();
    const missing = [];
    if (!c.secretKey) missing.push('PAYMOB_SECRET_KEY');
    if (!c.publicKey) missing.push('PAYMOB_PUBLIC_KEY');
    if (!c.hmacSecret) missing.push('PAYMOB_HMAC_SECRET');
    if (!c.integrationIds.length) missing.push('PAYMOB_INTEGRATION_IDS');
    const keyMode = c.secretKey.includes('_live_') ? 'live' : c.secretKey.includes('_test_') ? 'test' : null;
    const problems = [];
    if (keyMode && keyMode !== config.payments.mode) {
      problems.push(`The Paymob secret key is a ${keyMode} key but PAYMENT_MODE is "${config.payments.mode}".`);
    }
    if (config.payments.mode === 'live' && !config.baseUrl.startsWith('https://')) {
      problems.push('BASE_URL must be an https:// address for live payments.');
    }
    return { ready: !missing.length && !problems.length, missing, problems };
  },

  async createCheckout({ payment, amount, items, customer, notificationUrl, redirectionUrl }) {
    const c = cfg();
    const [first, ...rest] = customer.name.trim().split(/\s+/);
    const body = {
      amount,
      currency: 'EGP',
      payment_methods: c.integrationIds,
      items: items.map(i => ({ name: i.name.slice(0, 50), amount: i.unitAmount, quantity: i.quantity, description: (i.description || i.name).slice(0, 255) })),
      billing_data: {
        first_name: first || 'Customer',
        last_name: rest.join(' ') || 'NA',
        phone_number: customer.phone,
        email: customer.email,
        street: 'NA', building: 'NA', apartment: 'NA', floor: 'NA',
        city: customer.city || 'NA', state: 'NA', country: 'EG',
      },
      special_reference: payment.merchant_reference,
      notification_url: notificationUrl,
      redirection_url: redirectionUrl,
      extras: { merchant_reference: payment.merchant_reference },
    };
    const sum = body.items.reduce((s, i) => s + i.amount * i.quantity, 0);
    if (sum !== amount) throw new Error(`Paymob item total ${sum} does not match amount ${amount}`);

    const res = await fetch(new URL('v1/intention/', c.baseUrl), {
      method: 'POST',
      headers: { Authorization: `Token ${c.secretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Paymob intention failed (${res.status}): ${text.slice(0, 300)}`);
    const data = JSON.parse(text);
    if (!data.client_secret) throw new Error('Paymob response did not include a client secret');
    const url = new URL('unifiedcheckout/', c.baseUrl);
    url.searchParams.set('publicKey', c.publicKey);
    url.searchParams.set('clientSecret', data.client_secret);
    return { providerOrderId: String(data.intention_order_id), checkoutUrl: url.toString() };
  },

  /** Authenticate a callback. Returns null when the signature is invalid. */
  parseWebhook(req) {
    const body = req.body || {};
    if (body.type && body.type !== 'TRANSACTION') return { ignored: true, reason: `type ${body.type}` };
    const obj = body.obj;
    if (!verifyTransactionHmac(obj, req.query.hmac, cfg().hmacSecret)) return null;
    return transactionEvent(obj);
  },
};

export function transactionEvent(obj) {
  const outcome = outcomeOf(obj);
  return {
    eventKey: `${obj.id}:${outcome}`,
    providerOrderId: String(obj.order?.id ?? ''),
    txnId: String(obj.id),
    amount: Number(obj.amount_cents),
    currency: String(obj.currency || ''),
    outcome,
    detail: [obj.source_data?.sub_type, obj.source_data?.pan && `•••• ${obj.source_data.pan}`,
      obj.data?.message].filter(Boolean).join(' · '),
  };
}
