import type { AgentRun } from "@/lib/agent-runs-types";
import { isAgentRunTerminal } from "@/lib/agent-runs-types";
import { buildAgentRunViewPath } from "@/lib/agent-runs/agent-run-optimizer-url";
import {
  agentRunGeneratorSection,
  resolveAgentRunRecipeKey,
} from "@/lib/agent-runs/agent-run-navigation";
import { agentRunSiteId } from "@/lib/agent-runs/agent-run-batch-key";
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

function patchFromAgentRun(run: AgentRun) {
  return {
    title: titleFromAgentRun(run),
    status: statusFromAgentRun(run),
    siteId: agentRunSiteId(run) || undefined,
    href: hrefFromAgentRun(run),
    step: stepFromAgentRun(run),
    progress: progressFromAgentRun(run),
    errorMessage: run.errorMessage?.trim() || undefined,
    agentRunId: run.id,
  };
}

/** Register only a freshly started agent run. Never used for history dumps. */
export function trackStartedAgentRun(run: AgentRun): WorkspaceTask {
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
