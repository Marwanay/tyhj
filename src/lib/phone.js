// Egyptian mobile numbers: 010, 011, 012, 015 followed by 8 digits.
// Accepts local (01xxxxxxxxx), international (+201xxxxxxxxx / 00201…) and Arabic-Indic digits.
const ARABIC = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';

export function normalizeEgyptianMobile(input) {
  let s = String(input ?? '')
    .replace(/[٠-٩]/g, d => String(ARABIC.indexOf(d)))
    .replace(/[۰-۹]/g, d => String(PERSIAN.indexOf(d)))
    .replace(/[\s\-().]/g, '');
  if (s.startsWith('+20')) s = '0' + s.slice(3);
  else if (s.startsWith('0020')) s = '0' + s.slice(4);
  else if (s.startsWith('20') && s.length === 12) s = '0' + s.slice(2);
  else if (/^1[0125]\d{8}$/.test(s)) s = '0' + s;
  if (!/^01[0125]\d{8}$/.test(s)) return null;
  return '+20' + s.slice(1);
}

export const displayPhone = (e164) =>
  e164 && e164.startsWith('+20') ? `0${e164.slice(3, 6)} ${e164.slice(6, 9)} ${e164.slice(9)}` : (e164 || '');
