/**
 * Contract for POST /api/wordpress/ai-import-client OpenRouter extract.
 * Server (PHP) mirrors these rules; browser never calls OpenRouter for this flow.
 */

export const AI_IMPORT_CLIENT_SYSTEM_PROMPT =
  "Extract business profile fields for a WordPress client property. Use ONLY the provided site text and NAP/options JSON. Do not invent brands, cities, or keywords. If unknown, use an empty string. Return JSON only.";

export function buildAiImportClientUserPrompt(input: {
  siteUrl: string;
  siteName: string;
  napJson: string;
  homepageText: string;
}): string {
  return [
    `Site URL: ${input.siteUrl}`,
    `WordPress name: ${input.siteName}`,
    "NAP/options JSON:",
    input.napJson,
    "",
    "Homepage text:",
    input.homepageText,
    "",
    "Return JSON object with keys: name, primaryLocalKeyword, city, state, country.",
  ].join("\n");
}

/** Fields the model may return; omit or empty string when unknown. */
export const AI_IMPORT_CLIENT_EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    primaryLocalKeyword: { type: "string" },
    city: { type: "string" },
    state: { type: "string" },
    country: { type: "string" },
  },
  required: ["name", "primaryLocalKeyword", "city", "state", "country"],
} as const;

export type AiImportClientExtract = {
  name: string;
  primaryLocalKeyword: string;
  city: string;
  state: string;
  country: string;
};
