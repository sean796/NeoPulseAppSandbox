/** Fetch next-month blog counts and occupied dates via Pulse API. */

import { monthBounds, nextMonthKey, parseMonthKey, ymdFromIsoOrDate } from "./calendar.mjs";

export function resolveApiBase(flags = {}) {
  if (typeof flags["api-base"] === "string" && flags["api-base"].trim()) {
    return flags["api-base"].trim().replace(/\/+$/, "");
  }
  const fromEnv = process.env.NEO_PULSE_API_BASE?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return "http://127.0.0.1:8080";
}

async function postJson(apiBase, path, body) {
  const url = `${apiBase}/api${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function authBody(site) {
  return {
    siteUrl: String(site.siteUrl ?? ""),
    username: String(site.username ?? ""),
    appPassword: String(site.appPassword ?? ""),
  };
}

/**
 * @returns {Promise<{ published: number, scheduled: number, occupiedDates: string[] }>}
 */
export async function fetchNextMonthBlogStats(site, flags = {}) {
  const apiBase = resolveApiBase(flags);
  const monthKey = typeof flags.month === "string" && flags.month.trim()
    ? flags.month.trim()
    : nextMonthKey();
  const bounds = monthBounds(monthKey);
  const parsed = parseMonthKey(monthKey);
  if (!parsed) {
    const err = new Error(`Invalid month: ${monthKey}`);
    err.code = "USAGE";
    throw err;
  }

  const countsRes = await postJson(apiBase, "/wordpress/get-quarter-editorial-counts", {
    ...authBody(site),
    after: bounds.after,
    before: bounds.before,
  });

  if (!countsRes.ok || !countsRes.data?.ok) {
    const err = new Error(
      countsRes.data?.error || `Counts HTTP ${countsRes.status}`,
    );
    err.code = "COUNTS";
    throw err;
  }

  const published = countsRes.data.postsPublished;
  const scheduled = countsRes.data.postsScheduled;
  if (typeof published !== "number" || typeof scheduled !== "number") {
    const err = new Error("Post counts are unavailable for this site.");
    err.code = "COUNTS";
    throw err;
  }

  const occupied = new Set();

  // Next-month occupancy is almost always future/scheduled posts.
  const scheduledRes = await postJson(apiBase, "/wordpress/get-scheduled-posts", {
    ...authBody(site),
    month: parsed.monthIndex,
    year: parsed.year,
  });
  if (scheduledRes.ok && Array.isArray(scheduledRes.data?.posts)) {
    for (const post of scheduledRes.data.posts) {
      const ymd = ymdFromIsoOrDate(post.date_gmt ?? post.date);
      if (ymd && ymd.startsWith(monthKey)) occupied.add(ymd);
    }
  }

  return {
    published,
    scheduled,
    occupiedDates: [...occupied].sort(),
    monthKey,
  };
}
