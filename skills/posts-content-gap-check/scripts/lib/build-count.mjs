/** Pure count result builder (testable without WordPress). */

import { lastAllowedDay, nextMonthKey, ymdFromIsoOrDate } from "./calendar.mjs";
import { blogsPerMonthForSite, publishTimeHintForSite } from "./quota.mjs";

/**
 * @param {object} site
 * @param {{ published: number, scheduled: number, occupiedDates?: string[] }} stats
 * @param {string} [monthKey]
 */
export function buildCountResult(site, stats, monthKey = nextMonthKey()) {
  const quota = blogsPerMonthForSite(site);
  if (quota == null) {
    const err = new Error(
      `${site?.name?.trim() || "This site"} has no saved blog quota on Integrations.`,
    );
    err.code = "SITE";
    throw err;
  }
  const published = Number(stats.published);
  const scheduled = Number(stats.scheduled);
  if (!Number.isFinite(published) || !Number.isFinite(scheduled)) {
    const err = new Error("Post counts are unavailable for this site.");
    err.code = "COUNTS";
    throw err;
  }
  const current = Math.floor(published) + Math.floor(scheduled);
  const gap = Math.max(0, quota - current);
  const occupied = Array.isArray(stats.occupiedDates)
    ? [...new Set(stats.occupiedDates.map((d) => ymdFromIsoOrDate(d)).filter(Boolean))].sort()
    : [];

  return {
    siteId: String(site.id ?? ""),
    siteName: String(site.name ?? ""),
    month: monthKey,
    published: Math.floor(published),
    scheduled: Math.floor(scheduled),
    current,
    quota,
    gap,
    goalMet: gap === 0,
    occupiedDates: occupied,
    lastAllowedDay: lastAllowedDay(monthKey),
    publishTimeHint: publishTimeHintForSite(site),
  };
}
