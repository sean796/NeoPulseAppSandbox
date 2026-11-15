import { fetchAgentRunCsvContent } from "@/lib/agent-runs-api";
import type {
  AgentRunStepOutputFileRef,
  AgentRunStepOutputSnapshot,
} from "@/lib/agent-runs/step-output-types";

export function isGridCsvFileRef(file: AgentRunStepOutputFileRef): boolean {
  const name = file.name?.trim().toLowerCase() ?? "";
  const mime = file.mime?.trim().toLowerCase() ?? "";
  return mime === "text/csv" || name.endsWith(".csv");
}

function pickGridCsvAgentRunId(
  outputs: AgentRunStepOutputSnapshot[],
  ragInputKeys?: string[],
): number | undefined {
  const runScoped = outputs.filter((output) => output.scope === "run");

  const tryPick = (list: AgentRunStepOutputSnapshot[]): number | undefined => {
    for (const output of list) {
      const hasCsv = (output.fileRefs ?? []).some((file) => file.url && isGridCsvFileRef(file));
      if (hasCsv && output.agentRunId) {
        return output.agentRunId;
      }
    }
    return undefined;
  };

  if (ragInputKeys && ragInputKeys.length > 0) {
    const keySet = new Set(ragInputKeys);
    const matched = runScoped.filter((output) => keySet.has(output.variableKey));
    const fromKeys = tryPick(matched);
    if (fromKeys) return fromKeys;
  }

  return tryPick(runScoped);
}

function pickGridCsvUrlFromOutputs(
  outputs: AgentRunStepOutputSnapshot[],
  ragInputKeys?: string[],
): string | undefined {
  const runScoped = outputs.filter((output) => output.scope === "run");

  const tryPick = (list: AgentRunStepOutputSnapshot[]): string | undefined => {
    for (const output of list) {
      const csvRef = (output.fileRefs ?? []).find((file) => file.url && isGridCsvFileRef(file));
      if (csvRef?.url) return csvRef.url;
    }
    return undefined;
  };

  if (ragInputKeys && ragInputKeys.length > 0) {
    const keySet = new Set(ragInputKeys);
    const matched = runScoped.filter((output) => keySet.has(output.variableKey));
    const fromKeys = tryPick(matched);
    if (fromKeys) return fromKeys;
  }

  return tryPick(runScoped);
}

function pickGridCsvUrl(outputs: AgentRunStepOutputSnapshot[], ragInputKeys?: string[]): string {
  const url = pickGridCsvUrlFromOutputs(outputs, ragInputKeys);
  if (url) return url;
  throw new Error("Upstream Local Dominator export did not produce a grid CSV.");
}

export async function resolveUpstreamGridCsvFromWorkflow(args: {
  teamId?: number;
  workflowId?: number;
  workflowRunId?: number;
  ragInputKeys?: string[];
  /** When upstream step outputs are already available (non-workflow runs). */
  outputs?: AgentRunStepOutputSnapshot[];
}): Promise<string> {
  const outputs = args.outputs ?? [];
  if (outputs.length > 0) {
    const agentRunId = pickGridCsvAgentRunId(outputs, args.ragInputKeys);
    if (agentRunId && args.teamId) {
      const csvText = await fetchAgentRunCsvContent(args.teamId, agentRunId);
      if (csvText?.trim()) return csvText;
    }
    const url = pickGridCsvUrlFromOutputs(outputs, args.ragInputKeys);
    if (url) {
      const { fetchAppApiText } = await import("@/lib/proxy-fetch-text");
      const text = await fetchAppApiText(url);
      if (text.trim()) return text;
    }
  }

  throw new Error("Grid CSV is required. Upload grid CSV on the task or provide upstream export outputs.");
}

export function resolveUpstreamGridCsvUrlFromOutputs(
  outputs: AgentRunStepOutputSnapshot[],
  ragInputKeys?: string[],
): string {
  return pickGridCsvUrl(outputs, ragInputKeys);
}