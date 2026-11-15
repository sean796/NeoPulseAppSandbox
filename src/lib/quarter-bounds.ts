/**
 * Local-calendar quarter boundaries as ISO instants for WordPress REST `after` / `before`.
 */

export type CalendarQuarter = 1 | 2 | 3 | 4;

export interface LocalQuarterRange {
  quarter: CalendarQuarter;
  year: number;
  after: string;
  before: string;
}

/**
 * Calendar quarter containing `now`, using the runtime's local timezone.
 * `after` is start of first month of quarter; `before` is start of next quarter (exclusive).
 */
export function getLocalQuarterAfterBefore(now: Date): LocalQuarterRange {
  const y = now.getFullYear();
  const m = now.getMonth();
  const q = Math.floor(m / 3) as 0 | 1 | 2 | 3;
  const startMonth = q * 3;
  const start = new Date(y, startMonth, 1, 0, 0, 0, 0);
  const end = new Date(y, startMonth + 3, 1, 0, 0, 0, 0);
  return {
    quarter: (q + 1) as CalendarQuarter,
    year: y,
    after: start.toISOString(),
    before: end.toISOString(),
  };
}

export function getLocalDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local calendar month bounds for WordPress REST `after` / `before`. */
export function getLocalCalendarMonthAfterBefore(now: Date): { after: string; before: string; label: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  return getLocalCalendarMonthAfterBeforeForParts(y, m);
}

export function defaultLocalCalendarMonthKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** First day of the next calendar month (local), as `YYYY-MM`. */
export function getDefaultDashboardEditorialMonthKey(now = new Date()): string {
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return formatLocalCalendarMonthKey(next);
}

const DASHBOARD_MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Property dashboard month label, e.g. `09 Sep` for `2026-09`. */
export function formatDashboardEditorialMonthShort(monthKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  if (!match) return monthKey.trim();
  const monthIndex = Number(match[2]) - 1;
  const name = DASHBOARD_MONTH_NAMES[monthIndex];
  if (!name) return monthKey.trim();
  return `${match[2]} ${name}`;
}

/** The twelve months of the current year. Fixed list, not a scrolling history. */
export function buildDashboardEditorialMonthOptions(now = new Date()): Array<{ key: string; label: string }> {
  const year = now.getFullYear();
  return DASHBOARD_MONTH_NAMES.map((name, index) => {
    const month = String(index + 1).padStart(2, "0");
    return { key: `${year}-${month}`, label: `${month} ${name}` };
  });
}

/** Dashboard property-row counts always use the selected calendar month (`01 Jan` picker). */
export function resolveEditorialCountsRangeForDashboard(
  _editorialCountsPeriodStartYmd: string | undefined | null,
  selectedMonthKey: string,
  _now: Date,
): EditorialCountsRange {
  const month = getLocalCalendarMonthAfterBeforeForMonthKey(selectedMonthKey);
  return {
    mode: "month",
    after: month.after,
    before: month.before,
    quarterLabel: month.label,
  };
}

export function formatLocalCalendarMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function parseLocalCalendarMonthKey(monthKey: string, fallback = new Date()): Date {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  if (!match) return new Date(fallback.getFullYear(), fallback.getMonth(), 1);
  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
}

/** `monthKey` is YYYY-MM in local calendar. */
export function getLocalCalendarMonthAfterBeforeForMonthKey(monthKey: string): {
  after: string;
  before: string;
  label: string;
} {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey.trim());
  if (!match) return getLocalCalendarMonthAfterBefore(new Date());
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isInteger(year) || monthIndex < 0 || monthIndex > 11) {
    return getLocalCalendarMonthAfterBefore(new Date());
  }
  return getLocalCalendarMonthAfterBeforeForParts(year, monthIndex);
}

function getLocalCalendarMonthAfterBeforeForParts(year: number, monthIndex: number): {
  after: string;
  before: string;
  label: string;
} {
  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const endExclusive = new Date(year, monthIndex + 1, 1, 0, 0, 0, 0);
  const monthLabel = start.toLocaleString("en-US", { month: "long", year: "numeric" });
  return {
    after: start.toISOString(),
    before: endExclusive.toISOString(),
    label: monthLabel,
  };
}

export function formatQuarterLabel(quarter: CalendarQuarter, year: number): string {
  return `Q${quarter} ${year}`;
}

/** Parse labels like "Q2 2026" from {@link formatQuarterLabel}. */
export function parseQuarterLabelToQuarterYear(label: string): { quarter: CalendarQuarter; year: number } | null {
  const m = label.trim().match(/^Q([1-4])\s+(\d{4})$/i);
  if (!m) return null;
  const quarter = Number(m[1]) as CalendarQuarter;
  const year = Number(m[2]);
  if (!Number.isInteger(year) || year < 1900 || year > 2100) return null;
  return { quarter, year };
}

/**
 * Local midnight bounds: start = first day of quarter; endExclusive = first day of next quarter.
 */
export function getLocalQuarterStartEnd(
  quarter: CalendarQuarter,
  year: number,
): { start: Date; endExclusive: Date } {
  const startMonth = (quarter - 1) * 3;
  const start = new Date(year, startMonth, 1, 0, 0, 0, 0);
  const endExclusive = new Date(year, startMonth + 3, 1, 0, 0, 0, 0);
  return { start, endExclusive };
}

const MS_PER_DAY = 86400000;

export type EditorialCountsRangeMode = "quarter" | "rolling" | "month";

export interface EditorialCountsRange {
  mode: EditorialCountsRangeMode;
  after: string;
  before: string;
  /** Tile label: `Qn yyyy` or short rolling range (e.g. `Jun–Aug '26`). */
  quarterLabel: string;
}

function addCalendarMonthsLocal(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  out.setMonth(out.getMonth() + months);
  return out;
}

