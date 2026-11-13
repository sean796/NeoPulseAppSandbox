import { BACKEND_API_BASE } from "./connection";
import type { QuarterEditorialCountsResult } from "./types";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

export type EditorialMonthRange = { after: string; before: string };

export type EditorialMonthBucket = {
  after: string;
  before: string;
  postsPublished: number;
  postsScheduled: number;
  entityPublished: number;
  entityScheduled: number;
  entityConfigured: boolean;
  entityCountsAvailable: boolean;
  entityCollection?: string;
};

export type AllMonthsEditorialCountsResult =
  | { ok: true; months: EditorialMonthBucket[]; entityCollection?: string }
  | { ok: false; error: string };

function emptyFail(error: string): QuarterEditorialCountsResult {
  return {
    ok: false,
    postsPublished: null,
    postsScheduled: null,
    entityPublished: null,
    entityScheduled: null,
    entityConfigured: false,
    entityCountsAvailable: false,
    published: null,
    scheduled: null,
    error,
  };
}

export async function fetchQuarterEditorialCounts(payload: {
  siteUrl: string;
  username: string;
  appPassword: string;
  after: string;
  before: string;
  entitySitemapUrl?: string;
  postSitemapUrl?: string;
  manualEndpoint?: string;
  childSitemaps?: string[];
  sitemapEndpoints?: Record<string, string>;
}): Promise<QuarterEditorialCountsResult> {
  const url = `${BACKEND_API_BASE}/api/wordpress/get-quarter-editorial-counts`;

  const response = await fetch(url, {
    method: "POST",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      siteUrl: payload.siteUrl,
      username: payload.username,
      appPassword: payload.appPassword,
      after: payload.after,
      before: payload.before,
      entitySitemapUrl: payload.entitySitemapUrl,
      postSitemapUrl: payload.postSitemapUrl,
      manualEndpoint: payload.manualEndpoint,
      childSitemaps: payload.childSitemaps,
      sitemapEndpoints: payload.sitemapEndpoints,
    }),
  });

  let data: QuarterEditorialCountsResult;
  try {
    data = (await response.json()) as QuarterEditorialCountsResult;
  } catch {
    data = emptyFail(`HTTP ${response.status}`);
  }

  if (!response.ok || !data.ok) {
    return emptyFail(data.error || `HTTP ${response.status}`);
  }

  return data;
}

/** One Neo MCP scrape per site: every month range in a single request. */
export async function fetchAllMonthsEditorialCounts(payload: {
  siteUrl: string;
  username: string;
  appPassword: string;
  ranges: EditorialMonthRange[];
  entitySitemapUrl?: string;
  postSitemapUrl?: string;
  manualEndpoint?: string;
  childSitemaps?: string[];
  sitemapEndpoints?: Record<string, string>;
}): Promise<AllMonthsEditorialCountsResult> {
  if (payload.ranges.length === 0) {
    return { ok: false, error: "No month ranges" };
  }

  const url = `${BACKEND_API_BASE}/api/wordpress/get-quarter-editorial-counts`;
  const first = payload.ranges[0]!;

  const response = await fetch(url, {
    method: "POST",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      siteUrl: payload.siteUrl,
      username: payload.username,
      appPassword: payload.appPassword,
      after: first.after,
      before: first.before,
      ranges: payload.ranges,
      entitySitemapUrl: payload.entitySitemapUrl,
      postSitemapUrl: payload.postSitemapUrl,
      manualEndpoint: payload.manualEndpoint,
      childSitemaps: payload.childSitemaps,
      sitemapEndpoints: payload.sitemapEndpoints,
    }),
  });

  let data: QuarterEditorialCountsResult & {
    months?: Array<Record<string, unknown>>;
    entityCollection?: string;
  };
  try {
    data = (await response.json()) as typeof data;
  } catch {
    return { ok: false, error: `HTTP ${response.status}` };
  }

  if (!response.ok || !data.ok) {
    return { ok: false, error: data.error || `HTTP ${response.status}` };
  }

  const rawMonths = Array.isArray(data.months) ? data.months : [];
  const months: EditorialMonthBucket[] = [];
  for (const m of rawMonths) {
    if (
      typeof m.after !== "string" ||
      typeof m.before !== "string" ||
      typeof m.postsPublished !== "number" ||
      typeof m.postsScheduled !== "number"
    ) {
      continue;
    }
    const eco = Boolean(m.entityCountsAvailable);
    months.push({
      after: m.after,
      before: m.before,
      postsPublished: m.postsPublished,
      postsScheduled: m.postsScheduled,
      entityPublished: typeof m.entityPublished === "number" ? m.entityPublished : 0,
      entityScheduled: typeof m.entityScheduled === "number" ? m.entityScheduled : 0,
      entityConfigured: Boolean(m.entityConfigured),
      entityCountsAvailable: eco,
      entityCollection:
        typeof data.entityCollection === "string"
          ? data.entityCollection
          : typeof m.entityCollection === "string"
            ? m.entityCollection
            : undefined,
    });
  }

  if (months.length === 0) {
    // Single-range legacy shape: synthesize one month from top-level fields.
    months.push({
      after: first.after,
      before: first.before,
      postsPublished: data.postsPublished ?? 0,
      postsScheduled: data.postsScheduled ?? 0,
      entityPublished: data.entityPublished ?? 0,
      entityScheduled: data.entityScheduled ?? 0,
      entityConfigured: Boolean(data.entityConfigured),
      entityCountsAvailable: Boolean(data.entityCountsAvailable),
      entityCollection: data.entityCollection,
    });
  }

  return { ok: true, months, entityCollection: data.entityCollection };
}
