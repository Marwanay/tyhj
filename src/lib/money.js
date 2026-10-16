// Money is always integer piastres internally; formatting happens only at the edges.
const fmt = new Intl.NumberFormat('en-EG', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function formatEGP(piastres) {
  if (piastres === null || piastres === undefined) return '—';
  return `EGP ${fmt.format(piastres / 100)}`;
}

/** Parse an admin-entered amount ("1,250.50") into piastres, or null if blank/invalid. */
export function parseEGP(input) {
  const s = String(input ?? '').replace(/[,\s]|EGP/gi, '');
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
}

export const toInputEGP = (p) => (p === null || p === undefined ? '' : (p / 100).toFixed(p % 100 ? 2 : 0));