/** Parse `YYYY-MM-DD` into local midnight, or null if invalid. */
export function parseLocalYmdToMidnight(ymd: string): Date | null {
  const t = ymd.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isInteger(y) || !Number.isInteger(mo) || !Number.isInteger(day)) return null;
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return null;
  const d = new Date(y, mo - 1, day, 0, 0, 0, 0);
  if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== day) return null;
  return d;
}

function formatRollingCountsLabel(windowStart: Date, windowEndExclusive: Date): string {
  const lastInclusive = new Date(windowEndExclusive.getTime() - MS_PER_DAY);
  const y1 = windowStart.getFullYear();
  const y2 = lastInclusive.getFullYear();
  const m1 = windowStart.toLocaleString("en-US", { month: "short" });
  const m2 = lastInclusive.toLocaleString("en-US", { month: "short" });
  if (y1 === y2) {
    return `${m1}–${m2} '${String(y1).slice(-2)}`;
  }
  return `${m1} '${String(y1).slice(-2)}–${m2} '${String(y2).slice(-2)}`;
}

function getRollingThreeMonthRangeFromAnchor(anchorLocal: Date, now: Date): EditorialCountsRange {
  let windowStart = new Date(
    anchorLocal.getFullYear(),
    anchorLocal.getMonth(),
    anchorLocal.getDate(),
    0,
    0,
    0,
    0,
  );
  if (now.getTime() < windowStart.getTime()) {
    const endExclusive = addCalendarMonthsLocal(windowStart, 3);
    return {
      mode: "rolling",
      after: windowStart.toISOString(),
      before: endExclusive.toISOString(),
      quarterLabel: formatRollingCountsLabel(windowStart, endExclusive),
    };
  }
  for (;;) {
    const endExclusive = addCalendarMonthsLocal(windowStart, 3);
    if (now.getTime() < endExclusive.getTime()) {
      return {
        mode: "rolling",
        after: windowStart.toISOString(),
        before: endExclusive.toISOString(),
        quarterLabel: formatRollingCountsLabel(windowStart, endExclusive),
      };
    }
    windowStart = endExclusive;
  }
}

/**
 * Date range and display label for editorial counts: calendar quarter, or 3-month windows from
 * {@link editorialCountsPeriodStartYmd} when set and valid (`YYYY-MM-DD`, local midnight anchor).
 */
export function getEditorialCountsRange(
  editorialCountsPeriodStartYmd: string | undefined | null,
  now: Date,
): EditorialCountsRange {
  const raw = editorialCountsPeriodStartYmd?.trim();
  if (raw) {
    const anchor = parseLocalYmdToMidnight(raw);
    if (anchor) {
      return getRollingThreeMonthRangeFromAnchor(anchor, now);
    }
  }
  const b = getLocalQuarterAfterBefore(now);
  return {
    mode: "quarter",
    after: b.after,
    before: b.before,
    quarterLabel: formatQuarterLabel(b.quarter, b.year),
  };
}

/**
 * Same stagger logic as {@link staggerPublishDatesAcrossQuarter} for an arbitrary local range
 * `[rangeStart, rangeEndExclusive)`.
 */
export function staggerPublishDatesAcrossRange(args: {
  rowCount: number;
  rangeStart: Date;
  rangeEndExclusive: Date;
  now?: Date;
}): string[] {
  const { rowCount, rangeStart, rangeEndExclusive, now = new Date() } = args;
  if (rowCount <= 0) return [];
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const windowStartMs =
    rangeStart.getTime() > todayStart.getTime() ? rangeStart.getTime() : todayStart.getTime();
  const lastInclusive = new Date(rangeEndExclusive.getTime() - MS_PER_DAY);

  if (windowStartMs > lastInclusive.getTime()) {
    const fallback = getLocalDayKey(lastInclusive);
    return Array(rowCount).fill(fallback);
  }

  const endMs = lastInclusive.getTime();
  const out: string[] = [];
  for (let i = 0; i < rowCount; i++) {
    const t =
      rowCount === 1
        ? windowStartMs
        : windowStartMs + (i / (rowCount - 1)) * (endMs - windowStartMs);
    out.push(getLocalDayKey(new Date(Math.round(t))));
  }
  return out;
}

/**
 * Spread {@link rowCount} calendar dates (`YYYY-MM-DD`, local wall clock) across the overlap of
 * [today, quarter end] with the quarter from {@link quarterLabel}. Used for bulk CSV `publish_date_gmt`
 * date-only cells (combined with bulk Start Time UTC at upload).
 */
export function staggerPublishDatesAcrossQuarter(args: {
  rowCount: number;
  quarterLabel: string;
  now?: Date;
}): string[] {
  const { rowCount, quarterLabel, now = new Date() } = args;
  if (rowCount <= 0) return [];
  const parsed = parseQuarterLabelToQuarterYear(quarterLabel);
  if (!parsed) return Array(rowCount).fill("");

  const { start, endExclusive } = getLocalQuarterStartEnd(parsed.quarter, parsed.year);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const windowStartMs = start.getTime() > todayStart.getTime() ? start.getTime() : todayStart.getTime();
  const lastInclusive = new Date(endExclusive.getTime() - MS_PER_DAY);

  if (windowStartMs > lastInclusive.getTime()) {
    const fallback = getLocalDayKey(lastInclusive);
    return Array(rowCount).fill(fallback);
  }

  const endMs = lastInclusive.getTime();
  const out: string[] = [];
  for (let i = 0; i < rowCount; i++) {
    const t =
      rowCount === 1
        ? windowStartMs
        : windowStartMs + (i / (rowCount - 1)) * (endMs - windowStartMs);
    out.push(getLocalDayKey(new Date(Math.round(t))));
  }
  return out;
}
