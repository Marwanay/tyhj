// Local sandbox gateway for TEST MODE only. It imitates a hosted checkout and sends
// HMAC-signed callbacks in Paymob's exact format to our own webhook endpoint, so the
// verification and fulfilment code paths are the same ones used in production.
// It can never be used when PAYMENT_MODE=live.
import { config } from '../config.js';
import { randomToken } from '../lib/security.js';
import { verifyTransactionHmac, computeTransactionHmac } from './hmac.js';
import { transactionEvent } from './paymob.js';

const secret = () => config.payments.sandbox.hmacSecret;

export const sandbox = {
  name: 'sandbox',
  label: 'Test sandbox',

  status() {
    if (config.payments.mode === 'live') {
      return { ready: false, missing: [], problems: ['The test sandbox cannot be used in live mode.'] };
    }
    return { ready: true, missing: [], problems: [] };
  },

  async createCheckout({ payment }) {
    const providerOrderId = `sbx_${randomToken(12)}`;
    return { providerOrderId, checkoutUrl: `${config.baseUrl}/sandbox-gateway/${providerOrderId}` };
  },

  parseWebhook(req) {
    const obj = req.body?.obj;
    if (!verifyTransactionHmac(obj, req.query.hmac, secret())) return null;
    return transactionEvent(obj);
  },
};

let txnSeq = Date.now() % 1_000_000_000;

/** Build and sign a Paymob-shaped transaction callback for a sandbox payment. */
export function buildSandboxCallback(payment, outcome) {
  const obj = {
    id: ++txnSeq,
    pending: outcome === 'pending',
    amount_cents: payment.amount,
    success: outcome === 'paid',
    is_auth: false, is_capture: false, is_standalone_payment: true,
    is_voided: false, is_refunded: false, is_3d_secure: true,
    integration_id: 0,
    has_parent_transaction: false,
    order: { id: payment.provider_order_id, merchant_order_id: payment.merchant_reference },
    created_at: new Date().toISOString(),
    currency: payment.currency,
    error_occured: false,
    owner: 0,
    source_data: { pan: '0008', type: 'card', sub_type: 'TestCard' },
    data: { message: outcome === 'failed' ? 'Declined by test card' : outcome === 'pending' ? 'Awaiting bank confirmation (test)' : 'Approved (test)' },
  };
  return { body: { type: 'TRANSACTION', obj }, hmac: computeTransactionHmac(obj, secret()) };
}
