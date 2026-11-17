/**
 * Entities package fill: locations grid, entity CSV for the gap, then create SAP pages.
 * Does not touch the open UI. Uses the client record from the client URL.
 */
import type { WordPressSite } from "@/components/integrations/types";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import { runLocalGridExportForSite } from "@/lib/local-grid-studio/run-local-grid-export-for-site";
import { resolvePropertyPrimaryLocalKeyword } from "@/lib/local-grid-studio/resolve-property-primary-local-keyword";
import {
  buildEntityBulkCsvContent,
  generateEntityLocationsGrid,
  hydrateEntityPageRows,
} from "@/lib/entity-page-creator/entity-page-creator-pipeline";
import {
  buildEntityPageCreatorWordPressPosting,
  resolveEntityPageCreatorSchedule,
} from "@/lib/entity-page-creator/entity-page-creator-schedule";
import { ensureEntityPageCreatorPayload } from "@/lib/entity-page-creator/entity-page-creator-defaults";
import { runPostCreatorBulkRows } from "@/lib/post-creator/post-creator-bulk-runner";
import { loadBulkSitemapInventoryForSite } from "@/lib/bulk/bulk-sitemap-inventory-session";
import type { EntityPageCreatorExecutionPayload } from "@/lib/tasks-types";
import { assertConfiguredEntityRowCount } from "@/lib/local-analysis/entity-ad-group-budget";

function nextMonthStartYmd(now = new Date()): string {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const year = m === 12 ? y + 1 : y;
  const month = m === 12 ? 1 : m + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export type EntitiesPackageFillResult = {
  created: number;
  failed: number;
  urls: string[];
  entityPageCount: number;
  bulkCsv: string;
};

export async function runEntitiesPackageFillJob(args: {
  site: WordPressSite;
  entityPageCount: number;
  publishTime?: string;
  signal?: AbortSignal;
  onProgress?: (step: string, progress: number) => void;
}): Promise<EntitiesPackageFillResult> {
  const entityPageCount = Math.max(1, Math.floor(Number(args.entityPageCount) || 0));
  const site = args.site;
  if (!site?.id?.trim()) {
    throw new Error("Client from client URL is required.");
  }
  if (!site.username?.trim() || !site.appPassword?.trim()) {
    throw new Error("WordPress credentials are required.");
  }
  if (!site.entitySitemapUrl?.trim()) {
    throw new Error("SAP sitemap is not configured for this site.");
  }
  if (args.signal?.aborted) {
    throw new Error("Cancelled");
  }

  const keyword = resolvePropertyPrimaryLocalKeyword(site, site.primaryLocalKeyword);
  if (!keyword.trim()) {
    throw new Error(
      "Set Primary keyword on the property profile before running the entities package fill.",
    );
  }

  const report = (step: string, progress: number) => {
    args.onProgress?.(step.trim(), progress);
  };

  report("Running locations grid", 5);
  const gridExport = await runLocalGridExportForSite(site, {
    keyword: keyword.trim(),
    signal: args.signal,
    shouldAbort: () => Boolean(args.signal?.aborted),
    onProgress: (label, progress) => {
      report(label, Math.min(25, 5 + Math.floor((progress ?? 0) * 20)));
    },
  });
  if (!gridExport.csvContent.trim()) {
    throw new Error("Locations grid CSV is empty.");
  }

  if (args.signal?.aborted) {
    throw new Error("Cancelled");
  }

  const monthStart = nextMonthStartYmd();
  const publishTime =
    typeof args.publishTime === "string" && /^\d{2}:\d{2}$/.test(args.publishTime.trim())
      ? args.publishTime.trim()
      : "09:00";

  const payload = ensureEntityPageCreatorPayload({
    locationSource: "grid",
    entityUseEditorialPackage: false,
    entityPageCount,
    postCount: entityPageCount,
    focusKeyword: keyword.trim(),
    sitemapType: "entity",
    featuredImage: false,
    postDestination: "wordpress",
    scheduleFrequency: "custom",
    scheduleCustomStartDate: monthStart,
    scheduleStartDay: 1,
    scheduleStartTime: publishTime,
    scheduleTimesPerMonth: entityPageCount,
    scheduleCustomInterval: entityPageCount,
    scheduleStaggerOptimized: true,
    targetBucket: "sap",
    saveLocalArchive: true,
  } satisfies EntityPageCreatorExecutionPayload);

  report("Building entity CSV from grid", 30);
  const apiKey = await resolveOpenRouterApiKeyForHarness();
  const locationResult = await generateEntityLocationsGrid({
    site,
    payload,
    apiKey,
    gridCsvText: gridExport.csvContent,
    gridKeyword: keyword.trim(),
    onProgress: (p) => {
      report(
        p.phase,
        p.completed != null && p.total
          ? 30 + Math.floor((p.completed / p.total) * 20)
          : 35,
      );
    },
  });
  assertConfiguredEntityRowCount(locationResult.rows.length, entityPageCount, "Entity generator");

  if (args.signal?.aborted) {
    throw new Error("Cancelled");
  }

  report("Hydrating entity rows", 55);
  const hydratedRows = await hydrateEntityPageRows({
    site,
    payload,
    apiKey,
    rows: locationResult.rows,
    clusterWikipedia: locationResult.clusterWikipedia,
    gridLocations: locationResult.gridLocations,
    onProgress: (p) => {
      report(
        p.phase,
        p.completed != null && p.total
          ? 55 + Math.floor((p.completed / p.total) * 15)
          : 60,
      );
    },
  });
  assertConfiguredEntityRowCount(hydratedRows.length, entityPageCount, "Entity page creator");

  const bulkCsv = buildEntityBulkCsvContent(hydratedRows);
  const schedule = resolveEntityPageCreatorSchedule(payload);
  const wordPressPosting = buildEntityPageCreatorWordPressPosting(site, hydratedRows.length, payload);

  let inventoryContext;
  try {
    inventoryContext = await loadBulkSitemapInventoryForSite(site);
  } catch {
    inventoryContext = undefined;
  }

  if (args.signal?.aborted) {
    throw new Error("Cancelled");
  }

  report("Creating service-area pages", 75);
  const bulk = await runPostCreatorBulkRows({
    site,
    rows: hydratedRows,
    wordPressPosting,
    schedule,
    inventoryContext,
    isCancelled: async () => Boolean(args.signal?.aborted),
    onProgress: (p) => {
      const pct = 75 + Math.floor((24 * (p.rowIndex + 1)) / Math.max(1, p.totalRows));
      report(p.message || `Entity page ${p.rowIndex + 1}/${p.totalRows}`, Math.min(99, pct));
    },
  });

  if (bulk.created < entityPageCount) {
    throw new Error(
      `Entities package fill created ${bulk.created}/${entityPageCount} service-area pages.`,
    );
  }

  return {
    created: bulk.created,
    failed: bulk.failed,
    urls: bulk.urls,
    entityPageCount,
    bulkCsv,
  };
}
