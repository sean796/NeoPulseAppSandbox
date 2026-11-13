import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import {
  isOverviewSapSourceAvailable,
  type OverviewSitemapSource,
} from "@/lib/overview/overview-sitemap-source";
import { loadCachedOverviewRows } from "@/lib/overview/overview-sitemap-warm-rows-sync";
import {
  resolveOverviewStudioActiveUrlForPaint,
  writeOverviewStudioActiveUrl,
} from "@/lib/overview/overview-studio-active-url-persist";
import {
  setOverviewRowsSessionCache,
  writeLocalActiveRowBody,
} from "@/lib/overview/overview-rows-session-cache";
import {
  NEO_PULSE_OVERVIEW_CACHE_HYDRATED_EVENT,
  type OverviewCacheHydratedDetail,
} from "@/lib/overview/overview-cache-hydrated-event";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import {
  overviewDateModifierTodayIso,
  patchOverviewRowsDateModifierForUrls,
  pushOverviewDateModifiersToAcfForUrls,
} from "@/lib/overview/overview-bulk-seo-payload";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewTabContentProps } from "@/components/overview/overview-tab/overview-tab-content-types";
import type { useWordPressOptimization } from "@/contexts/wordpress-optimization-context";
import { useOverviewWordPressBinding } from "@/hooks/overview/use-overview-wordpress-binding";
import {
  consumeOverviewTaskRestoreIntent,
  OVERVIEW_TASK_RESTORE_EVENT,
  parseOverviewSourceFromPath,
  peekOverviewTaskRestoreIntent,
  type OverviewTaskRestoreIntent,
} from "@/lib/task-manager/overview-restore";

function peekInitialSitemapSource(
  studioRowSource: OverviewTabContentProps["studioRowSource"],
): OverviewSitemapSource {
  if (studioRowSource === "bulk-generator") return "posts";
  if (typeof window !== "undefined") {
    const fromUrl = parseOverviewSourceFromPath(window.location.pathname, window.location.search);
    if (fromUrl) return fromUrl;
  }
  return "pages";
}

