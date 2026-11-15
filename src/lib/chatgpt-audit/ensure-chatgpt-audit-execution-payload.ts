import type { TaskExecutionPayload } from "@/lib/tasks-types";
import {
  isTaskExecutionTargetBucket,
  type TaskExecutionTargetBucket,
} from "@/lib/task-execution-bucket";

const DEFAULT_CHATGPT_AUDIT_BUCKET: TaskExecutionTargetBucket = "pages";

export function normalizeChatGptAuditTargetBucket(value: unknown): TaskExecutionTargetBucket {
  const raw = String(value ?? "").trim();
  if (isTaskExecutionTargetBucket(raw)) return raw;
  return DEFAULT_CHATGPT_AUDIT_BUCKET;
}

/** Ensure ChatGPT audit runs have an explicit bucket when no URL list is set. */
export function ensureChatGptAuditExecutionPayload(
  payload: TaskExecutionPayload,
): TaskExecutionPayload {
  const explicitUrls = Array.isArray(payload.targetUrls)
    ? payload.targetUrls.map((url) => String(url ?? "").trim()).filter(Boolean)
    : [];
  if (explicitUrls.length > 0) {
    return { ...payload, targetUrls: explicitUrls };
  }

  const bucket = payload.targetBucket?.trim();
  if (isTaskExecutionTargetBucket(bucket)) {
    return payload;
  }

  return { ...payload, targetBucket: DEFAULT_CHATGPT_AUDIT_BUCKET };
}