import type { WordPressSite } from "@/components/integrations/types";
import type { AgentRunHarnessContext } from "@/lib/agent-runs/harness-registry";
import { resolveGscReportingSite } from "@/lib/agent-runs/resolve-agent-run-site";
import { commitAgentRunDeliverable } from "@/lib/agent-runs/commit-agent-run-deliverable";
import { runGscReportingAgentHarness } from "@/lib/gsc-reporting/gsc-reporting-agent-harness";
import { downloadGscReportingArtifacts } from "@/lib/gsc-reporting/gsc-reporting-download";
import type { AgentRun, AgentRunResult } from "@/lib/agent-runs-types";
import type { TaskExecutionClientRunContract, TaskExecutionPayload } from "@/lib/tasks-types";
import { patchTaskExecutionProgress } from "@/lib/tasks-api";
import { resolveGscReportingRunConfig } from "@/lib/gsc-reporting/resolve-gsc-reporting-run-config";
import {
  effectiveSaveLocalArchive,
  effectiveSaveToDisk,
} from "@/lib/schedule-output-destination";
import {
  gscReportingArchiveFiles,
  gscReportingFinalReportFile,
  type TaskArchiveFileInput,
} from "@/lib/task-execution-archive";
import { automationTitleFromRun } from "@/lib/automation-email-delivery";
import { AGENT_RUN_STEP_KEYS } from "@/lib/agent-runs/agent-run-step-keys";
import { resolveGscAgentProgressStepKey } from "@/lib/gsc-reporting/gsc-reporting-progress-log";
import { completeAgentRunExecution } from "@/lib/agent-runs/complete-agent-run-execution";
import { gscReportingSupplementsFromExecutionPayload } from "@/lib/gsc-reporting/gsc-reporting-supplements-from-payload";

function executionPayloadFromSource(
  source: TaskExecutionClientRunContract | TaskExecutionPayload | Record<string, unknown>,
): TaskExecutionPayload {
  return source as TaskExecutionPayload;
}

function gscRunConfigFromSource(
  source: TaskExecutionClientRunContract | TaskExecutionPayload | Record<string, unknown>,
) {
  return resolveGscReportingRunConfig(executionPayloadFromSource(source));
}

async function persistGscReportingDeliverables(
  run: AgentRun,
  archiveFiles: TaskArchiveFileInput[],
  saveLocalArchive: boolean,
): Promise<void> {
  const deliverableFiles = archiveFiles.filter(
    (file) => file.fileName.trim() && file.content.trim(),
  );
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

export async function runGscReportingClientHarness(
  run: AgentRun,
  site: WordPressSite,
  contract: TaskExecutionClientRunContract,
  executionId: number,
  ctx: AgentRunHarnessContext,
  batchKey: string,
): Promise<AgentRunResult> {
  const { comparePreset, compareRanges, gscReportStructure } = gscRunConfigFromSource(contract);
  const saveToDisk = effectiveSaveToDisk("gsc_reporting", contract);
  const saveLocalArchive = effectiveSaveLocalArchive("gsc_reporting", contract);

  await ctx.onStep?.("Preflight", "running", undefined, AGENT_RUN_STEP_KEYS.preflight);
  await patchTaskExecutionProgress(run.teamId, executionId, {
    stepId: "preflight",
    message: "Starting GSC report…",
    progress: 0.02,
  });

  const executionPayload = executionPayloadFromSource(contract);
  const supplements = gscReportingSupplementsFromExecutionPayload(executionPayload);

  const result = await runGscReportingAgentHarness({
    site,
    comparePreset,
    compareRanges,
    gscReportStructure,
    supplements,
    isCancelled: ctx.isCancelled,
    resumePoint: ctx.resumePoint,
    onProgress: async (p, resumePayload) => {
      const stepKey = resolveGscAgentProgressStepKey(p.label, resumePayload);
      await ctx.onStep?.(p.label, "running", resumePayload, stepKey);
      await patchTaskExecutionProgress(run.teamId, executionId, {
        message: p.label,
        progress: p.total > 0 ? p.step / p.total : undefined,
      });
    },
  });

  if (saveToDisk && !saveLocalArchive) {
    downloadGscReportingArtifacts({
      markdown: result.markdown,
      files: result.files,
      siteName: site.name,
      comparePreset,
    });
  }

  const archiveStamp = Date.now();
  const archiveFiles = gscReportingArchiveFiles({
    markdown: result.markdown,
    files: result.files,
    siteName: site.name,
    comparePreset,
    dateStamp: archiveStamp,
  });

  const finalReportFile = gscReportingFinalReportFile({
    markdown: result.markdown,
    siteName: site.name,
    comparePreset,
    dateStamp: archiveStamp,
  });

  await persistGscReportingDeliverables(run, archiveFiles, saveLocalArchive);

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
      executionKind: "gsc_reporting",
      compareLabel: result.compareLabel,
      comparePreset,
      attachmentDateStamp: archiveStamp,
      summary: `GSC ${comparePreset === "yoy" ? "YoY" : "MoM"} report generated`,
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
    message: `GSC ${comparePreset === "yoy" ? "YoY" : "MoM"} report generated`,
    batchKey,
    ...deliveryResult,
  };
}

export async function runGscReportingDirectHarness(
  run: AgentRun,
  ctx: AgentRunHarnessContext,
): Promise<AgentRunResult> {
  const site = resolveGscReportingSite(run, ctx.sites ?? []);
  const plan = (run.plan ?? {}) as Record<string, unknown>;
  const planPayload = (plan.executionPayload ?? plan.clientRunContract ?? plan) as TaskExecutionPayload;
  const { comparePreset, compareRanges, gscReportStructure } = gscRunConfigFromSource(planPayload);
  const saveToDisk = effectiveSaveToDisk("gsc_reporting", planPayload);
  const saveLocalArchive = effectiveSaveLocalArchive("gsc_reporting", planPayload);

  await ctx.onStep?.("Starting GSC report…", "running", undefined, AGENT_RUN_STEP_KEYS.starting);

  const result = await runGscReportingAgentHarness({
    site,
    comparePreset,
    compareRanges,
    gscReportStructure,
    isCancelled: ctx.isCancelled,
    resumePoint: ctx.resumePoint,
    onProgress: async (p, resumePayload) => {
      const stepKey = resolveGscAgentProgressStepKey(p.label, resumePayload);
      await ctx.onStep?.(p.label, "running", resumePayload, stepKey);
    },
  });

  if (saveToDisk && !saveLocalArchive) {
    downloadGscReportingArtifacts({
      markdown: result.markdown,
      files: result.files,
      siteName: site.name,
      comparePreset,
    });
  }

  const archiveStamp = Date.now();
  const archiveFiles = gscReportingArchiveFiles({
    markdown: result.markdown,
    files: result.files,
    siteName: site.name,
    comparePreset,
    dateStamp: archiveStamp,
  });
  const preview = `GSC ${comparePreset === "yoy" ? "YoY" : "MoM"} report generated`;
  await persistGscReportingDeliverables(run, archiveFiles, saveLocalArchive);

  return {
    updated: 1,
    message: preview,
    batchKey: run.clientBatchKey || undefined,
    comparePreset,
    compareLabel: result.compareLabel,
    sectionCount: result.sectionResults.length,
  };
}
