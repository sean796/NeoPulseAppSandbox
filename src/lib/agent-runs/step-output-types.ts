/** Legacy workflow step output shape retained for CSV / deliverable resolution helpers. */
export type AgentRunStepOutputFileRef = {
  name: string;
  url?: string;
  mime?: string;
};

export type AgentRunStepOutputSnapshot = {
  variableKey: string;
  scope?: string;
  agentRunId?: number;
  textPreview?: string;
  fileRefs?: AgentRunStepOutputFileRef[];
};