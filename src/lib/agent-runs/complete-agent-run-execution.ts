import { completeTaskExecution } from "@/lib/tasks-api";
import { buildExecutionCompletePayload, type TaskArchiveFileInput } from "@/lib/task-execution-archive";
import type { AgentRun } from "@/lib/agent-runs-types";
import { completeExecutionWithDeliveries, type AutomationRunDeliveryResult } from "@/lib/automation-run-deliveries";
import type { AutomationEmailTokenContext } from "@/lib/automation-email-delivery";
import type { TaskExecutionClientRunContract } from "@/lib/tasks-types";
import { AGENT_RUN_STEP_KEYS } from "@/lib/agent-runs/agent-run-step-keys";

type AutomationDeliveryOnStep = (
  label: string,
  status?: "running" | "done" | "error",
  resumePayload?: Record<string, unknown>,
  stepKey?: string,
) => void | Promise<void>;

export function shouldSkipInlineDeliveries(_run: AgentRun): boolean {
  return false;
}

export function inferAutomationDeliveryStepKey(
  label: string,
  status: "running" | "done" | "error" = "running",
): string {
  const trimmed = label.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("google drive: failed") || (lower.includes("google drive") && status === "error")) {
    return AGENT_RUN_STEP_KEYS.automationGoogleDriveError;
  }
  if (lower.startsWith("google drive: uploaded") || lower === "uploaded to google drive") {
    return AGENT_RUN_STEP_KEYS.automationGoogleDriveComplete;
  }
  if (lower.startsWith("google drive: uploading") || lower.startsWith("uploading to google drive")) {
    return AGENT_RUN_STEP_KEYS.automationGoogleDriveUpload;
  }
  if (
    lower.startsWith("google drive: resolving")
    || lower.startsWith("resolved google drive folder")
    || lower.startsWith("created google drive folder")
  ) {
    return AGENT_RUN_STEP_KEYS.automationGoogleDriveResolve;
  }
  if (lower.startsWith("email: failed") || (lower.startsWith("email") && status === "error")) {
    return AGENT_RUN_STEP_KEYS.automationEmailError;
  }
  if (lower.startsWith("email: sent") || lower.startsWith("email: skipped") || lower === "email sent") {
    return AGENT_RUN_STEP_KEYS.automationEmailComplete;
  }
  if (lower.startsWith("email: sending") || lower.startsWith("sending email")) {
    return AGENT_RUN_STEP_KEYS.automationEmailSend;
  }
  if (lower.startsWith("local: saved")) {
    return AGENT_RUN_STEP_KEYS.automationLocalComplete;
  }
  return AGENT_RUN_STEP_KEYS.automationDelivery;
}

function createAutomationDeliveryOnStep(
  onStep: AutomationDeliveryOnStep | undefined,
): AutomationDeliveryOnStep {
  return async (label, status = "running", resumePayload, stepKey) => {
    const key = stepKey ?? inferAutomationDeliveryStepKey(label, status);
    await onStep?.(
      label,
      status,
      { phase: "automation_delivery", ...resumePayload },
      key,
    );
  };
}

export async function completeExecutionArchiveOnly(args: {
  teamId: number;
  executionId: number;
  run: AgentRun;
  saveLocalArchive: boolean;
  ok: boolean;
  result: Record<string, unknown>;
  archiveFiles?: TaskArchiveFileInput[];
  error?: string;
}): Promise<void> {
  if (args.executionId <= 0) return;
  await completeTaskExecution(
    args.teamId,
    args.executionId,
    buildExecutionCompletePayload({
      ok: args.ok,
      run: args.run,
      saveLocalArchive: args.saveLocalArchive,
      archiveFiles: args.saveLocalArchive ? args.archiveFiles : undefined,
      result: args.result,
      error: args.error,
    }),
  );
}

export async function completeAgentRunExecution(args: {
  run: AgentRun;
  teamId: number;
  executionId: number;
  contract: TaskExecutionClientRunContract | Record<string, unknown>;
  saveLocalArchive: boolean;
  ok: boolean;
  result: Record<string, unknown>;
  summaryText: string;
  archiveFiles?: TaskArchiveFileInput[];
  attachments?: TaskArchiveFileInput[];
  fileNameHint?: string;
  tokenContext: AutomationEmailTokenContext;
  onStep?: (label: string, status?: "running" | "done" | "error") => void | Promise<void>;
}): Promise<AutomationRunDeliveryResult | Record<string, never>> {
  return completeExecutionWithDeliveries({
    teamId: args.teamId,
    executionId: args.executionId,
    contract: args.contract,
    run: args.run,
    saveLocalArchive: args.saveLocalArchive,
    ok: args.ok,
    archiveFiles: args.archiveFiles,
    attachments: args.attachments,
    fileNameHint: args.fileNameHint,
    summaryText: args.summaryText,
    tokenContext: args.tokenContext,
    result: args.result,
    onStep: args.onStep ? createAutomationDeliveryOnStep(args.onStep) : undefined,
  });
}
