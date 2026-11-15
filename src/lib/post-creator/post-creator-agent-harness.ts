import type { WordPressSite } from "@/components/integrations/types";
import { loadDataForSEOApiKey } from "@/lib/api";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import { AGENT_RUN_STEP_KEYS, postCreatorHarnessStepKey, postCreatorRowStepKey } from "@/lib/agent-runs/agent-run-step-keys";
import type { AgentRunResumePoint } from "@/lib/agent-runs-types";
import type { PostCreatorBlockedRow } from "@/lib/post-creator/post-creator-cannibalization-agent";
import { runPostCreatorBulkRows } from "@/lib/post-creator/post-creator-bulk-runner";
import { buildPostCreatorSafeChecklistRows } from "@/lib/post-creator/post-creator-safe-checklist";
import {
  buildPostCreatorWordPressPosting,
  resolvePostCreatorSchedule,
} from "@/lib/post-creator/post-creator-schedule";
import type { PostCreatorExecutionPayload } from "@/lib/tasks-types";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { applyUpstreamContextToPostCreatorPayload } from "@/lib/post-creator/upstream-research-facts";
import type { PostCreatorServerPreflight } from "@/lib/post-creator/post-creator-server-preflight";

export type PostCreatorUploadedPost = {
  url: string;
  postId?: number;
  title?: string;
  scheduledFor?: string;
};

export type RunPostCreatorAgentHarnessArgs = {
  site: WordPressSite;
  payload: PostCreatorExecutionPayload;
  run?: import("@/lib/agent-runs-types").AgentRun;
  runId?: number;
  teamId?: number;
  isCancelled?: () => Promise<boolean>;
  resumePoint?: AgentRunResumePoint | null;
  onProgress?: (
    p: { label: string; step: number; total: number; stepKey?: string },
    resumePayload?: Record<string, unknown>,
  ) => void;
  onFilesChanged?: (files: import("@/lib/bulk-file-manager").BulkGeneratedFile[]) => void;
  onHarnessSection?: (payload: import("@/lib/bulk-auto-generate").BulkHarnessSectionPayload) => void;
  onContentBucketReady?: (
    files: import("@/lib/post-creator/post-creator-inventory-bucket").PostCreatorContentBucketFile[],
  ) => void;
  onArtifact?: (input: {
    stepKey: string;
    stepLabel: string;
    name: string;
    mime: string;
    content: string;
    resumePayload?: Record<string, unknown>;
  }) => Promise<void>;
  serverPreflight?: PostCreatorServerPreflight;
};

export type PostCreatorAgentHarnessResult = {
  created: number;
  failed: number;
  skipped: number;
  postCount: number;
  urls: string[];
  scheduledDates: string[];
  uploadedPosts: PostCreatorUploadedPost[];
  blockedRows: PostCreatorBlockedRow[];
};

function parseResumeChecklistRows(payload: Record<string, unknown>): CSVRow[] | null {
  const rows = payload.checklistRows;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows as CSVRow[];
}

function parseResumeUploadedPosts(
  payload: Record<string, unknown>,
): PostCreatorUploadedPost[] {
  const posts = payload.uploadedPosts;
  if (!Array.isArray(posts)) return [];
  return posts.filter((p): p is PostCreatorUploadedPost => Boolean(p && typeof p === "object" && "url" in p));
}

