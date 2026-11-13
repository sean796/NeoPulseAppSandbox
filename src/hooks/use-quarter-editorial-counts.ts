import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import {
  buildDashboardEditorialMonthOptions,
  getDefaultDashboardEditorialMonthKey,
  resolveEditorialCountsRangeForDashboard,
  getLocalDayKey,
  type EditorialCountsRange,
} from "@/lib/quarter-bounds";
import { isEntitySitemapDisabled } from "@/lib/entity-endpoint-extractor";
import { fetchAllMonthsEditorialCounts } from "@/lib/wordpress-api/post-quarter-counts";
import type { QuarterEditorialCountsResult, QuarterEditorialTileStats } from "@/lib/wordpress-api/types";

const CACHE_PREFIX = "neo-pulse-quarter-editorial:v3";
/** Parallel sites — each site is one Neo MCP scrape that returns every month. */
const FETCH_CONCURRENCY = 6;

type CachedQuarterPayload = Pick<
  QuarterEditorialCountsResult,
  | "postsPublished"
  | "postsScheduled"
  | "entityPublished"
  | "entityScheduled"
  | "entityConfigured"
  | "entityCountsAvailable"
  | "entityCollection"
>;

function cacheKey(siteId: string, after: string, before: string): string {
  return `${CACHE_PREFIX}:${siteId}:${after}:${before}`;
}

function parseCached(raw: string): CachedQuarterPayload | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof o.postsPublished !== "number" ||
      typeof o.postsScheduled !== "number" ||
      typeof o.entityConfigured !== "boolean" ||
      typeof o.entityCountsAvailable !== "boolean"
    ) {
      return null;
    }
    if (o.entityCountsAvailable) {
      if (typeof o.entityPublished !== "number" || typeof o.entityScheduled !== "number") {
        return null;
      }
    }
    return {
      postsPublished: o.postsPublished,
      postsScheduled: o.postsScheduled,
      entityPublished:
        typeof o.entityPublished === "number" ? o.entityPublished : null,
      entityScheduled:
        typeof o.entityScheduled === "number" ? o.entityScheduled : null,
      entityConfigured: o.entityConfigured,
      entityCountsAvailable: o.entityCountsAvailable,
      entityCollection:
        typeof o.entityCollection === "string" ? o.entityCollection : undefined,
    };
  } catch {
    /* ignore */
  }
  return null;
}

function readCache(
  siteId: string,
  after: string,
  before: string,
): CachedQuarterPayload | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(siteId, after, before));
    if (!raw) return null;
    return parseCached(raw);
  } catch {
    return null;
  }
}

