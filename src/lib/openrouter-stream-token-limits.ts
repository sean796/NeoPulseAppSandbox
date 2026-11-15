const CONTEXT_LIMIT = 2_000_000;
const RESERVED_FOR_INPUT = 200_000;

/** OpenRouter max completion budget (no low hardcaps that truncate JSON). */
export const MAX_OUTPUT_TOKENS = 200_000;

export type OpenRouterChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function clampOpenRouterMaxTokens(maxTokens: number): number {
  return Math.max(1, Math.min(maxTokens, CONTEXT_LIMIT - RESERVED_FOR_INPUT, MAX_OUTPUT_TOKENS));
}

/** Default when a caller does not pass maxTokens: max it out. */
export function openRouterMaxOutputTokens(): number {
  return clampOpenRouterMaxTokens(MAX_OUTPUT_TOKENS);
}
