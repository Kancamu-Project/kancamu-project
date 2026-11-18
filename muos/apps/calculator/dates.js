/** Date arithmetic of the "Date calculation" mode. Dates are local calendar days. */

/** "2026-11-14" (the value of <input type="date">) -> a Date at local midnight, or null. */
export function parseDay(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text));
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export const toDay = (date) => `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const daysIn = (year, month) => new Date(year, month + 1, 0).getDate();

/** Years, months and days between two dates (the earlier first), plus the plain number of days. */
export function difference(a, b) {
  const [from, to] = a <= b ? [a, b] : [b, a];
  // whole years, then whole months, that still fit before the later date; the rest are days
  let years = to.getFullYear() - from.getFullYear();
  while (years > 0 && shift(from, { years }) > to) years--;
  let months = 0;
  while (shift(from, { years, months: months + 1 }) <= to) months++;
  const rest = shift(from, { years, months });
  const days = Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(rest.getFullYear(), rest.getMonth(), rest.getDate())) / 86400000);
  const total = Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / 86400000);
  return { years, months, days, total };
}

/** Add (sign 1) or subtract (sign -1) years, months and days. A day that does not exist in the month is clamped (31 Jan + 1 month = 28 Feb). */
export function shift(date, { years = 0, months = 0, days = 0 }, sign = 1) {
  const y = date.getFullYear() + sign * years;
  const m = date.getMonth() + sign * months;
  const first = new Date(y, m, 1);
  const day = Math.min(date.getDate(), daysIn(first.getFullYear(), first.getMonth()));
  return new Date(first.getFullYear(), first.getMonth(), day + sign * days);
}
