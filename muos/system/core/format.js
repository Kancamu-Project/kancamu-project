import { i18n } from './i18n.js';
import { settings } from './settings.js';
import { SIZE_UNITS as UNITS } from '../config/files.js';

/** Clock time that follows the 12/24-hour setting ("4:21 PM" or "16:21"). */
export function formatClock(date = new Date(), { seconds = false } = {}) {
  return i18n.date(date, {
    hour: 'numeric',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
    ...(settings.get('clock24h') ? { hourCycle: 'h23' } : { hour12: true })
  });
}

/** "0 bytes", "1.5 KB", "2.31 MB" ... */
export function formatBytes(bytes) {
  const n = Math.max(0, Number(bytes) || 0);
  if (n < 1024) return i18n.plural('common.bytes', n);
  let value = n;
  let unit = -1;
  do {
    value /= 1024;
    unit++;
  } while (value >= 1024 && unit < UNITS.length - 1);
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${i18n.number(value, { maximumFractionDigits: digits })} ${UNITS[unit]}`;
}

/** File Explorer style: always whole kilobytes, rounded up ("3 KB"). */
export function formatKB(bytes) {
  const n = Math.max(0, Number(bytes) || 0);
  return `${i18n.number(Math.ceil(n / 1024))} KB`;
}

export function formatDateTime(ms) {
  return i18n.date(ms, { dateStyle: 'short', timeStyle: 'short' });
}

/** "5 minutes ago", "yesterday" ... in the current language. */
export function relativeTime(ms, now = Date.now()) {
  const seconds = Math.round((ms - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return i18n.t('common.justNow');
  const rtf = new Intl.RelativeTimeFormat(i18n.locale, { numeric: 'auto', style: 'short' });
  const steps = [
    [60, 'minute', 60],
    [24, 'hour', 3600],
    [30, 'day', 86400],
    [12, 'month', 2592000],
    [Infinity, 'year', 31536000]
  ];
  for (const [limit, unit, size] of steps) {
    const value = seconds / size;
    if (Math.abs(value) < limit) return rtf.format(Math.round(value), unit);
  }
  return '';
}
