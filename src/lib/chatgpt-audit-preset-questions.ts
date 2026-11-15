import {
  finishChatGptAuditJob,
  startNewChatForAuditJob,
  submitChatGptAuditQuery,
} from "@/lib/chatgpt-audit-api";
import { auditQuestionsForSave } from "@/lib/chatgpt-audit-questions";
import type { WordPressSite } from "@/components/integrations/types";
import { resolveTaskExecutionBucket } from "@/lib/task-execution-bucket";
import { resolveTaskExecutionBucketUrls } from "@/lib/task-execution-resolve-bucket-urls";
import { ensureChatGptAuditExecutionPayload } from "@/lib/chatgpt-audit/ensure-chatgpt-audit-execution-payload";
import type { AgentRun } from "@/lib/agent-runs-types";
import type { TaskExecutionClientRunContract, TaskExecutionPayload } from "@/lib/tasks-types";

export type ChatGptAuditPresetDriverState = {
  questionsSent: boolean;
  finishSent: boolean;
};

export type ChatGptAuditMultiUrlDriverState = {
  urlIndex: number;
  urlResponseStart: number;
  questionsSent: boolean;
  finishSent: boolean;
  newChatRequested: boolean;
  completedUrls: string[];
};

export function resolveChatGptAuditQuestions(
  contract?: TaskExecutionClientRunContract | Record<string, unknown>,
  run?: AgentRun,
): string[] {
  const contractQuestions = auditQuestionsForSave(
    (contract as TaskExecutionClientRunContract | undefined)?.auditQuestions,
  );
  if (contractQuestions.length > 0) return contractQuestions;
  return auditQuestionsForSave(run?.plan?.executionPayload?.auditQuestions);
}

export async function resolveChatGptAuditTargetUrls(
  site: WordPressSite,
  contract?: TaskExecutionClientRunContract | Record<string, unknown>,
  run?: AgentRun,
  onProgress?: (message: string) => void,
): Promise<string[]> {
  const payload = ensureChatGptAuditExecutionPayload({
    ...((run?.plan?.executionPayload ?? {}) as TaskExecutionPayload),
    ...((contract ?? {}) as TaskExecutionPayload),
  });
  const explicitUrls = Array.isArray(payload.targetUrls)
    ? payload.targetUrls.map((url) => String(url ?? "").trim()).filter(Boolean)
    : [];
  if (Array.isArray(payload.targetUrls) && payload.targetUrls.length === 0) {
    throw new Error("Select at least one URL to audit.");
  }
  if (explicitUrls.length > 0) return explicitUrls;

  const bucket = resolveTaskExecutionBucket(payload);
  if (!bucket) {
    throw new Error("Set a target bucket on the ChatGPT audit step.");
  }
  return resolveTaskExecutionBucketUrls(site, bucket, onProgress);
}

export function createChatGptAuditPresetDriverState(): ChatGptAuditPresetDriverState {
  return { questionsSent: false, finishSent: false };
}

export function createChatGptAuditMultiUrlDriverState(): ChatGptAuditMultiUrlDriverState {
  return {
    urlIndex: 0,
    urlResponseStart: 0,
    questionsSent: false,
    finishSent: false,
    newChatRequested: false,
    completedUrls: [],
  };
}

async function sendAuditQuestions(
  jobId: string,
  questions: string[],
  clientUrl: string,
): Promise<void> {
  for (const question of questions) {
    const result = await submitChatGptAuditQuery(jobId, question, clientUrl);
    if (!result.ok) {
      throw new Error(result.error ?? "Could not send audit question.");
    }
  }
}

/** Send setup questions once after session ready; finish once all replies are captured. */
export async function driveChatGptAuditPresetQuestions(args: {
  jobId: string;
  questions: string[];
  sessionReady: boolean;
  responseCount: number;
  state: ChatGptAuditPresetDriverState;
  clientUrl?: string;
}): Promise<void> {
  if (args.questions.length === 0) return;

  if (args.sessionReady && !args.state.questionsSent) {
    await sendAuditQuestions(args.jobId, args.questions, args.clientUrl ?? "");
    args.state.questionsSent = true;
  }

  if (
    args.state.questionsSent &&
    !args.state.finishSent &&
    args.responseCount >= args.questions.length
  ) {
    const result = await finishChatGptAuditJob(args.jobId);
    if (!result.ok) {
      throw new Error(result.error ?? "Could not finish ChatGPT audit session.");
    }
    args.state.finishSent = true;
  }
}

export async function driveChatGptAuditMultiUrlQuestions(args: {
  jobId: string;
  urls: string[];
  questions: string[];
  sessionReady: boolean;
  newChatReady: boolean;
  newChatUrl: string | null;
  responseCount: number;
  state: ChatGptAuditMultiUrlDriverState;
  onUrlComplete: (url: string, responseCountForUrl: number) => Promise<void>;
  onAdvanceToUrl?: (urlIndex: number, totalUrls: number, url: string) => void | Promise<void>;
}): Promise<void> {
  if (args.questions.length === 0 || args.urls.length === 0) return;

  const currentUrl = args.urls[args.state.urlIndex];
  if (!currentUrl) return;

  const chatReady =
    args.state.urlIndex === 0
      ? args.sessionReady
      : args.newChatReady && (args.newChatUrl ?? "") === currentUrl;

  if (chatReady && !args.state.questionsSent) {
    await sendAuditQuestions(args.jobId, args.questions, currentUrl);
    args.state.questionsSent = true;
  }

  const responsesForUrl = args.responseCount - args.state.urlResponseStart;
  if (!args.state.questionsSent || responsesForUrl < args.questions.length) {
    return;
  }

  if (!args.state.completedUrls.includes(currentUrl)) {
    args.state.completedUrls.push(currentUrl);
    await args.onUrlComplete(currentUrl, responsesForUrl);
  }

  const isLastUrl = args.state.urlIndex >= args.urls.length - 1;
  if (isLastUrl) {
    if (!args.state.finishSent) {
      const result = await finishChatGptAuditJob(args.jobId);
      if (!result.ok) {
        throw new Error(result.error ?? "Could not finish ChatGPT audit session.");
      }
      args.state.finishSent = true;
    }
    return;
  }

  args.state.urlIndex += 1;
  args.state.urlResponseStart = args.responseCount;
  args.state.questionsSent = false;
  args.state.newChatRequested = false;

  const nextUrl = args.urls[args.state.urlIndex];
  if (!nextUrl || args.state.newChatRequested) return;

  await args.onAdvanceToUrl?.(args.state.urlIndex + 1, args.urls.length, nextUrl);

  const result = await startNewChatForAuditJob(args.jobId, nextUrl);
  if (!result.ok) {
    throw new Error(result.error ?? "Could not start a new ChatGPT chat for the next URL.");
  }
  args.state.newChatRequested = true;
}
