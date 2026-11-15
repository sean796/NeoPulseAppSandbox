import { persistAgentRunArtifact } from "@/lib/agent-runs/agent-run-artifacts";
import type { AgentRun } from "@/lib/agent-runs-types";
import { persistTaskArchiveFiles, type TaskArchiveFileInput } from "@/lib/task-execution-archive";
import { effectiveSaveLocalArchive } from "@/lib/schedule-output-destination";
import { executionKindFromRun } from "@/lib/automation-email-delivery";
import type { AgentRunStepOutputFileRef } from "@/lib/agent-runs/step-output-types";

/** Persist deliverable files to agent artifacts and task archive as each completes. */
export async function commitAgentRunDeliverable(args: {
  run: AgentRun;
  stepKey: string;
  stepLabel: string;
  files: TaskArchiveFileInput[];
  textPreview?: string;
  saveLocalArchive?: boolean;
  workflowOutputs?: unknown;
  extraFileRefs?: AgentRunStepOutputFileRef[];
  /** When true, workflow output saves replace the prior row for the same variable key. */
  replaceOutput?: boolean;
}): Promise<AgentRunStepOutputFileRef[]> {
  const fileRefs: AgentRunStepOutputFileRef[] = [];

  for (const file of args.files) {
    if (!file.fileName.trim() || !file.content.trim()) continue;
    const artifact = await persistAgentRunArtifact(args.run.teamId, args.run, {
      stepKey: args.stepKey,
      stepLabel: args.stepLabel,
      name: file.fileName,
      mime: file.mime,
      content: file.content,
    });
    if (artifact?.url) {
      fileRefs.push({ name: file.fileName, url: artifact.url, mime: file.mime });
    }
  }

  const kind = executionKindFromRun(args.run);
  const shouldArchive =
    args.saveLocalArchive ??
    effectiveSaveLocalArchive(kind, (args.run.plan ?? {}) as Record<string, unknown>);

  if (shouldArchive && args.run.taskId > 0 && args.files.length > 0) {
    await persistTaskArchiveFiles(args.run.teamId, args.run.taskId, args.files);
  }

  return fileRefs;
}