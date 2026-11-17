import type { AgentRun, EditorialAuditConsoleEvent } from "@/lib/agent-runs-types";
import { isAgentRunTerminal } from "@/lib/agent-runs-types";
import { buildAgentRunViewPath } from "@/lib/agent-runs/agent-run-optimizer-url";
import {
  agentRunGeneratorSection,
  resolveAgentRunRecipeKey,
} from "@/lib/agent-runs/agent-run-navigation";
import { agentRunSiteId } from "@/lib/agent-runs/agent-run-batch-key";
import { logger } from "@/lib/logger";
import {
  getWorkspaceTask,
  listWorkspaceTasks,
  patchWorkspaceTask,
  registerWorkspaceTask,
} from "@/lib/task-manager/runtime-store";
import type { WorkspaceTask, WorkspaceTaskStatus } from "@/lib/task-manager/types";

function taskIdForAgentRun(runId: number): string {
  return `agent-run-${runId}`;
}

const printedConsoleLines = new Map<number, number>();

function sizeOrQ(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "?";
}

function secondsOrQ(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "?";
}

function printConsoleEvent(event: EditorialAuditConsoleEvent): void {
  const kind = (event.kind ?? "").trim();
  const model = (event.model ?? "").trim() || "?";
  if (kind === "llm_call") {
    logger.llm(
      `[LLM] call -> ${model} | prompt ${sizeOrQ(event.promptChars)} chars | maxTokens ${sizeOrQ(event.maxTokens)} | JSON output`,
    );
    return;
  }
  if (kind === "llm_done") {
    logger.llmSuccess(
      `[LLM] done <- ${model} | reply ${sizeOrQ(event.replyChars)} chars | finish ${event.finish?.trim() || "?"} | ${secondsOrQ(event.seconds)}s`,
    );
    return;
  }
  if (kind === "llm_fail") {
    const err = (event.error ?? "").trim() || "failed";
    const status = typeof event.status === "number" ? event.status : "?";
    logger.llmFail(
      `[LLM] FAILED <- ${model} | HTTP ${status} | ${secondsOrQ(event.seconds)}s | ${err}`,
    );
    return;
  }
  if (kind === "publish" || kind === "publish_fail") {
    const label = (event.label ?? "").trim() || (event.url ?? "").trim() || "request";
    const status = typeof event.status === "number" ? event.status : "?";
    const rows =
      typeof event.rows === "number" ? ` | rows ${event.rows}` : "";
    const err = kind === "publish_fail" && (event.error ?? "").trim()
      ? ` | ${(event.error ?? "").trim()}`
      : "";
    logger.publish(
      `[WP] ${label} | ${status} | ${secondsOrQ(event.seconds)}s${rows}${err}`,
    );
  }
}

function printRunConsoleLog(run: AgentRun): void {
  const lines = run.result?.consoleLog;
  if (!Array.isArray(lines) || lines.length === 0) return;
  const seen = printedConsoleLines.get(run.id) ?? 0;
  for (let i = seen; i < lines.length; i += 1) {
    const line = lines[i];
    if (line && typeof line === "object" && "kind" in line) {
      printConsoleEvent(line as EditorialAuditConsoleEvent);
    }
  }
  printedConsoleLines.set(run.id, lines.length);
}

function statusFromAgentRun(run: AgentRun): WorkspaceTaskStatus {
  if (run.status === "done") return "done";
  if (run.status === "failed") return "error";
  if (run.status === "cancelled") return "cancelled";
  return "running";
}

function titleFromAgentRun(run: AgentRun): string {
  const title = (run.recipeTitle ?? "").trim();
  if (title) return title;
  return resolveAgentRunRecipeKey(run).replace(/_/g, " ");
}

function hrefFromAgentRun(run: AgentRun): string {
  const section = agentRunGeneratorSection(resolveAgentRunRecipeKey(run));
  return buildAgentRunViewPath(run.id, section);
}