function writeCache(siteId: string, after: string, before: string, payload: CachedQuarterPayload): void {
  try {
    sessionStorage.setItem(cacheKey(siteId, after, before), JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

function clearSiteCacheForRange(siteId: string, after: string, before: string): void {
  try {
    sessionStorage.removeItem(cacheKey(siteId, after, before));
  } catch {
    /* ignore */
  }
}

function resultToTilePartial(
  r: CachedQuarterPayload,
  range: EditorialCountsRange,
): Omit<QuarterEditorialTileStats, "loading"> {
  return {
    quarterLabel: range.quarterLabel,
    errorTitle: undefined,
    postsLive: typeof r.postsPublished === "number" ? r.postsPublished : null,
    postsScheduled: typeof r.postsScheduled === "number" ? r.postsScheduled : null,
    entityLive:
      r.entityCountsAvailable && typeof r.entityPublished === "number"
        ? r.entityPublished
        : null,
    entityScheduled:
      r.entityCountsAvailable && typeof r.entityScheduled === "number"
        ? r.entityScheduled
        : null,
    entityConfigured: Boolean(r.entityConfigured),
    entityCountsAvailable: Boolean(r.entityCountsAvailable),
    entityCollectionLabel: r.entityCollection?.trim(),
    countsPeriodAfterIso: range.after,
    countsPeriodEndExclusiveIso: range.before,
    countsPeriodMode: range.mode,
  };
}

function siteHasCredentials(s: WordPressSite): boolean {
  return Boolean(s.siteUrl?.trim() && s.username?.trim() && s.appPassword?.trim());
}

function resolvePostSitemapUrl(site: WordPressSite): string | undefined {
  const children = site.sitemaps?.childSitemaps ?? [];
  for (const u of children) {
    const url = u?.trim();
    if (url && /post-sitemap(?:\d+)?\.xml/i.test(url)) return url;
  }
  const endpoints = site.sitemaps?.endpoints ?? {};
  for (const [url, role] of Object.entries(endpoints)) {
    if (role?.toLowerCase() === "posts" && url.trim()) return url.trim();
  }
  return undefined;
}

function sitemapFetchFields(site: WordPressSite): {
  entitySitemapUrl?: string;
  postSitemapUrl?: string;
  manualEndpoint?: string;
  childSitemaps?: string[];
  sitemapEndpoints?: Record<string, string>;
} {
  return {
    entitySitemapUrl: isEntitySitemapDisabled(site) ? undefined : site.entitySitemapUrl,
    postSitemapUrl: resolvePostSitemapUrl(site),
    manualEndpoint: site.manualEndpoint,
    childSitemaps: site.sitemaps?.childSitemaps,
    sitemapEndpoints: site.sitemaps?.endpoints,
  };
}

/** SAP (`service-area`) is always counted server-side, so the entity slot is always configured. */
function loadingPlaceholderForSite(_site: WordPressSite, range: EditorialCountsRange): QuarterEditorialTileStats {
  return {
    quarterLabel: range.quarterLabel,
    loading: true,
    postsLive: 0,
    postsScheduled: 0,
    entityLive: 0,
    entityScheduled: 0,
    entityConfigured: true,
    entityCountsAvailable: true,
    countsPeriodAfterIso: range.after,
    countsPeriodEndExclusiveIso: range.before,
    countsPeriodMode: range.mode,
  };
}

function canPreserveCountsOnError(tile: QuarterEditorialTileStats | undefined): boolean {
  return Boolean(
    tile &&
      typeof tile.postsLive === "number" &&
      typeof tile.postsScheduled === "number",
  );
}

/** Keep showing prior month totals while refetching when any live/scheduled count was > 0 for the same window. */
function shouldPreserveQuarterTileDuringRefresh(
  old: QuarterEditorialTileStats | undefined,
  range: EditorialCountsRange,
): boolean {
  if (!old) return false;
  if (old.countsPeriodAfterIso !== range.after || old.countsPeriodEndExclusiveIso !== range.before) {
    return false;
  }
  const pl = old.postsLive;
  const ps = old.postsScheduled;
  if (typeof pl === "number" && Number.isFinite(pl) && pl > 0) return true;
  if (typeof ps === "number" && Number.isFinite(ps) && ps > 0) return true;
  if (old.entityConfigured && old.entityCountsAvailable) {
    const el = old.entityLive;
    const es = old.entityScheduled;
    if (typeof el === "number" && Number.isFinite(el) && el > 0) return true;
    if (typeof es === "number" && Number.isFinite(es) && es > 0) return true;
  }
  return false;
}

/** Tiles for a manual refresh: keep prior non-zero totals visible (loading), else a loading placeholder; drop sites no longer listed. */
export function buildQuarterTilesForRefresh(
  list: WordPressSite[],
  prev: Record<string, QuarterEditorialTileStats>,
  resolveRange: (site: WordPressSite, now: Date) => EditorialCountsRange,
  now: Date,
): Record<string, QuarterEditorialTileStats> {
  const next: Record<string, QuarterEditorialTileStats> = { ...prev };
  for (const s of list) {
    const range = resolveRange(s, now);
    const old = prev[s.id];
    next[s.id] = shouldPreserveQuarterTileDuringRefresh(old, range)
      ? { ...old!, loading: true, errorTitle: undefined }
      : loadingPlaceholderForSite(s, range);
  }
  const keep = new Set(list.map((s) => s.id));
  for (const id of Object.keys(next)) {
    if (!keep.has(id)) delete next[id];
  }
  return next;
}

async function runPool<T>(jobs: T[], concurrency: number, worker: (job: T) => Promise<void>): Promise<void> {
  if (jobs.length === 0) return;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      const idx = cursor;
      cursor += 1;
      const job = jobs[idx];
      if (job === undefined) break;
      await worker(job);
    }
  });
  await Promise.all(workers);
}

