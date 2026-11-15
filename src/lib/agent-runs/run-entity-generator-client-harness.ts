import type { WordPressSite } from "@/components/integrations/types";
import { getStoredSites } from "@/components/integrations/storage";
import type { AgentRunHarnessContext } from "@/lib/agent-runs/harness-registry";
import { AGENT_RUN_STEP_KEYS } from "@/lib/agent-runs/agent-run-step-keys";
import type { AgentRun, AgentRunResult } from "@/lib/agent-runs-types";
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
import { generateEntityLocationRows } from "@/lib/entity-page-creator/entity-page-creator-phases";
import {
  configuredEntityPageTotal,
} from "@/lib/local-analysis/entity-ad-group-budget";

function resolveSite(siteId: string, sites: WordPressSite[]): WordPressSite {
  const fromList = sites.find((s) => s.id === siteId);
  if (fromList) return fromList;
  const stored = getStoredSites().find((s) => s.id === siteId);
  if (stored) return stored;
  throw new Error("WordPress site not found for this entity generator run.");
}

function buildEntityGeneratorMessage(rowCount: number): string {
  return `Generated ${rowCount} entity row${rowCount === 1 ? "" : "s"}`;
}

export async function runEntityGeneratorAgentHarness(args: {
  site: WordPressSite;
  payload: EntityPageCreatorExecutionPayload;
  run: AgentRun;
  onProgress?: (label: string, progress?: number) => void;
}): Promise<{
  rowCount: number;
  bulkCsv: string;
  gridInputResolved?: boolean;
}> {
  const result = await generateEntityLocationRows(args);
  return {
    rowCount: result.rows.length,
    bulkCsv: result.bulkCsv,
    gridInputResolved: result.gridInputResolved,
  };
}

export async function runEntityGeneratorClientHarness(
  run: AgentRun,
  site: WordPressSite,
  contract: TaskExecutionClientRunContract,
  executionId: number,
  ctx: AgentRunHarnessContext,
  batchKey: string,
): Promise<AgentRunResult> {
  const payload = entityPageCreatorPayloadFromContract(contract as Record<string, unknown>);

  if (!ctx.isResume) {
    await ctx.onStep?.("Preflight", "running", undefined, AGENT_RUN_STEP_KEYS.preflight);
  }
  await patchTaskExecutionProgress(run.teamId, executionId, {
    stepId: "preflight",
    message: "Starting entity generator…",
    progress: 0.02,
  });

  const result = await runEntityGeneratorAgentHarness({
    site,
    payload,
    run,
    onProgress: (label, progress) => {
      void patchTaskExecutionProgress(run.teamId, executionId, { message: label, progress });
      return ctx.onStep?.(label, "running");
    },
  });

  const message = buildEntityGeneratorMessage(result.rowCount);
  const saveLocalArchive = effectiveSaveLocalArchive("entity_generator", contract);
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
    fileNameHint: `${site.name} entity CSV`,
    tokenContext: {
      siteName: site.name,
      automationTitle: automationTitleFromRun(run),
      executionKind: executionKindFromRun(run) || "entity_generator",
      summary: message,
    },
    result: {
      rowCount: result.rowCount,
      gridInputResolved: result.gridInputResolved,
    },
    onStep: (label, status) => ctx.onStep?.(label, status ?? "running"),
  });

  return {
    updated: result.rowCount,
    message,
    batchKey,
    gridInputResolved: result.gridInputResolved,
    ...emailResult,
  };
}

export async function runEntityGeneratorDirectHarness(
  run: AgentRun,
  ctx: AgentRunHarnessContext,
): Promise<AgentRunResult> {
  const siteId = String(run.context?.siteId ?? "").trim();
  if (!siteId) {
    throw new Error("Select a WordPress site before running entity generator.");
  }

  const site = resolveSite(siteId, getStoredSites());
  const plan = (run.plan ?? {}) as Record<string, unknown>;
  const payload = entityPageCreatorPayloadFromContract(
    (plan.executionPayload ?? plan.clientRunContract ?? plan) as Record<string, unknown>,
  );

  await ctx.onStep?.("Starting entity generator…", "running", undefined, AGENT_RUN_STEP_KEYS.starting);

  const result = await runEntityGeneratorAgentHarness({
    site,
    payload,
    run,
    onProgress: async (label) => {
      await ctx.onStep?.(label, "running");
    },
  });

  const message = buildEntityGeneratorMessage(result.rowCount);

  return {
    updated: result.rowCount,
    message,
    gridInputResolved: result.gridInputResolved,
  };
}

export function entityGeneratorDefaultRowCount(payload?: EntityPageCreatorExecutionPayload | null): number {
  const p = ensureEntityPageCreatorPayload(payload);
  return configuredEntityPageTotal(p.entityAdGroupCount!, p.entityAdsPerGroup!);
}