function progressFromAgentRun(run: AgentRun): number | undefined {
  const index = run.result?.checkpoint?.currentIndex;
  const total = run.result?.checkpoint?.totalCount;
  if (typeof index === "number" && typeof total === "number" && total > 0) {
    return Math.max(0, Math.min(100, Math.round((index / total) * 100)));
  }
  const steps = run.steps;
  if (!steps?.length) return undefined;
  const done = steps.filter((step) => step.status === "done").length;
  return Math.max(0, Math.min(100, Math.round((done / steps.length) * 100)));
}

function stepFromAgentRun(run: AgentRun): string | undefined {
  const steps = run.steps;
  if (!steps?.length) return undefined;
  const active = [...steps].reverse().find((step) => step.status === "running")
    ?? [...steps].reverse().find((step) => step.status === "done")
    ?? steps[steps.length - 1];
  const label = (active?.label ?? "").trim();
  return label || undefined;
}

function logLinesFromAgentRun(run: AgentRun): string[] {
  return (run.steps ?? [])
    .map((step) => (step.label ?? "").trim())
    .filter((label) => label.length > 0);
}

function patchFromAgentRun(run: AgentRun) {
  const patch: ReturnType<typeof patchFields> = patchFields(run);
  if (Array.isArray(run.steps) && run.steps.length > 0) {
    patch.logLines = logLinesFromAgentRun(run);
  }
  return patch;
}

function patchFields(run: AgentRun) {
  const folder = run.result?.googleDriveFolderWebViewLink?.trim() || "";
  return {
    title: titleFromAgentRun(run),
    status: statusFromAgentRun(run),
    siteId: agentRunSiteId(run) || undefined,
    href: hrefFromAgentRun(run),
    step: stepFromAgentRun(run),
    progress: progressFromAgentRun(run),
    errorMessage: run.errorMessage?.trim() || undefined,
    agentRunId: run.id,
    currentUrl: folder || undefined,
    currentTitle: folder ? "Open Drive folder" : undefined,
  };
}

/** Register only a freshly started agent run. Never used for history dumps. */
export function trackStartedAgentRun(run: AgentRun): WorkspaceTask {
  printRunConsoleLog(run);
  const id = taskIdForAgentRun(run.id);
  const patch = patchFromAgentRun(run);
  const existing = getWorkspaceTask(id);
  if (!existing) {
    registerWorkspaceTask({
      id,
      title: patch.title,
      kind: resolveAgentRunRecipeKey(run),
      siteId: patch.siteId,
      href: patch.href,
      agentRunId: run.id,
    });
  }
  return patchWorkspaceTask(id, patch) ?? getWorkspaceTask(id)!;
}

/**
 * Update Tasks that are already tracked. Does not create entries from history.
 */
export function refreshTrackedAgentRuns(runs: AgentRun[]): void {
  for (const run of runs) {
    if (run.id <= 0) continue;
    const id = taskIdForAgentRun(run.id);
    const existing = getWorkspaceTask(id);
    if (!existing) continue;
    printRunConsoleLog(run);
    patchWorkspaceTask(id, patchFromAgentRun(run));
  }
}

/**
 * Keep Tasks in sync with live server agent runs across refresh.
 * Active runs reappear in Tasks; terminal updates apply only when already tracked.
 */
export function syncActiveAgentRunsToTasks(runs: AgentRun[]): void {
  for (const run of runs) {
    if (run.id <= 0) continue;
    if (agentRunStillActive(run)) {
      trackStartedAgentRun(run);
      continue;
    }
    const existing = getWorkspaceTask(taskIdForAgentRun(run.id));
    if (!existing) continue;
    patchWorkspaceTask(existing.id, patchFromAgentRun(run));
  }
}

export function findTaskByAgentRunId(agentRunId: number): WorkspaceTask | undefined {
  return listWorkspaceTasks().find((task) => task.agentRunId === agentRunId);
}

export function agentRunStillActive(run: AgentRun): boolean {
  return !isAgentRunTerminal(run.status);
}
