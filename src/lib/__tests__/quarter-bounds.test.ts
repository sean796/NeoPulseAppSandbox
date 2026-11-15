import { describe, expect, it } from "vitest";
import {
  buildDashboardEditorialMonthOptions,
  formatDashboardEditorialMonthShort,
  formatQuarterLabel,
  getDefaultDashboardEditorialMonthKey,
  getEditorialCountsRange,
  getLocalDayKey,
  getLocalCalendarMonthAfterBeforeForMonthKey,
  getLocalQuarterAfterBefore,
  getLocalQuarterStartEnd,
  parseQuarterLabelToQuarterYear,
  parseLocalYmdToMidnight,
  resolveEditorialCountsRangeForDashboard,
  staggerPublishDatesAcrossQuarter,
  staggerPublishDatesAcrossRange,
} from "../quarter-bounds";

describe("getLocalQuarterAfterBefore", () => {
  it("places May in Q2 of the same calendar year", () => {
    const r = getLocalQuarterAfterBefore(new Date(2026, 4, 8, 15, 30, 0));
    expect(r.quarter).toBe(2);
    expect(r.year).toBe(2026);
    expect(new Date(r.after) < new Date(r.before)).toBe(true);
    const startLocal = new Date(r.after);
    expect(startLocal.getFullYear()).toBe(2026);
    expect(startLocal.getMonth()).toBe(3);
    expect(startLocal.getDate()).toBe(1);
  });

  it("places February in Q1", () => {
    const r = getLocalQuarterAfterBefore(new Date(2026, 1, 14));
    expect(r.quarter).toBe(1);
    expect(formatQuarterLabel(r.quarter, r.year)).toBe("Q1 2026");
  });

  it("places November in Q4", () => {
    const r = getLocalQuarterAfterBefore(new Date(2026, 10, 1));
    expect(r.quarter).toBe(4);
    const nextStart = new Date(r.before);
    expect(nextStart.getFullYear()).toBe(2027);
    expect(nextStart.getMonth()).toBe(0);
  });

  it("uses a three-month span between after and before", () => {
    const r = getLocalQuarterAfterBefore(new Date(2025, 7, 20));
    const msPerDay = 86400000;
    const spanDays = Math.round((new Date(r.before).getTime() - new Date(r.after).getTime()) / msPerDay);
    /** ~92 days depending on daylight boundaries; calendar quarter length is constant in local wall time */
    expect(spanDays).toBeGreaterThanOrEqual(89);
    expect(spanDays).toBeLessThanOrEqual(92);
  });
});

