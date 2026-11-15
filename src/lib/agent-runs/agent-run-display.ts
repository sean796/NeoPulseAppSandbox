import { formatAgentRunTimestamp } from "@/lib/edmonton-time";
import type { AgentRunLiveSnapshot } from "@/components/agent-runs/use-agent-run-live-snapshot";
import { resolveAgentRunRecipeKey } from "@/lib/agent-runs/agent-run-navigation";
import { humanizeSlugFromUrl } from "@/hooks/content-optimization/bulk-optimization-constants";
import type { AgentRun } from "@/lib/agent-runs-types";
import {
  AGENT_RUN_SOURCE_LABELS,
  AGENT_RUN_STATUS_LABELS,
  isAgentRunTerminal,
} from "@/lib/agent-runs-types";
import {
  isTaskExecutionTargetBucket,
  TASK_EXECUTION_TARGET_BUCKET_LABELS,
} from "@/lib/task-execution-bucket";
import { isTaskExecutionTargetAll } from "@/lib/task-execution-target";

export function agentRunTargetLabel(run: AgentRun): string {
  const contract = run.plan?.clientRunContract;
  if (resolveAgentRunRecipeKey(run) === "local_dominator_export") {
    const business = contract?.businessName?.trim();
    const keyword = contract?.keyword?.trim();
    if (business && keyword) return `${business} · ${keyword}`;
  }
  if (contract?.url && !isTaskExecutionTargetAll(contract.url)) {
    return contract.url;
  }
  if (contract?.targetBucket && isTaskExecutionTargetBucket(contract.targetBucket)) {
    return TASK_EXECUTION_TARGET_BUCKET_LABELS[contract.targetBucket];
  }
  if (contract?.scope === "all" || isTaskExecutionTargetAll(contract?.url)) {
    return "All URLs";
  }
  return "—";
}

export function agentRunSourceLine(run: AgentRun): string {
  const parts = [run.recipeTitle, AGENT_RUN_SOURCE_LABELS[run.source]];
  if (run.taskId > 0 && run.taskTitle) {
    parts.push(`From task: ${run.taskTitle}`);
  }
  return parts.join(" · ");
}

export function agentRunCardTitle(run: AgentRun, clientLabel?: string | null): string {
  const title = run.title?.trim() || run.recipeTitle || `Run #${run.id}`;
  const client = clientLabel?.trim();
  if (!client) return title;
  const emDashSuffix = ` — ${client}`;
  if (title.endsWith(emDashSuffix)) return title.slice(0, -emDashSuffix.length).trim();
  const hyphenSuffix = ` - ${client}`;
  if (title.endsWith(hyphenSuffix)) return title.slice(0, -hyphenSuffix.length).trim();
  return title;
}

export function agentRunResultSnippet(run: AgentRun): string | null {
  if (!isAgentRunTerminal(run.status)) return null;
  if (run.status === "failed" || run.status === "cancelled") {
    return run.errorMessage || (run.status === "cancelled" ? "Cancelled" : "Failed");
  }
  const result = run.result;
  if (!result) return "Completed";
  const parts: string[] = [];
  if (typeof result.updated === "number") parts.push(`${result.updated} updated`);
  if (typeof result.skipped === "number") parts.push(`${result.skipped} skipped`);
  if (typeof result.failed === "number") parts.push(`${result.failed} failed`);
  if (result.message) parts.push(result.message);
  return parts.join(" · ") || "Completed";
}

export function splitProgressLabel(label: string | null | undefined): { line1: string; line2: string } {
  const trimmed = label?.trim();
  if (!trimmed) {
    return { line1: "\u00a0", line2: "\u00a0" };
  }
  const parts = trimmed.split(" · ");
  if (parts.length === 1) {
    return { line1: parts[0], line2: "\u00a0" };
  }
  return {
    line1: parts[0].trim() || "\u00a0",
    line2: parts.slice(1).join(" · ").trim() || "\u00a0",
  };
}

function isPlaceholderLine(line: string): boolean {
  return line === "\u00a0" || !line.trim();
}

export function buildAgentRunProgressLabel(step: string, message: string): string | null {
  const stepTrim = step.trim();
  const messageTrim = message.trim();
  if (messageTrim && stepTrim) {
    if (messageTrim === stepTrim || messageTrim.startsWith(`${stepTrim} ·`)) {
      return messageTrim;
    }
    return `${stepTrim} · ${messageTrim}`;
  }
  if (messageTrim) return messageTrim;
  if (stepTrim) return stepTrim;
  return null;
}

