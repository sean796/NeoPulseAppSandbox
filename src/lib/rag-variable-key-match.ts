import type { AgentRunStepOutputSnapshot } from "@/lib/agent-runs/step-output-types";

export function outputMatchesRagVariableKey(
  output: AgentRunStepOutputSnapshot,
  ragKey: string,
  _siteId = "",
  _allSiteIds: string[] = [],
): boolean {
  const key = ragKey.trim();
  if (!key) return false;
  const variableKey = output.variableKey.trim();
  if (variableKey === key) return true;
  return variableKey.startsWith(`${key}__`);
}