export function useOverviewTabRowsCore({
  site,
  studioRowSource,
  onBulkGeneratorOverviewRowPatched,
  bulkBatchKey,
  opt,
  isMultiRowBulkActive,
}: {
  site: WordPressSite;
  studioRowSource: OverviewTabContentProps["studioRowSource"];
  onBulkGeneratorOverviewRowPatched: OverviewTabContentProps["onBulkGeneratorOverviewRowPatched"];
  bulkBatchKey: string;
  opt: ReturnType<typeof useWordPressOptimization>;
  isMultiRowBulkActive: () => boolean;
}) {
  const initialSourceRef = useRef<OverviewSitemapSource | null>(null);
  if (initialSourceRef.current == null) {
    let source = peekInitialSitemapSource(studioRowSource);
    if (studioRowSource !== "bulk-generator" && typeof window !== "undefined") {
      const intent = consumeOverviewTaskRestoreIntent();
      if (intent?.sitemapSource) source = intent.sitemapSource;
    }
    initialSourceRef.current = source;
  }
  const [sitemapSource, setSitemapSource] = useState<OverviewSitemapSource>(
    () => initialSourceRef.current ?? "pages",
  );
  const [rows, setRows] = useState<OverviewRow[]>(() => {
    if (studioRowSource === "bulk-generator") return [];
    const source = initialSourceRef.current ?? "pages";
    const initial = loadCachedOverviewRows(site, source);
    const frame1 = {
      siteId: site?.id,
      siteName: site?.name,
      initialRowCount: initial.length,
      firstUrl: initial[0]?.url ?? null,
      firstPostContentLength: (initial[0]?.postContent ?? "").length,
      firstH2Count: initial[0]?.blogH2List?.length ?? 0,
      hasFirstBody: Boolean(
        initial[0]?.postContent?.trim() || initial[0]?.elementorDataJson?.trim(),
      ),
    };
    if (typeof window !== "undefined") {
      (window as unknown as Record<string, unknown>).__OVERVIEW_FRAME_1__ = frame1;
    }
    return initial;
  });
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const sitemapSourceRef = useRef(sitemapSource);
  sitemapSourceRef.current = sitemapSource;
  const contentOptDateSyncedRef = useRef(new Set<string>());
  const [expandedContentUrl, setExpandedContentUrl] = useState<string | null>(null);
  const [expandedResearchBriefUrl, setExpandedResearchBriefUrl] = useState<string | null>(null);
  const [expandedPageUrl, setExpandedPageUrlState] = useState<string | null>(() => {
    if (studioRowSource === "bulk-generator") return null;
    return resolveOverviewStudioActiveUrlForPaint(site, initialSourceRef.current ?? "pages");
  });

  useEffect(() => {
    if (studioRowSource === "bulk-generator") return;
    const applyRestore = (intent: OverviewTaskRestoreIntent | null) => {
      if (!intent?.sitemapSource) return;
      if (intent.sitemapSource === sitemapSourceRef.current) return;
      setSitemapSource(intent.sitemapSource);
    };
    const onRestore = (event: Event) => {
      const detail = (event as CustomEvent<OverviewTaskRestoreIntent>).detail;
      applyRestore(detail ?? null);
    };
    window.addEventListener(OVERVIEW_TASK_RESTORE_EVENT, onRestore as EventListener);
    applyRestore(consumeOverviewTaskRestoreIntent());
    return () => {
      window.removeEventListener(OVERVIEW_TASK_RESTORE_EVENT, onRestore as EventListener);
    };
  }, [studioRowSource]);
  const setExpandedPageUrl = useCallback(
    (next: string | null) => {
      setExpandedPageUrlState(next);
      if (site?.id && studioRowSource !== "bulk-generator") {
        writeOverviewStudioActiveUrl(site.id, next);
        if (next) {
          const activeKey = normalizePageUrlKey(next);
          const match = rowsRef.current.find((r) => normalizePageUrlKey(r.url) === activeKey);
          if (match) {
            writeLocalActiveRowBody(site.id, sitemapSourceRef.current, match);
          }
        }
      }
    },
    [site?.id, studioRowSource],
  );
  const toggleExpandedPageUrl = useCallback(
    (url: string) =>
      setExpandedPageUrlState((prev) => {
        const next = prev === url ? null : url;
        if (site?.id && studioRowSource !== "bulk-generator") {
          writeOverviewStudioActiveUrl(site.id, next);
          if (next) {
            const activeKey = normalizePageUrlKey(next);
            const match = rowsRef.current.find((r) => normalizePageUrlKey(r.url) === activeKey);
            if (match) {
              writeLocalActiveRowBody(site.id, sitemapSourceRef.current, match);
            }
          }
        }
        return next;
      }),
    [site?.id, studioRowSource],
  );
  const {
    bindings,
    wpTitlesByUrl,
    resolveBindings,
    prefetchOverviewInventory,
    inventoryLoading,
    getInventoryRowForUrl,
    getInventoryMatchForUrl,
    acfExtraTextSupported,
    loading: bindingLoading,
    error: bindingError,
    activateInventoryCacheForSource,
    getCachedInventoryRowsForSource,
    remapBindingUrl,
    mergeInventoryContentForSource,
  } = useOverviewWordPressBinding(site?.id, sitemapSource);
  useEffect(() => {
    if (!site || !bulkBatchKey) return;
    const statuses = opt.bulkOptimizationState[bulkBatchKey]?.urlStatuses;
    if (!statuses) {
      contentOptDateSyncedRef.current.clear();
      return;
    }

    const statusValues = Object.values(statuses);
    if (statusValues.length > 0 && statusValues.every((status) => status === "pending")) {
      contentOptDateSyncedRef.current.clear();
    }

    const newlyOptimizing: string[] = [];
    for (const [url, status] of Object.entries(statuses)) {
      if (status !== "optimizing") continue;
      const key = normalizePageUrlKey(url);
      if (contentOptDateSyncedRef.current.has(key)) continue;
      contentOptDateSyncedRef.current.add(key);
      newlyOptimizing.push(url);
    }

    if (newlyOptimizing.length > 0) {
      const iso = overviewDateModifierTodayIso();
      const multiRowBulk = isMultiRowBulkActive();
      if (multiRowBulk) {
        const keys = new Set(newlyOptimizing.map((url) => normalizePageUrlKey(url)));
        rowsRef.current = rowsRef.current.map((row) =>
          keys.has(normalizePageUrlKey(row.url)) ? { ...row, dateModifier: iso } : row,
        );
      } else {
        patchOverviewRowsDateModifierForUrls(setRows, newlyOptimizing, iso);
        if (site.username?.trim() && site.appPassword?.trim()) {
          void pushOverviewDateModifiersToAcfForUrls(
            site,
            bindings,
            rowsRef.current,
            newlyOptimizing,
            iso,
          );
        }
      }
    }
  }, [opt.bulkOptimizationState, opt.isOptimizingContent, site, bulkBatchKey, setRows, bindings, isMultiRowBulkActive]);
  const prevSiteIdForSourceRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (studioRowSource === "bulk-generator") {
      if (site && !isOverviewSapSourceAvailable(site)) {
        setSitemapSource((prev) => (prev === "sap" ? "posts" : prev));
      }
      return;
    }
    if (!site?.id) {
      prevSiteIdForSourceRef.current = undefined;
      setSitemapSource("pages");
      return;
    }
    const siteChanged = prevSiteIdForSourceRef.current !== site.id;
    const prevId = prevSiteIdForSourceRef.current;
    prevSiteIdForSourceRef.current = site.id;
    if (!siteChanged) return;

    // Never wipe URL/task restore (e.g. ?source=posts) back to Pages.
    const fromUrl =
      typeof window !== "undefined"
        ? parseOverviewSourceFromPath(window.location.pathname, window.location.search)
        : null;
    if (fromUrl) {
      setSitemapSource(fromUrl);
      return;
    }
    const intent = peekOverviewTaskRestoreIntent();
    if (intent?.sitemapSource) {
      setSitemapSource(intent.sitemapSource);
      return;
    }
    // Switching clients with no source in the URL defaults to Pages.
    // First paint already used peekInitialSitemapSource; skip that overwrite.
    if (prevId != null) {
      setSitemapSource("pages");
    }
  }, [site?.id, site?.sitemaps?.mainSitemapUrl, studioRowSource, site]);
  const prevRowsSiteIdRef = useRef(site?.id);
  useLayoutEffect(() => {
    if (!site?.id || studioRowSource === "bulk-generator") return;
    const siteChanged = prevRowsSiteIdRef.current !== site.id;
    prevRowsSiteIdRef.current = site.id;
    const cachedRows = loadCachedOverviewRows(site, sitemapSource);
    if (cachedRows.length) {
      setRows(cachedRows);
      setExpandedPageUrlState((prev) => {
        if (
          !siteChanged &&
          prev &&
          cachedRows.some((r) => normalizePageUrlKey(r.url) === normalizePageUrlKey(prev))
        ) {
          return prev;
        }
        return resolveOverviewStudioActiveUrlForPaint(site, sitemapSource);
      });
    } else if (siteChanged) {
      // Client switched and the new client has no cached rows yet: drop the
      // previous client's rows and open doc immediately so nothing from the
      // old client can be shown, optimized, or uploaded under the new one.
      // The sitemap load effect then fetches the new client's rows.
      setRows([]);
      rowsRef.current = [];
      setExpandedPageUrlState(resolveOverviewStudioActiveUrlForPaint(site, sitemapSource));
    }
    activateInventoryCacheForSource(site.id, sitemapSource);
  }, [site?.id, sitemapSource, activateInventoryCacheForSource, studioRowSource, site]);

  useEffect(() => {
    if (!site?.id || studioRowSource === "bulk-generator") return;
    const onHydrated = (event: Event) => {
      const detail = (event as CustomEvent<OverviewCacheHydratedDetail>).detail;
      if (detail?.siteId !== site.id) return;
      const cachedRows = loadCachedOverviewRows(site, sitemapSource);
      if (cachedRows.length) setRows(cachedRows);
    };
    window.addEventListener(NEO_PULSE_OVERVIEW_CACHE_HYDRATED_EVENT, onHydrated);
    return () =>
      window.removeEventListener(NEO_PULSE_OVERVIEW_CACHE_HYDRATED_EVENT, onHydrated);
  }, [site?.id, sitemapSource, studioRowSource, site]);

  useEffect(() => {
    if (!site?.id || studioRowSource === "bulk-generator") return;
    return () => {
      if (site?.id) setOverviewRowsSessionCache(site.id, sitemapSource, rowsRef.current);
    };
  }, [site?.id, sitemapSource, studioRowSource]);
  const syncRowsFromRef = useCallback(() => {
    startTransition(() => {
      setRows(rowsRef.current);
    });
  }, []);

  const updateRow = useCallback((index: number, patch: Partial<OverviewRow>) => {
    const next = rowsRef.current.map((row, i) => {
      if (i !== index) return row;
      return { ...row, ...patch };
    });
    rowsRef.current = next;
    if (studioRowSource === "bulk-generator" && onBulkGeneratorOverviewRowPatched) {
      onBulkGeneratorOverviewRowPatched(index, patch);
    }
    const studioLiveKeys: (keyof OverviewRow)[] = [
      "postContent",
      "postContentOptimized",
      "elementorSectionHeaders",
      "elementorDataJson",
      "faq",
      "seoResearch",
      "aiTitle",
      "aiMeta",
      "title",
      "metaDescription",
      "url",
      "aiSuggestedPath",
      "slugRedirectSourceUrl",
      "dateModifier",
      "postId",
      "postType",
    ];
    const flushStudioLive =
      patch.status !== undefined ||
      studioLiveKeys.some((key) => Object.prototype.hasOwnProperty.call(patch, key));
    if (site?.id && studioRowSource !== "bulk-generator" && patch.status === "idle") {
      setOverviewRowsSessionCache(site.id, sitemapSourceRef.current, next);
    }
    if (flushStudioLive) {
      setRows(next);
      return;
    }
    startTransition(() => {
      setRows(next);
    });
  }, [site?.id, studioRowSource, onBulkGeneratorOverviewRowPatched]);

  return {
    sitemapSource,
    setSitemapSource,
    rows,
    setRows,
    rowsRef,
    expandedContentUrl,
    setExpandedContentUrl,
    expandedResearchBriefUrl,
    setExpandedResearchBriefUrl,
    expandedPageUrl,
    setExpandedPageUrl,
    toggleExpandedPageUrl,
    syncRowsFromRef,
    updateRow,
    bindings,
    wpTitlesByUrl,
    resolveBindings,
    prefetchOverviewInventory,
    inventoryLoading,
    getInventoryRowForUrl,
    getInventoryMatchForUrl,
    acfExtraTextSupported,
    bindingLoading,
    bindingError,
    activateInventoryCacheForSource,
    getCachedInventoryRowsForSource,
    remapBindingUrl,
    mergeInventoryContentForSource,
  };
}
