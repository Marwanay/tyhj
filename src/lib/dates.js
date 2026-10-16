// The business runs on Cairo time; all customer-facing date logic uses it.
export const TZ = 'Africa/Cairo';

/** YYYY-MM-DD for a Date in Cairo. */
export function cairoDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Earliest date (Cairo) an order can be fulfilled given a lead time in hours. */
export function earliestDate(leadHours, now = new Date()) {
  const ready = new Date(now.getTime() + Math.max(0, leadHours) * 3600_000);
  return cairoDate(ready);
}

export function addDays(isoDate, days) {
  const d = new Date(isoDate + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));

export function prettyDate(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).length === 10 ? iso + 'T12:00:00Z' : iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z'));
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

export function prettyDateTime(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).replace(' ', 'T') + (String(iso).includes('Z') || String(iso).includes('+') ? '' : 'Z'));
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
}

export function leadTimeLabel(hours) {
  if (hours === null || hours === undefined) return '';
  if (hours < 24) return `${hours} hours`;
  const days = Math.round(hours / 24 * 2) / 2;
  return days === 1 ? '1 day' : `${days} days`;
}