export async function runPostCreatorAgentHarness(
  args: RunPostCreatorAgentHarnessArgs,
): Promise<PostCreatorAgentHarnessResult> {
  const openRouterKey = await resolveOpenRouterApiKeyForHarness();
  const dataForSeoKey = loadDataForSEOApiKey()?.trim() || "";
  if (!dataForSeoKey) {
    throw new Error("Add a DataForSEO API key in Settings.");
  }
  if (!args.site.username?.trim() || !args.site.appPassword?.trim()) {
    throw new Error("WordPress credentials are required for post creation.");
  }

  const schedule = resolvePostCreatorSchedule(args.payload);
  const totalSteps = 2 + schedule.postCount;
  const resumePayload = args.resumePoint?.payload ?? {};
  const resumePhase = String(resumePayload.phase ?? "");
  const resumeRowIndex = typeof resumePayload.rowIndex === "number" ? resumePayload.rowIndex : 0;
  const savedChecklist = parseResumeChecklistRows(resumePayload);
  const priorUploaded = parseResumeUploadedPosts(resumePayload);

  let checklistRows: CSVRow[] | null = savedChecklist;
  let blockedRows: PostCreatorBlockedRow[] = Array.isArray(resumePayload.blockedRows)
    ? (resumePayload.blockedRows as PostCreatorBlockedRow[])
    : [];
  let inventoryContext: Awaited<ReturnType<typeof buildPostCreatorSafeChecklistRows>>["inventory"];

  if (resumePhase === "bulk" && savedChecklist) {
    if (typeof resumePayload.intraRowPhase !== "string" || !resumePayload.intraRowPhase.trim()) {
      throw new Error("Bulk resume requires intraRowPhase.");
    }
    args.onProgress?.(
      {
        label: `Post ${resumeRowIndex + 1}/${schedule.postCount}: resuming…`,
        step: 2 + resumeRowIndex,
        total: totalSteps,
        stepKey: postCreatorRowStepKey(resumeRowIndex, resumePayload.intraRowPhase),
      },
      {
        phase: "bulk",
        rowIndex: resumeRowIndex,
        postCount: schedule.postCount,
        checklistRows: savedChecklist,
        uploadedPosts: priorUploaded,
        blockedRows,
        intraRowPhase: resumePayload.intraRowPhase,
      },
    );
  } else if (!savedChecklist) {
    args.onProgress?.(
      {
        label: "Loading content bucket…",
        step: 0,
        total: totalSteps,
        stepKey: AGENT_RUN_STEP_KEYS.contentBucket,
      },
      { phase: "ideation", postCount: schedule.postCount },
    );

    if (await args.isCancelled?.()) {
      throw new Error("Cancelled");
    }

    const checklist = await buildPostCreatorSafeChecklistRows({
      site: args.site,
      payload: { ...args.payload, postCount: schedule.postCount },
      preflight: args.serverPreflight,
      onProgress: (message) => {
        args.onProgress?.(
          {
            label: message,
            step: 1,
            total: totalSteps,
            stepKey: AGENT_RUN_STEP_KEYS.ideas,
          },
          { phase: "ideation", postCount: schedule.postCount },
        );
      },
      onContentBucketReady: args.onContentBucketReady,
      isCancelled: args.isCancelled,
    });

    if (checklist.rows.length < schedule.postCount) {
      throw new Error(
        `OpenRouter returned ${checklist.rows.length}/${schedule.postCount} blog ideas.`,
      );
    }

    checklistRows = checklist.rows;
    blockedRows = checklist.blockedRows;
    inventoryContext = checklist.inventory;

    args.onProgress?.(
      {
        label: `${checklist.rows.length} blog ideas ready`,
        step: 1,
        total: totalSteps,
        stepKey: AGENT_RUN_STEP_KEYS.ideas,
      },
      {
        phase: "ideation",
        postCount: schedule.postCount,
        checklistRows: checklist.rows,
      },
    );

    args.onProgress?.(
      {
        label: `Post 1/${schedule.postCount}: keyword research`,
        step: 2,
        total: totalSteps,
        stepKey: postCreatorRowStepKey(0, "keyword"),
      },
      {
        phase: "bulk",
        rowIndex: 0,
        postCount: schedule.postCount,
        checklistRows: checklist.rows,
        uploadedPosts: [],
        blockedRows,
        intraRowPhase: "keyword",
      },
    );
  } else {
    args.onProgress?.(
      {
        label: `Creating ${savedChecklist.length} posts…`,
        step: 2,
        total: totalSteps,
        stepKey: AGENT_RUN_STEP_KEYS.bulkStart,
      },
      {
        phase: "bulk",
        rowIndex: resumeRowIndex,
        postCount: schedule.postCount,
        checklistRows: savedChecklist,
        uploadedPosts: priorUploaded,
        blockedRows,
      },
    );
  }

  if (!checklistRows?.length) {
    throw new Error("Post creator checklist is empty.");
  }

  if (await args.isCancelled?.()) {
    throw new Error("Cancelled");
  }

  const wordPressPosting = buildPostCreatorWordPressPosting(
    args.site,
    checklistRows.length,
    schedule,
    args.payload,
  );

  const bulkResult = await runPostCreatorBulkRows({
    site: args.site,
    rows: checklistRows,
    wordPressPosting,
    schedule,
    inventoryContext,
    startRowIndex: resumePhase === "bulk" ? resumeRowIndex : 0,
    priorUploadedPosts: priorUploaded,
    resumeIntraRowPhase:
      resumePhase === "bulk" && typeof resumePayload.intraRowPhase === "string"
        ? resumePayload.intraRowPhase
        : undefined,
    isCancelled: args.isCancelled,
    onFilesChanged: args.onFilesChanged,
    onHarnessSection: args.onHarnessSection,
    onArtifact:
      args.onArtifact ??
      (args.run && args.teamId
        ? async (input) => {
            const { persistAgentRunArtifact } = await import("@/lib/agent-runs/agent-run-artifacts");
            await persistAgentRunArtifact(args.teamId!, args.run!, input);
          }
        : undefined),
    onProgress: (p) => {
      const stepKey =
        p.harnessSectionIndex != null
          ? postCreatorHarnessStepKey(p.rowIndex, p.harnessSectionIndex)
          : postCreatorRowStepKey(p.rowIndex, p.intraRowPhase);
      args.onProgress?.(
        { label: p.message, step: 2 + p.rowIndex, total: totalSteps, stepKey },
        {
          phase: "bulk",
          rowIndex: p.rowIndex,
          postCount: schedule.postCount,
          checklistRows,
          uploadedPosts: p.uploadedPosts,
          blockedRows,
          intraRowPhase: p.intraRowPhase,
        },
      );
    },
  });

  return {
    created: bulkResult.created,
    failed: bulkResult.failed,
    skipped: 0,
    postCount: schedule.postCount,
    urls: bulkResult.urls,
    scheduledDates: bulkResult.scheduledDates,
    uploadedPosts: bulkResult.uploadedPosts,
    blockedRows,
  };
}

