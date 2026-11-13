/** OpenRouter remote model ids use `provider/model` (never bare Ollama `name:tag`). */
export function isOpenRouterRemoteModelId(modelId: string): boolean {
  const id = modelId.trim();
  if (!id.includes("/")) return false;
  if (/^[^:]+:[^/]+$/.test(id)) return false;
  return true;
}

/** Retired OpenRouter ids and the listed model that replaces each one. */
const RETIRED_OPENROUTER_MODEL_IDS: Record<string, string> = {
  "liquid/d1.1": "liquid/lfm-2.5-24b-a2b",
  "liquid/lfm-2.5-2.6b": "liquid/lfm-2.5-24b-a2b",
  "liquid/lfm-2.5-2.6b:free": "liquid/lfm-2.5-24b-a2b",
};

export function coerceOpenRouterModelId(
  modelId: string | undefined | null,
  fallback: string,
): string {
  const id = modelId?.trim() ?? "";
  const replacement = RETIRED_OPENROUTER_MODEL_IDS[id];
  if (replacement) return replacement;
  if (id && isOpenRouterRemoteModelId(id)) return id;
  return fallback.trim();
}