export function agentRunIsServerExecution(run: AgentRun): boolean {
  if (run.plan?.executionMode === "client") {
    return false;
  }
  if (run.plan?.executionMode === "server" || run.result?.executionMode === "server") {
    return true;
  }
  return resolveAgentRunRecipeKey(run) === "post_creator";
}

export function agentRunServerStatusLabel(run: AgentRun): string {
  if (run.status === "queued") return "Queued on server";
  if (run.status === "running") return "Running on server";
  return "Server execution";
}

export function isAgentRunNodeDiagnosticLabel(label: string | null | undefined): boolean {
  const trimmed = label?.trim() ?? "";
  if (!trimmed) return false;
  if (trimmed.includes("NODE_TLS_REJECT_UNAUTHORIZED")) return true;
  if (trimmed.includes("node --trace-warnings")) return true;
  return (
    trimmed.startsWith("(node:") &&
    (trimmed.includes("Warning:") || trimmed.includes("DeprecationWarning"))
  );
}

export function agentRunStatusHint(label: string | null | undefined): string | null {
  const trimmed = label?.trim();
  if (!trimmed || isAgentRunNodeDiagnosticLabel(trimmed)) return null;
  const { line1, line2 } = splitProgressLabel(trimmed);
  if (!isPlaceholderLine(line2)) return line2;
  if (!isPlaceholderLine(line1)) return line1;
  return trimmed;
}

export function agentRunInlineStatus(label: string | null | undefined): string {
  const trimmed = label?.trim();
  if (!trimmed || isAgentRunNodeDiagnosticLabel(trimmed)) return "\u00a0";
  const { line1, line2 } = splitProgressLabel(trimmed);
  if (!isPlaceholderLine(line2)) return line2;
  if (!isPlaceholderLine(line1)) return line1;
  return trimmed;
}

function hintDuplicatesStatus(hint: string, status: AgentRun["status"]): boolean {
  const normalized = hint.trim().toLowerCase();
  if (!normalized) return true;
  return normalized === AGENT_RUN_STATUS_LABELS[status].trim().toLowerCase();
}

export function agentRunCollapsedHint(
  run: AgentRun,
  live: AgentRunLiveSnapshot | null,
  hostedFileCount = 0,
): string {
  if (live?.currentUrl?.trim()) {
    const title = live.postTitle?.trim() || humanizeSlugFromUrl(live.currentUrl);
    const progress = agentRunStatusHint(live.progressLabel);
    if (progress && progress !== title && !progress.includes(live.currentUrl)) {
      return `${title} · ${progress}`;
    }
    return title;
  }
  if (live) {
    const hint = agentRunStatusHint(live.progressLabel);
    if (hint) {
      if (isAgentRunTerminal(run.status) && hintDuplicatesStatus(hint, run.status)) {
        const snippet = agentRunResultSnippet(run);
        if (snippet && !hintDuplicatesStatus(snippet, run.status)) return snippet;
        return "";
      }
      if (hostedFileCount > 0 && !isAgentRunTerminal(run.status)) {
        return `${hint} · ${hostedFileCount} file${hostedFileCount === 1 ? "" : "s"} ready`;
      }
      return hint;
    }
  }
  const snippet = agentRunResultSnippet(run);
  if (snippet && isAgentRunTerminal(run.status)) {
    if (!hintDuplicatesStatus(snippet, run.status)) return snippet;
    return "";
  }
  const target = agentRunTargetLabel(run);
  if (target !== "—") {
    return target.startsWith("http") ? humanizeSlugFromUrl(target) : target;
  }
  return run.recipeTitle;
}

export function agentRunTimestampHint(run: AgentRun): string | null {
  if (isAgentRunTerminal(run.status) && run.finishedAt) {
    return `Finished ${formatAgentRunTimestamp(run.finishedAt)}`;
  }
  const checkpointAt = run.result?.checkpoint?.lastStepAt;
  if (checkpointAt && run.status === "running") {
    return `Updated ${formatAgentRunTimestamp(checkpointAt)}`;
  }
  if (run.startedAt) {
    return `Started ${formatAgentRunTimestamp(run.startedAt)}`;
  }
  if (run.updatedAt) {
    return `Updated ${formatAgentRunTimestamp(run.updatedAt)}`;
  }
  return null;
}
