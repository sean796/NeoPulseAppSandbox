import type { WordPressSite } from "@/components/integrations/types";
import { getStoredSites } from "@/components/integrations/storage";
import type { AgentRunHarnessContext } from "@/lib/agent-runs/harness-registry";
import {
  initPostCreatorProof,
  syncPostCreatorProof,
} from "@/lib/agent-runs/agent-run-post-creator-proof";
import { AGENT_RUN_STEP_KEYS } from "@/lib/agent-runs/agent-run-step-keys";
import type { AgentRun, AgentRunResult } from "@/lib/agent-runs-types";
import type { BulkGeneratedFile } from "@/lib/bulk-file-manager";
import type { BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";
import type { EntityPageCreatorExecutionPayload, TaskExecutionClientRunContract } from "@/lib/tasks-types";
import { patchTaskExecutionProgress } from "@/lib/tasks-api";
import { effectiveSaveLocalArchive } from "@/lib/schedule-output-destination";
import {
  automationTitleFromRun,
  executionKindFromRun,
} from "@/lib/automation-email-delivery";
import { commitAgentRunDeliverable } from "@/lib/agent-runs/commit-agent-run-deliverable";
import { completeAgentRunExecution } from "@/lib/agent-runs/complete-agent-run-execution";
import {
  entityPageCreatorPayloadFromContract,
} from "@/lib/entity-page-creator/entity-page-creator-schedule";
import { ensureEntityPageCreatorPayload } from "@/lib/entity-page-creator/entity-page-creator-defaults";
import {
  hydrateAndPublishEntityPages,
  loadEntityRowsFromCsvInput,
} from "@/lib/entity-page-creator/entity-page-creator-phases";

function resolveSite(siteId: string, sites: WordPressSite[]): WordPressSite {
  const fromList = sites.find((s) => s.id === siteId);
  if (fromList) return fromList;
  const stored = getStoredSites().find((s) => s.id === siteId);
  if (stored) return stored;
  throw new Error("WordPress site not found for this SAP generator run.");
}

function buildResultMessage(result: {
  created: number;
  failed: number;
  skipped?: number;
  postCount: number;
}): string {
  const base = `Created ${result.created}/${result.postCount} entity page${result.postCount === 1 ? "" : "s"}`;
  const skipped = result.skipped ?? 0;
  if (skipped > 0) {
    return `${base} (${skipped} skipped)`;
  }
  if (result.failed > 0) {
    return `${base} (${result.failed} failed during generation)`;
  }
  return base;
}

async function appendEntityPagesSummaryStep(
  ctx: AgentRunHarnessContext,
  uploadedPosts: import("@/lib/agent-runs-types").AgentRunUploadedPost[],
): Promise<void> {
  if (uploadedPosts.length === 0) return;
  await ctx.onStep?.(
    `Created pages (${uploadedPosts.length})`,
    "done",
    {
      artifacts: uploadedPosts.map((post, index) => ({
        id: `entity-post-${index}`,
        name: post.title?.trim() || post.url,
        url: post.url,
      })),
    },
    "entity_pages_created",
  );
}

export async function runSapGeneratorAgentHarness(args: {
  site: WordPressSite;
  payload: EntityPageCreatorExecutionPayload;
  run: AgentRun;
  executionId?: number;
  resumePoint?: import("@/lib/agent-runs-types").AgentRunResumePoint | null;
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
  const resumePayload = args.resumePoint?.payload ?? {};
  const resumePhase = String(resumePayload.phase ?? "");
  const rows =
    resumePhase === "bulk"
      ? null
      : await loadEntityRowsFromCsvInput({
          site: args.site,
          payload: args.payload,
          run: args.run,
        });

  return hydrateAndPublishEntityPages({
    site: args.site,
    payload: args.payload,
    run: args.run,
    executionKind: "sap_generator",
    rows: rows ?? [],
    resumePoint: args.resumePoint,
    onProgress: args.onProgress,
    onFilesChanged: args.onFilesChanged,
    onHarnessSection: args.onHarnessSection,
    isCancelled: args.isCancelled,
  });
}

export async function runSapGeneratorClientHarness(
  run: AgentRun,
  site: WordPressSite,
  contract: TaskExecutionClientRunContract,
  executionId: number,
  ctx: AgentRunHarnessContext,
  batchKey: string,
): Promise<AgentRunResult> {
  const payload = entityPageCreatorPayloadFromContract(contract as Record<string, unknown>);
  const postCount = payload.entityPageCount ?? payload.postCount ?? 1;

  initPostCreatorProof(run.id, postCount, true);

  if (!ctx.isResume) {
    await ctx.onStep?.("Preflight", "running", undefined, AGENT_RUN_STEP_KEYS.preflight);
  }
  await patchTaskExecutionProgress(run.teamId, executionId, {
    stepId: "preflight",
    message: "Starting SAP generator…",
    progress: 0.02,
  });

  const result = await runSapGeneratorAgentHarness({
    site,
    payload,
    run,
    executionId,
    resumePoint: ctx.resumePoint,
    isCancelled: ctx.isCancelled,
    onProgress: (label, progress, resumePayload) => {
      void patchTaskExecutionProgress(run.teamId, executionId, { message: label, progress });
      return ctx.onStep?.(label, "running", resumePayload);
    },
  });

  syncPostCreatorProof(run.id, {
    postCount,
    files: [],
    featuredImageEnabled: true,
    uploadedPosts: result.uploadedPosts,
  });

  await appendEntityPagesSummaryStep(ctx, result.uploadedPosts);

  const message = buildResultMessage(result);
  const saveLocalArchive = effectiveSaveLocalArchive("sap_generator", contract);
  await commitAgentRunDeliverable({
    run,
    stepKey: "entity_bulk_csv",
    stepLabel: "Entity bulk CSV",
    files: [
      {
        fileName: "entity-bulk.csv",
        mime: "text/csv",
        content: result.bulkCsv,
      },
    ],
    textPreview: message,
    saveLocalArchive,
  });

  const emailResult = await completeAgentRunExecution({
    teamId: run.teamId,
    executionId,
    contract,
    run,
    saveLocalArchive,
    ok: true,
    summaryText: message,
    fileNameHint: `${site.name} SAP pages`,
    tokenContext: {
      siteName: site.name,
      automationTitle: automationTitleFromRun(run),
      executionKind: executionKindFromRun(run) || "sap_generator",
      summary: message,
    },
    result: {
      created: result.created,
      failed: result.failed,
      skipped: result.skipped,
      postCount: result.postCount,
      urls: result.urls,
      uploadedPosts: result.uploadedPosts,
    },
    onStep: (label, status) => ctx.onStep?.(label, status ?? "running"),
  });

  return {
    updated: result.created,
    failed: result.failed,
    skipped: result.skipped,
    postCount: result.postCount,
    message,
    batchKey,
    urls: result.urls,
    uploadedPosts: result.uploadedPosts,
    ...emailResult,
  };
}

export async function runSapGeneratorDirectHarness(
  run: AgentRun,
  ctx: AgentRunHarnessContext,
): Promise<AgentRunResult> {
  const siteId = String(run.context?.siteId ?? "").trim();
  if (!siteId) {
    throw new Error("Select a WordPress site before running SAP generator.");
  }

  const site = resolveSite(siteId, getStoredSites());
  const plan = (run.plan ?? {}) as Record<string, unknown>;
  const payload = entityPageCreatorPayloadFromContract(
    (plan.executionPayload ?? plan.clientRunContract ?? plan) as Record<string, unknown>,
  );
  const postCount = payload.entityPageCount ?? payload.postCount ?? 1;

  initPostCreatorProof(run.id, postCount, true);
  await ctx.onStep?.("Starting SAP generator…", "running", undefined, AGENT_RUN_STEP_KEYS.starting);

  const result = await runSapGeneratorAgentHarness({
    site,
    payload,
    run,
    resumePoint: ctx.resumePoint,
    isCancelled: ctx.isCancelled,
    onProgress: async (label, _progress, resumePayload) => {
      await ctx.onStep?.(label, "running", resumePayload);
    },
  });

  syncPostCreatorProof(run.id, {
    postCount,
    files: [],
    featuredImageEnabled: true,
    uploadedPosts: result.uploadedPosts,
  });

  await appendEntityPagesSummaryStep(ctx, result.uploadedPosts);

  const message = buildResultMessage(result);

  return {
    updated: result.created,
    failed: result.failed,
    skipped: result.skipped,
    postCount: result.postCount,
    message,
    urls: result.urls,
    uploadedPosts: result.uploadedPosts,
  };
}

export function shouldRunSapGeneratorHarness(contract: TaskExecutionClientRunContract): boolean {
  const payload = ensureEntityPageCreatorPayload(contract as EntityPageCreatorExecutionPayload);
  if (payload.entityCsvInputSource === "workflow") return true;
  if (payload.entityCsvInputSource === "upload") return true;
  if (payload.entityCsvBase64?.trim() || payload.entityCsvUrl?.trim()) return true;
  return false;
}
