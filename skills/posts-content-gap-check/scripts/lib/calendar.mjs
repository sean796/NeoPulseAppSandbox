/** Next-month calendar helpers (America/Edmonton). */

export const TZ = "America/Edmonton";
export const MONTH_END_BUFFER_DAYS = 5;

export function edmontonNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value ?? NaN);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") === 24 ? 0 : get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Next calendar month key `YYYY-MM` in America/Edmonton. */
export function nextMonthKey(now = new Date()) {
  const ed = edmontonNow(now);
  const nextMonth = ed.month === 12 ? 1 : ed.month + 1;
  const nextYear = ed.month === 12 ? ed.year + 1 : ed.year;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

export function parseMonthKey(monthKey) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey ?? "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isInteger(year) || monthIndex < 0 || monthIndex > 11) return null;
  return { year, monthIndex };
}

/** Local-calendar month bounds as ISO after/before (exclusive). */
export function monthBounds(monthKey) {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) throw new Error(`Invalid month key: ${monthKey}`);
  const start = new Date(parsed.year, parsed.monthIndex, 1, 0, 0, 0, 0);
  const end = new Date(parsed.year, parsed.monthIndex + 1, 1, 0, 0, 0, 0);
  return { after: start.toISOString(), before: end.toISOString() };
}

export function daysInMonth(monthKey) {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) throw new Error(`Invalid month key: ${monthKey}`);
  return new Date(parsed.year, parsed.monthIndex + 1, 0).getDate();
}

export function lastAllowedDay(monthKey) {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) throw new Error(`Invalid month key: ${monthKey}`);
  const dim = daysInMonth(monthKey);
  const day = Math.max(1, dim - MONTH_END_BUFFER_DAYS);
  return `${parsed.year}-${String(parsed.monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function ymdFromIsoOrDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const isoDay = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (isoDay) return isoDay[1];
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dateInMonth(ymd, monthKey) {
  return typeof ymd === "string" && ymd.startsWith(`${monthKey}-`);
}
