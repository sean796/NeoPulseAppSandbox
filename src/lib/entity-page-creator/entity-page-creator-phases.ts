import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import type { WordPressSite } from "@/components/integrations/types";
import type { AgentRun, AgentRunResumePoint } from "@/lib/agent-runs-types";
import type { BulkGeneratedFile } from "@/lib/bulk-file-manager";
import type { BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { parseCsvStaticText } from "@/lib/bulk/bulk-csv-parser";
import type { EntityPageCreatorExecutionPayload } from "@/lib/tasks-types";
import { effectiveSaveLocalArchive } from "@/lib/schedule-output-destination";
import { syncPostCreatorProof } from "@/lib/agent-runs/agent-run-post-creator-proof";
import { runPostCreatorBulkRows } from "@/lib/post-creator/post-creator-bulk-runner";
import { loadBulkSitemapInventoryForSite } from "@/lib/bulk/bulk-sitemap-inventory-session";
import {
  buildEntityBulkCsvContent,
  generateEntityLocationsGrid,
  hydrateEntityPageRows,
  resolveEntityCsvText,
  resolveGridCsvText,
  type EntityLocationGenerationResult,
} from "@/lib/entity-page-creator/entity-page-creator-pipeline";
import {
  buildEntityPageCreatorWordPressPosting,
  resolveEntityPageCreatorSchedule,
} from "@/lib/entity-page-creator/entity-page-creator-schedule";
import { ensureEntityPageCreatorPayload } from "@/lib/entity-page-creator/entity-page-creator-defaults";
import {
  assertConfiguredEntityRowCount,
  configuredEntityPageTotal,
} from "@/lib/local-analysis/entity-ad-group-budget";
export type EntityUploadedPost = {
  url: string;
  postId?: number;
  title?: string;
  scheduledFor?: string;
};

export function parseResumeBulkRows(payload: Record<string, unknown>): CSVRow[] | null {
  const rows = payload.bulkRows;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows as CSVRow[];
}

export function parseResumeUploadedPosts(payload: Record<string, unknown>): EntityUploadedPost[] {
  const posts = payload.uploadedPosts;
  if (!Array.isArray(posts)) return [];
  return posts.filter(
    (p): p is EntityUploadedPost => Boolean(p && typeof p === "object" && "url" in p),
  );
}

export function entityBulkResumePayload(args: {
  rowIndex: number;
  postCount: number;
  bulkRows: CSVRow[];
  uploadedPosts: EntityUploadedPost[];
}): Record<string, unknown> {
  return {
    phase: "bulk",
    rowIndex: args.rowIndex,
    postCount: args.postCount,
    bulkRows: args.bulkRows,
    uploadedPosts: args.uploadedPosts,
  };
}

export async function generateEntityLocationRows(args: {
  site: WordPressSite;
  payload: EntityPageCreatorExecutionPayload;
  run: AgentRun;
  onProgress?: (label: string, progress?: number) => void;
}): Promise<{
  rows: CSVRow[];
  bulkCsv: string;
  gridInputResolved: boolean;
  locationResult: EntityLocationGenerationResult;
}> {
  const apiKey = await resolveOpenRouterApiKeyForHarness();

  const payload = ensureEntityPageCreatorPayload({ ...args.payload, locationSource: "grid" });
  const configuredTotal = configuredEntityPageTotal(payload.entityAdGroupCount!, payload.entityAdsPerGroup!);

  args.onProgress?.("Generating entity locations…", 0.05);

  const gridCsvText = await resolveGridCsvText({
    payload,
    teamId: args.run.teamId,
  });
  const gridKeyword =
    payload.focusKeyword?.trim() ||
    args.site.name?.trim() ||
    "";
  const saveLocalArchive = effectiveSaveLocalArchive("entity_generator", payload as Record<string, unknown>);
  const locationResult = await generateEntityLocationsGrid({
    site: args.site,
    payload,
    apiKey,
    gridCsvText,
    gridKeyword,
    archiveContext: {
      run: args.run,
      saveLocalArchive,
    },
    onProgress: (p) =>
      args.onProgress?.(
        p.phase,
        p.completed != null && p.total ? p.completed / p.total : undefined,
      ),
  });

  assertConfiguredEntityRowCount(locationResult.rows.length, configuredTotal, "Entity generator");
  const bulkCsv = buildEntityBulkCsvContent(locationResult.rows);

  return {
    rows: locationResult.rows,
    bulkCsv,
    gridInputResolved: true,
    locationResult,
  };
}

export async function loadEntityRowsFromCsvInput(args: {
  site: WordPressSite;
  payload: EntityPageCreatorExecutionPayload;
  run: AgentRun;
}): Promise<CSVRow[]> {
  const payload = ensureEntityPageCreatorPayload(args.payload);
  const csvText = await resolveEntityCsvText({
    payload,
    teamId: args.run.teamId,
  });
  const rows = parseCsvStaticText(csvText);
  if (rows.length === 0) {
    throw new Error("Entity CSV has no data rows.");
  }
  const configuredTotal = configuredEntityPageTotal(payload.entityAdGroupCount!, payload.entityAdsPerGroup!);
  assertConfiguredEntityRowCount(rows.length, configuredTotal, "SAP generator");
  return rows;
}

export async function hydrateAndPublishEntityPages(args: {
  site: WordPressSite;
  payload: EntityPageCreatorExecutionPayload;
  run: AgentRun;
  executionKind: "entity_page_creator" | "sap_generator";
  rows: CSVRow[];
  locationResult?: EntityLocationGenerationResult;
  resumePoint?: AgentRunResumePoint | null;
  onProgress?: (
    label: string,
    progress?: number,
    resumePayload?: Record<string, unknown>,
  ) => void;
  onFilesChanged?: (files: BulkGeneratedFile[]) => void;
  onHarnessSection?: (payload: BulkHarnessSectionPayload) => void;
  isCancelled?: () => Promise<boolean>;
}): Promise<{
  created: number;
  failed: number;
  skipped: number;
  postCount: number;
  urls: string[];
  uploadedPosts: import("@/lib/agent-runs-types").AgentRunUploadedPost[];
  bulkCsv: string;
}> {
  const apiKey = await resolveOpenRouterApiKeyForHarness();

  const payload = ensureEntityPageCreatorPayload(args.payload);
  const configuredTotal = configuredEntityPageTotal(payload.entityAdGroupCount!, payload.entityAdsPerGroup!);
  const postCount = payload.entityPageCount ?? payload.postCount ?? configuredTotal;
  const resumePayload = args.resumePoint?.payload ?? {};
  const resumePhase = String(resumePayload.phase ?? "");
  const resumeRowIndex = typeof resumePayload.rowIndex === "number" ? resumePayload.rowIndex : 0;
  const savedBulkRows = parseResumeBulkRows(resumePayload);
  const priorUploaded = parseResumeUploadedPosts(resumePayload);

  let hydratedRows: CSVRow[];
  if (resumePhase === "bulk" && savedBulkRows) {
    hydratedRows = savedBulkRows;
    args.onProgress?.(
      `Entity page ${resumeRowIndex + 1}/${hydratedRows.length}: resuming…`,
      0.65,
      entityBulkResumePayload({
        rowIndex: resumeRowIndex,
        postCount,
        bulkRows: hydratedRows,
        uploadedPosts: priorUploaded,
      }),
    );
  } else {
    args.onProgress?.("Hydrating bulk CSV rows…", 0.35);
    hydratedRows = await hydrateEntityPageRows({
      site: args.site,
      payload,
      apiKey,
      rows: args.rows,
      clusterWikipedia: args.locationResult?.clusterWikipedia,
      gridLocations: args.locationResult?.gridLocations,
      onProgress: (p) =>
        args.onProgress?.(
          p.phase,
          p.completed != null && p.total ? 0.35 + (p.completed / p.total) * 0.25 : undefined,
        ),
    });

    assertConfiguredEntityRowCount(hydratedRows.length, configuredTotal, "Entity page creator");

    args.onProgress?.(
      "Publishing entity pages…",
      0.65,
      entityBulkResumePayload({
        rowIndex: 0,
        postCount,
        bulkRows: hydratedRows,
        uploadedPosts: [],
      }),
    );
  }

  const bulkCsv = buildEntityBulkCsvContent(hydratedRows);
  const schedule = resolveEntityPageCreatorSchedule(payload);
  const wordPressPosting = buildEntityPageCreatorWordPressPosting(args.site, hydratedRows.length, payload);

  let inventoryContext;
  try {
    inventoryContext = await loadBulkSitemapInventoryForSite(args.site);
  } catch {
    inventoryContext = undefined;
  }

  const bulkResult = await runPostCreatorBulkRows({
    site: args.site,
    rows: hydratedRows,
    wordPressPosting,
    schedule,
    inventoryContext,
    startRowIndex: resumePhase === "bulk" ? resumeRowIndex : 0,
    priorUploadedPosts: priorUploaded,
    clearMapsCache: resumePhase !== "bulk",
    isCancelled: args.isCancelled,
    onProgress: (p) => {
      if (p.uploadedPosts?.length) {
        syncPostCreatorProof(args.run.id, {
          postCount,
          files: [],
          featuredImageEnabled: true,
          uploadedPosts: p.uploadedPosts,
        });
      }
      args.onProgress?.(
        p.message || `Entity page ${p.rowIndex + 1}/${p.totalRows}`,
        0.65 + ((p.rowIndex + 1) / Math.max(1, p.totalRows)) * 0.3,
        entityBulkResumePayload({
          rowIndex: p.rowIndex,
          postCount,
          bulkRows: hydratedRows,
          uploadedPosts: p.uploadedPosts ?? priorUploaded,
        }),
      );
    },
    onFilesChanged: args.onFilesChanged,
    onHarnessSection: args.onHarnessSection,
  });

  return {
    created: bulkResult.created,
    failed: bulkResult.failed,
    skipped: 0,
    postCount,
    urls: bulkResult.urls,
    uploadedPosts: bulkResult.uploadedPosts,
    bulkCsv,
  };
}
