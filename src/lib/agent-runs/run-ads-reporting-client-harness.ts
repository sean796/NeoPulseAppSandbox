import type { WordPressSite } from "@/components/integrations/types";
import type { AgentRunHarnessContext } from "@/lib/agent-runs/harness-registry";
import { resolveGscReportingSite } from "@/lib/agent-runs/resolve-agent-run-site";
import { commitAgentRunDeliverable } from "@/lib/agent-runs/commit-agent-run-deliverable";
import { runAdsReportingAgentHarness } from "@/lib/ads-reporting/ads-reporting-agent-harness";
import { downloadAdsReportingArtifacts } from "@/lib/ads-reporting/ads-reporting-download";
import type { AgentRun, AgentRunResult } from "@/lib/agent-runs-types";
import type { TaskExecutionClientRunContract, TaskExecutionPayload } from "@/lib/tasks-types";
import { patchTaskExecutionProgress } from "@/lib/tasks-api";
import { resolveAdsReportingRunConfig } from "@/lib/ads-reporting/resolve-ads-reporting-run-config";
import { effectiveSaveLocalArchive, effectiveSaveToDisk } from "@/lib/schedule-output-destination";
import {
  adsReportingArchiveFiles,
  adsReportingFinalReportFile,
  type TaskArchiveFileInput,
} from "@/lib/task-execution-archive";
import { automationTitleFromRun } from "@/lib/automation-email-delivery";
import { AGENT_RUN_STEP_KEYS } from "@/lib/agent-runs/agent-run-step-keys";
import { resolveAdsAgentProgressStepKey } from "@/lib/ads-reporting/ads-reporting-progress-log";
import { completeAgentRunExecution } from "@/lib/agent-runs/complete-agent-run-execution";

function executionPayloadFromSource(
  source: TaskExecutionClientRunContract | TaskExecutionPayload | Record<string, unknown>,
): TaskExecutionPayload {
  return source as TaskExecutionPayload;
}

async function persistAdsReportingDeliverables(
  run: AgentRun,
  archiveFiles: TaskArchiveFileInput[],
  saveLocalArchive: boolean,
): Promise<void> {
  const deliverableFiles = archiveFiles.filter((file) => file.fileName.trim() && file.content.trim());
  let savedCount = 0;
  for (const file of deliverableFiles) {
    savedCount += 1;
    await commitAgentRunDeliverable({
      run,
      stepKey: AGENT_RUN_STEP_KEYS.gscDeliverables,
      stepLabel: `Deliverables (${savedCount}/${deliverableFiles.length})`,
      files: [file],
      textPreview: file.fileName,
      saveLocalArchive,
    });
  }
}

