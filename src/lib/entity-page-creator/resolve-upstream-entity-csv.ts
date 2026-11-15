import { fetchAgentRunCsvContent } from "@/lib/agent-runs-api";
import type {
  AgentRunStepOutputFileRef,
  AgentRunStepOutputSnapshot,
} from "@/lib/agent-runs/step-output-types";

function isEntityCsvFileRef(file: AgentRunStepOutputFileRef): boolean {
  const name = file.name?.trim().toLowerCase() ?? "";
  const mime = file.mime?.trim().toLowerCase() ?? "";
  if (name === "entity-bulk.csv" || name === "entity-hydrated.csv") return true;
  return mime === "text/csv" || name.endsWith(".csv");
}

function pickEntityCsvAgentRunId(
  outputs: AgentRunStepOutputSnapshot[],
  ragInputKeys?: string[],
): number | undefined {
  const runScoped = outputs.filter((output) => output.scope === "run");

  const tryPick = (list: AgentRunStepOutputSnapshot[]): number | undefined => {
    for (const output of list) {
      const hasBulk = (output.fileRefs ?? []).some(
        (file) => file.url && file.name?.trim().toLowerCase() === "entity-bulk.csv",
      );
      if (hasBulk && output.agentRunId) return output.agentRunId;
    }
    for (const output of list) {
      const hasCsv = (output.fileRefs ?? []).some((file) => file.url && isEntityCsvFileRef(file));
      if (hasCsv && output.agentRunId) return output.agentRunId;
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

function pickEntityCsvUrlFromOutputs(
  outputs: AgentRunStepOutputSnapshot[],
  ragInputKeys?: string[],
): string | undefined {
  const runScoped = outputs.filter((output) => output.scope === "run");

  const tryPick = (list: AgentRunStepOutputSnapshot[]): string | undefined => {
    for (const output of list) {
      const csvRef = (output.fileRefs ?? []).find(
        (file) => file.url && file.name?.trim().toLowerCase() === "entity-bulk.csv",
      );
      if (csvRef?.url) return csvRef.url;
    }
    for (const output of list) {
      const csvRef = (output.fileRefs ?? []).find((file) => file.url && isEntityCsvFileRef(file));
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

function pickEntityCsvUrl(outputs: AgentRunStepOutputSnapshot[], ragInputKeys?: string[]): string {
  const url = pickEntityCsvUrlFromOutputs(outputs, ragInputKeys);
  if (url) return url;
  throw new Error("Upstream Entity Generator did not produce an entity CSV.");
}

export async function resolveUpstreamEntityCsvFromWorkflow(args: {
  teamId?: number;
  workflowId?: number;
  workflowRunId?: number;
  ragInputKeys?: string[];
  outputs?: AgentRunStepOutputSnapshot[];
}): Promise<string> {
  const outputs = args.outputs ?? [];
  if (outputs.length > 0 && args.teamId) {
    const agentRunId = pickEntityCsvAgentRunId(outputs, args.ragInputKeys);
    if (agentRunId) {
      const csvText = await fetchAgentRunCsvContent(args.teamId, agentRunId);
      if (csvText?.trim()) return csvText;
    }
    const url = pickEntityCsvUrlFromOutputs(outputs, args.ragInputKeys);
    if (url) {
      const { fetchAppApiText } = await import("@/lib/proxy-fetch-text");
      const text = await fetchAppApiText(url);
      if (text.trim()) return text;
    }
  }

  throw new Error("Entity CSV is required. Upload CSV on the task or provide upstream export outputs.");
}

export function resolveUpstreamEntityCsvUrlFromOutputs(
  outputs: AgentRunStepOutputSnapshot[],
  ragInputKeys?: string[],
): string {
  return pickEntityCsvUrl(outputs, ragInputKeys);
}