function prefilledImportRowsFromContract(raw: unknown): CSVRow[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const rows: CSVRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const keyword = String(record.keyword ?? "").trim();
    const title = String(record.title ?? "").trim() || keyword;
    if (!keyword) continue;
    rows.push({
      keyword,
      title,
      destination_url: String(record.destination_url ?? "").trim() || undefined,
      seo_research: String(record.seo_research ?? "").trim() || undefined,
      prompt_modifier: String(record.prompt_modifier ?? "").trim() || undefined,
      entity: String(record.entity ?? "").trim() || undefined,
    });
  }
  return rows.length > 0 ? rows : undefined;
}

export function postCreatorPayloadFromContract(
  contract: Record<string, unknown>,
): PostCreatorExecutionPayload {
  const prefilledImportRows = prefilledImportRowsFromContract(contract.prefilledImportRows);
  const payload: PostCreatorExecutionPayload = {
    postCount: typeof contract.postCount === "number" ? contract.postCount : Number(contract.postCount) || 1,
    keywordSource:
      contract.keywordSource === "prompt" || contract.keywordSource === "manual"
        ? contract.keywordSource
        : "gsc",
    optionalPrompt: String(contract.optionalPrompt ?? "").trim() || undefined,
    entityMode:
      contract.entityMode === "auto" || contract.entityMode === "manual"
        ? contract.entityMode
        : "blank",
    entityValue: String(contract.entityValue ?? "").trim() || undefined,
    keywordValue: String(contract.keywordValue ?? "").trim() || undefined,
    titleTemplate: String(contract.titleTemplate ?? "").trim() || undefined,
    featuredImage: contract.featuredImage !== false,
    sitemapType: contract.sitemapType === "entity" ? "entity" : "post",
    postDestination:
      contract.postDestination === "draft" ? contract.postDestination : "wordpress",
    scheduleTimesPerMonth:
      typeof contract.scheduleTimesPerMonth === "number"
        ? contract.scheduleTimesPerMonth
        : Number(contract.scheduleTimesPerMonth) || undefined,
    scheduleStartDay:
      typeof contract.scheduleStartDay === "number"
        ? contract.scheduleStartDay
        : Number(contract.scheduleStartDay) || undefined,
    scheduleStartTime: String(contract.scheduleStartTime ?? "").trim() || undefined,
    scheduleStaggerOptimized: contract.scheduleStaggerOptimized !== false,
    useUpstreamContext: contract.useUpstreamContext === true,
    workflowContextBlock: String(contract.workflowContextBlock ?? "").trim() || undefined,
    ...(prefilledImportRows
      ? { prefilledImportRows, postCount: prefilledImportRows.length, keywordSource: "manual" as const }
      : {}),
  };
  return applyUpstreamContextToPostCreatorPayload(payload);
}
