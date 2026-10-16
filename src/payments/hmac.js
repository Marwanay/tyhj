// Paymob transaction-callback HMAC (HMAC-SHA512 over 20 fields in a fixed, lexicographic order).
import crypto from 'node:crypto';

export const TRANSACTION_FIELDS = [
  'amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction', 'id',
  'integration_id', 'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded', 'is_standalone_payment',
  'is_voided', 'order.id', 'owner', 'pending', 'source_data.pan', 'source_data.sub_type',
  'source_data.type', 'success',
];

function read(obj, dotted) {
  let cur = obj;
  for (const part of dotted.split('.')) {
    if (cur === null || typeof cur !== 'object' || !(part in cur)) return '';
    cur = cur[part];
  }
  if (cur === null || cur === undefined) return '';
  if (typeof cur === 'boolean') return cur ? 'true' : 'false';
  if (typeof cur === 'object') return JSON.stringify(cur);
  return String(cur);
}

export function computeTransactionHmac(obj, secret) {
  const message = TRANSACTION_FIELDS.map(f => read(obj, f)).join('');
  return crypto.createHmac('sha512', secret).update(message, 'utf8').digest('hex');
}

export function verifyTransactionHmac(obj, given, secret) {
  if (!secret || !given || !obj || typeof obj !== 'object') return false;
  const expected = Buffer.from(computeTransactionHmac(obj, secret));
  const actual = Buffer.from(String(given).trim().toLowerCase());
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/** Map a verified Paymob transaction object to our neutral outcome vocabulary. */
export function outcomeOf(obj) {
  if (obj.is_refunded || obj.is_voided) return 'refunded';
  if (obj.pending) return 'pending';
  if (obj.success) return 'paid';
  return 'failed';
}