export async function runAdsReportingClientHarness(
  run: AgentRun,
  site: WordPressSite,
  contract: TaskExecutionClientRunContract,
  executionId: number,
  ctx: AgentRunHarnessContext,
  batchKey: string,
): Promise<AgentRunResult> {
  const { comparePreset, compareRanges, adsReportStructure } = resolveAdsReportingRunConfig(
    executionPayloadFromSource(contract),
  );
  const saveToDisk = effectiveSaveToDisk("ads_reporting", contract);
  const saveLocalArchive = effectiveSaveLocalArchive("ads_reporting", contract);

  const result = await runAdsReportingAgentHarness({
    site,
    comparePreset,
    compareRanges,
    adsReportStructure,
    isCancelled: ctx.isCancelled,
    resumePoint: ctx.resumePoint,
    onProgress: async (p, resumePayload) => {
      const stepKey = resolveAdsAgentProgressStepKey(p.label, resumePayload);
      await ctx.onStep?.(p.label, "running", resumePayload, stepKey);
      await patchTaskExecutionProgress(run.teamId, executionId, {
        message: p.label,
        progress: p.total > 0 ? p.step / p.total : undefined,
      });
    },
  });

  if (saveToDisk && !saveLocalArchive) {
    downloadAdsReportingArtifacts({
      markdown: result.markdown,
      files: result.files,
      siteName: site.name,
      comparePreset,
    });
  }

  const archiveStamp = Date.now();
  const archiveFiles = adsReportingArchiveFiles({
    markdown: result.markdown,
    files: result.files,
    siteName: site.name,
    comparePreset,
    dateStamp: archiveStamp,
  });
  const finalReportFile = adsReportingFinalReportFile({
    markdown: result.markdown,
    siteName: site.name,
    comparePreset,
    dateStamp: archiveStamp,
  });
  await persistAdsReportingDeliverables(run, archiveFiles, saveLocalArchive);

  const deliveryResult = await completeAgentRunExecution({
    teamId: run.teamId,
    executionId,
    contract,
    run,
    saveLocalArchive,
    ok: true,
    attachments: [finalReportFile],
    fileNameHint: finalReportFile.fileName.replace(/\.md$/i, ""),
    summaryText: result.markdown,
    tokenContext: {
      siteName: site.name,
      siteUrl: site.siteUrl ?? site.productionSiteUrl,
      automationTitle: automationTitleFromRun(run),
      executionKind: "ads_reporting",
      compareLabel: result.compareLabel,
      comparePreset,
      attachmentDateStamp: archiveStamp,
      summary: `PPC ${comparePreset === "yoy" ? "YoY" : "MoM"} report generated`,
    },
    result: {
      comparePreset,
      compareLabel: result.compareLabel,
      sectionCount: result.sectionResults.length,
    },
    onStep: (label, status) => ctx.onStep?.(label, status ?? "running"),
  });

  return {
    updated: 1,
    message: `PPC ${comparePreset === "yoy" ? "YoY" : "MoM"} report generated`,
    batchKey,
    ...deliveryResult,
  };
}

export async function runAdsReportingDirectHarness(
  run: AgentRun,
  ctx: AgentRunHarnessContext,
): Promise<AgentRunResult> {
  const site = resolveGscReportingSite(run, ctx.sites ?? []);
  const plan = (run.plan ?? {}) as Record<string, unknown>;
  const planPayload = (plan.executionPayload ?? plan.clientRunContract ?? plan) as TaskExecutionPayload;
  const { comparePreset, compareRanges, adsReportStructure } = resolveAdsReportingRunConfig(planPayload);
  const saveToDisk = effectiveSaveToDisk("ads_reporting", planPayload);
  const saveLocalArchive = effectiveSaveLocalArchive("ads_reporting", planPayload);

  await ctx.onStep?.("Starting PPC report…", "running", undefined, AGENT_RUN_STEP_KEYS.starting);

  const result = await runAdsReportingAgentHarness({
    site,
    comparePreset,
    compareRanges,
    adsReportStructure,
    isCancelled: ctx.isCancelled,
    resumePoint: ctx.resumePoint,
    onProgress: async (p, resumePayload) => {
      const stepKey = resolveAdsAgentProgressStepKey(p.label, resumePayload);
      await ctx.onStep?.(p.label, "running", resumePayload, stepKey);
    },
  });

  if (saveToDisk && !saveLocalArchive) {
    downloadAdsReportingArtifacts({
      markdown: result.markdown,
      files: result.files,
      siteName: site.name,
      comparePreset,
    });
  }

  const archiveStamp = Date.now();
  const archiveFiles = adsReportingArchiveFiles({
    markdown: result.markdown,
    files: result.files,
    siteName: site.name,
    comparePreset,
    dateStamp: archiveStamp,
  });
  await persistAdsReportingDeliverables(run, archiveFiles, saveLocalArchive);

  return {
    updated: 1,
    message: `PPC ${comparePreset === "yoy" ? "YoY" : "MoM"} report generated`,
    batchKey: run.clientBatchKey || undefined,
    comparePreset,
    compareLabel: result.compareLabel,
    sectionCount: result.sectionResults.length,
  };
}
