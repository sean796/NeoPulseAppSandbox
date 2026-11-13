const CONTEXT_LIMIT = 2_000_000;
const RESERVED_FOR_INPUT = 200_000;
const MAX_OUTPUT_TOKENS = 200_000;

export type OpenRouterChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function clampOpenRouterMaxTokens(maxTokens: number): number {
  return Math.max(1, Math.min(maxTokens, CONTEXT_LIMIT - RESERVED_FOR_INPUT, MAX_OUTPUT_TOKENS));
}