describe("getLocalDayKey", () => {
  it("pads month and day", () => {
    expect(getLocalDayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(getLocalDayKey(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("parseQuarterLabelToQuarterYear / getLocalQuarterStartEnd", () => {
  it("parses Q1 2026 and bounds January through March", () => {
    expect(parseQuarterLabelToQuarterYear("Q1 2026")).toEqual({ quarter: 1, year: 2026 });
    const { start, endExclusive } = getLocalQuarterStartEnd(1, 2026);
    expect(start.getMonth()).toBe(0);
    expect(endExclusive.getMonth()).toBe(3);
    expect(endExclusive.getDate()).toBe(1);
  });

  it("returns null for invalid labels", () => {
    expect(parseQuarterLabelToQuarterYear("")).toBeNull();
    expect(parseQuarterLabelToQuarterYear("2026 Q1")).toBeNull();
  });
});

describe("getEditorialCountsRange", () => {
  it("uses calendar quarter when anchor is unset", () => {
    const now = new Date(2026, 4, 10);
    const r = getEditorialCountsRange(undefined, now);
    expect(r.mode).toBe("quarter");
    expect(r.quarterLabel).toBe("Q2 2026");
    expect(new Date(r.before).getTime()).toBeGreaterThan(new Date(r.after).getTime());
  });

  it("uses rolling windows from anchor", () => {
    const now = new Date(2026, 4, 10);
    const r = getEditorialCountsRange("2026-01-15", now);
    expect(r.mode).toBe("rolling");
    expect(r.quarterLabel).toMatch(/Apr/);
    expect(r.quarterLabel).toMatch(/Jul/);
    const start = new Date(r.after);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(3);
    expect(start.getDate()).toBe(15);
  });

  it("when now is before anchor uses first window from anchor", () => {
    const now = new Date(2026, 0, 5);
    const r = getEditorialCountsRange("2026-02-01", now);
    expect(r.mode).toBe("rolling");
    expect(new Date(r.after).getTime()).toBe(new Date(2026, 1, 1, 0, 0, 0, 0).getTime());
    expect(new Date(r.before).getTime()).toBe(new Date(2026, 4, 1, 0, 0, 0, 0).getTime());
  });

  it("falls back to quarter for invalid YMD", () => {
    const now = new Date(2026, 4, 10);
    const r = getEditorialCountsRange("not-a-date", now);
    expect(r.mode).toBe("quarter");
    expect(r.quarterLabel).toBe("Q2 2026");
  });
});

describe("parseLocalYmdToMidnight", () => {
  it("returns null for impossible calendar dates", () => {
    expect(parseLocalYmdToMidnight("2026-02-31")).toBeNull();
  });
});

describe("staggerPublishDatesAcrossRange", () => {
  it("mirrors quarter stagger for an equivalent range", () => {
    const fixedNow = new Date(2026, 0, 10, 12, 0, 0);
    const start = new Date(2026, 0, 1, 0, 0, 0, 0);
    const endExclusive = new Date(2026, 3, 1, 0, 0, 0, 0);
    const a = staggerPublishDatesAcrossRange({
      rowCount: 3,
      rangeStart: start,
      rangeEndExclusive: endExclusive,
      now: fixedNow,
    });
    const b = staggerPublishDatesAcrossQuarter({
      rowCount: 3,
      quarterLabel: "Q1 2026",
      now: fixedNow,
    });
    expect(a).toEqual(b);
  });
});

describe("staggerPublishDatesAcrossQuarter", () => {
  it("returns empty for zero rows", () => {
    expect(staggerPublishDatesAcrossQuarter({ rowCount: 0, quarterLabel: "Q1 2026" })).toEqual([]);
  });

  it("spreads dates across quarter window from now", () => {
    const fixedNow = new Date(2026, 0, 10, 12, 0, 0);
    const dates = staggerPublishDatesAcrossQuarter({
      rowCount: 3,
      quarterLabel: "Q1 2026",
      now: fixedNow,
    });
    expect(dates).toHaveLength(3);
    expect(dates[0]).toBe("2026-01-10");
    expect(dates[2]).toBe("2026-03-31");
    expect(dates[0] <= dates[1]).toBe(true);
    expect(dates[1] <= dates[2]).toBe(true);
  });
});

describe("dashboard editorial month default", () => {
  it("defaults to next calendar month", () => {
    const now = new Date(2026, 8, 15);
    expect(getDefaultDashboardEditorialMonthKey(now)).toBe("2026-10");
    const range = resolveEditorialCountsRangeForDashboard(undefined, "2026-10", now);
    expect(range.mode).toBe("month");
    expect(range.quarterLabel).toBe(getLocalCalendarMonthAfterBeforeForMonthKey("2026-10").label);
  });

  it("formats dashboard month pill as 01 Jan", () => {
    expect(formatDashboardEditorialMonthShort("2026-01")).toBe("01 Jan");
    expect(formatDashboardEditorialMonthShort("2026-10")).toBe("10 Oct");
    expect(formatDashboardEditorialMonthShort("2026-12")).toBe("12 Dec");
  });

  it("lists the twelve months of the year as 01 Jan through 12 Dec", () => {
    const options = buildDashboardEditorialMonthOptions(new Date(2026, 10, 15));
    expect(options).toHaveLength(12);
    expect(options[0]).toEqual({ key: "2026-01", label: "01 Jan" });
    expect(options[11]).toEqual({ key: "2026-12", label: "12 Dec" });
  });
});