export function useQuarterEditorialCounts(sites: WordPressSite[]): {
  bySiteId: Record<string, QuarterEditorialTileStats>;
  dayKey: string;
  refreshAllQuarterCounts: () => Promise<void>;
  isRefreshingAllQuarterCounts: boolean;
  /** True from refresh/boot network start until every site×month job settles — keep splash on all rows. */
  countsBatchPending: boolean;
  selectedMonthKey: string;
  setSelectedMonthKey: (monthKey: string) => void;
  monthOptions: Array<{ key: string; label: string }>;
} {
  const [tick, setTick] = useState(0);
  const [isRefreshingAllQuarterCounts, setIsRefreshingAllQuarterCounts] = useState(false);
  const [countsBatchPending, setCountsBatchPending] = useState(false);
  const [selectedMonthKey, setSelectedMonthKeyState] = useState(() =>
    getDefaultDashboardEditorialMonthKey(),
  );
  const monthOptions = useMemo(() => {
    void tick;
    return buildDashboardEditorialMonthOptions(new Date());
  }, [tick]);

  const dayKey = useMemo(() => {
    void tick;
    return getLocalDayKey(new Date());
  }, [tick]);
  const dayKeyRef = useRef(dayKey);
  dayKeyRef.current = dayKey;

  useEffect(() => {
    const now = Date.now();
    const nextMid = new Date();
    nextMid.setDate(nextMid.getDate() + 1);
    nextMid.setHours(0, 0, 0, 0);
    const ms = Math.max(5_000, nextMid.getTime() - now);
    const t = window.setTimeout(() => setTick((x) => x + 1), ms);
    return () => window.clearTimeout(t);
  }, [tick]);

  useEffect(() => {
    let last = dayKeyRef.current;
    const id = window.setInterval(() => {
      const nk = getLocalDayKey(new Date());
      if (nk !== last) {
        last = nk;
        setTick((x) => x + 1);
      }
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      const nk = getLocalDayKey(new Date());
      if (nk !== dayKeyRef.current) {
        setTick((x) => x + 1);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const bootstrapBySiteFromCache = useCallback(
    (list: WordPressSite[], monthKey: string): Record<string, QuarterEditorialTileStats> => {
      const out: Record<string, QuarterEditorialTileStats> = {};
      const now = new Date();
      for (const s of list) {
        const range = resolveEditorialCountsRangeForDashboard(
          s.editorialCountsPeriodStartYmd,
          monthKey,
          now,
        );
        const cached = readCache(s.id, range.after, range.before);
        if (cached) {
          out[s.id] = {
            loading: false,
            ...resultToTilePartial(cached, range),
          };
        } else {
          // No network until Refresh — show zeros, never an endless splash.
          out[s.id] = {
            quarterLabel: range.quarterLabel,
            loading: false,
            postsLive: 0,
            postsScheduled: 0,
            entityLive: 0,
            entityScheduled: 0,
            entityConfigured: true,
            entityCountsAvailable: true,
            countsPeriodAfterIso: range.after,
            countsPeriodEndExclusiveIso: range.before,
            countsPeriodMode: range.mode,
          };
        }
      }
      return out;
    },
    [],
  );

  const [bySiteId, setBySiteId] = useState<Record<string, QuarterEditorialTileStats>>(() => {
    const initialMonth = getDefaultDashboardEditorialMonthKey();
    const list = sites.filter(siteHasCredentials);
    return bootstrapBySiteFromCache(list, initialMonth);
  });
  const selectedMonthRef = useRef(selectedMonthKey);
  selectedMonthRef.current = selectedMonthKey;
  const sitesRef = useRef(sites);
  sitesRef.current = sites;
  const monthOptionsRef = useRef(monthOptions);
  monthOptionsRef.current = monthOptions;

  const sitesKey = sites
    .map(
      (s) =>
        `${s.id}:${s.editorialCountsPeriodStartYmd?.trim() ?? ""}:${siteHasCredentials(s) ? "1" : "0"}`,
    )
    .join(",");

  const resolveRangeForMonth = useCallback(
    (site: WordPressSite, monthKey: string, now: Date) =>
      resolveEditorialCountsRangeForDashboard(
        site.editorialCountsPeriodStartYmd,
        monthKey,
        now,
      ),
    [],
  );

  const resolveRange = useCallback(
    (site: WordPressSite, now: Date) =>
      resolveRangeForMonth(site, selectedMonthRef.current, now),
    [resolveRangeForMonth],
  );

  /** One Neo MCP scrape per site — every dashboard month stored locally. */
  const fetchSiteAllMonthsIntoCache = useCallback(
    async (site: WordPressSite, months: Array<{ key: string }>) => {
      const now = new Date();
      const ranges = months.map((m) => {
        const range = resolveRangeForMonth(site, m.key, now);
        return { after: range.after, before: range.before };
      });
      const result = await fetchAllMonthsEditorialCounts({
        siteUrl: site.siteUrl,
        username: site.username,
        appPassword: site.appPassword,
        ranges,
        ...sitemapFetchFields(site),
      });
      if (!result.ok) {
        throw new Error(result.error || "Could not load month counts.");
      }
      for (const bucket of result.months) {
        writeCache(site.id, bucket.after, bucket.before, {
          postsPublished: bucket.postsPublished,
          postsScheduled: bucket.postsScheduled,
          entityPublished: bucket.entityPublished,
          entityScheduled: bucket.entityScheduled,
          entityConfigured: bucket.entityConfigured,
          entityCountsAvailable: bucket.entityCountsAvailable,
          entityCollection: bucket.entityCollection ?? result.entityCollection,
        });
      }
    },
    [resolveRangeForMonth],
  );

  const applySelectedMonthFromCache = useCallback(
    (list: WordPressSite[], monthKey: string, errorsBySite?: Record<string, string>) => {
      const now = new Date();
      setBySiteId((prev) => {
        const next: Record<string, QuarterEditorialTileStats> = {};
        for (const s of list) {
          const range = resolveRangeForMonth(s, monthKey, now);
          const cached = readCache(s.id, range.after, range.before);
          const err = errorsBySite?.[s.id];
          if (cached) {
            next[s.id] = {
              loading: false,
              ...resultToTilePartial(cached, range),
              ...(err ? { errorTitle: err } : {}),
            };
          } else if (err && canPreserveCountsOnError(prev[s.id])) {
            next[s.id] = {
              ...prev[s.id]!,
              loading: false,
              errorTitle: err,
            };
          } else if (err) {
            next[s.id] = {
              quarterLabel: range.quarterLabel,
              loading: false,
              postsLive: null,
              postsScheduled: null,
              entityLive: null,
              entityScheduled: null,
              entityConfigured: true,
              entityCountsAvailable: false,
              countsPeriodAfterIso: range.after,
              countsPeriodEndExclusiveIso: range.before,
              countsPeriodMode: range.mode,
              errorTitle: err,
            };
          } else {
            next[s.id] = {
              quarterLabel: range.quarterLabel,
              loading: false,
              postsLive: 0,
              postsScheduled: 0,
              entityLive: 0,
              entityScheduled: 0,
              entityConfigured: true,
              entityCountsAvailable: true,
              countsPeriodAfterIso: range.after,
              countsPeriodEndExclusiveIso: range.before,
              countsPeriodMode: range.mode,
            };
          }
        }
        return next;
      });
    },
    [resolveRangeForMonth],
  );

  /**
   * Network: one scrape per site (all months), store all, then bind selected month.
   */
  const fetchAndStoreAllMonths = useCallback(
    async (list: WordPressSite[], months: Array<{ key: string }>) => {
      if (list.length === 0 || months.length === 0) return;

      const errorsBySite: Record<string, string> = {};
      await runPool(list, FETCH_CONCURRENCY, async (site) => {
        try {
          await fetchSiteAllMonthsIntoCache(site, months);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Could not load month counts.";
          errorsBySite[site.id] = msg;
        }
      });

      if (selectedMonthRef.current) {
        applySelectedMonthFromCache(list, selectedMonthRef.current, errorsBySite);
      }
    },
    [fetchSiteAllMonthsIntoCache, applySelectedMonthFromCache],
  );

  /** Month picker: display cache only — never hit the network. */
  const setSelectedMonthKey = useCallback(
    (monthKey: string) => {
      setSelectedMonthKeyState(monthKey);
      selectedMonthRef.current = monthKey;
      const list = sitesRef.current.filter(siteHasCredentials);
      applySelectedMonthFromCache(list, monthKey);
    },
    [applySelectedMonthFromCache],
  );

  // Sites list / day rollover: rebind from cache only. Network only when Refresh is clicked.
  useEffect(() => {
    void tick;
    void sitesKey;
    const list = sitesRef.current.filter(siteHasCredentials);
    applySelectedMonthFromCache(list, selectedMonthRef.current);
  }, [tick, sitesKey, applySelectedMonthFromCache]);

  const refreshAllQuarterCounts = useCallback(async () => {
    const list = sitesRef.current.filter(siteHasCredentials);
    if (list.length === 0) {
      return;
    }
    const months = monthOptionsRef.current;
    for (const site of list) {
      for (const month of months) {
        const range = resolveRangeForMonth(site, month.key, new Date());
        clearSiteCacheForRange(site.id, range.after, range.before);
      }
    }
    setBySiteId((prev) => buildQuarterTilesForRefresh(list, prev, resolveRange, new Date()));
    setIsRefreshingAllQuarterCounts(true);
    setCountsBatchPending(true);
    try {
      await fetchAndStoreAllMonths(list, months);
    } finally {
      setIsRefreshingAllQuarterCounts(false);
      setCountsBatchPending(false);
    }
  }, [resolveRangeForMonth, resolveRange, fetchAndStoreAllMonths]);

  return {
    bySiteId,
    dayKey,
    refreshAllQuarterCounts,
    isRefreshingAllQuarterCounts,
    countsBatchPending,
    selectedMonthKey,
    setSelectedMonthKey,
    monthOptions,
  };
}
