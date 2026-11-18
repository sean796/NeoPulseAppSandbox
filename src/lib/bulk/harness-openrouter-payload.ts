import type { OpenRouterChatMessage } from '@/lib/openrouter-stream-chat-core';

/** Serializable inbound message for `harness-openrouter.worker.ts`. */
export type HarnessOpenRouterWorkerPayload = {
  sectionIndex: number;
  apiKey: string;
  model: string;
  messages: OpenRouterChatMessage[];
  temperature: number;
  maxTokens: number;
  topP: number;
  httpReferer: string;
  siteId?: string | null;
};
