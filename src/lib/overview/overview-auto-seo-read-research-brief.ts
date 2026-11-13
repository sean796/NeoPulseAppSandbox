import { z } from "zod";
import { parseModelJson } from "@/lib/model-json";
import { callAgentCategoryOpenRouterChat } from "@/lib/openrouter-agent-category-api";
import { hasSubstantiveSeoResearchBrief } from "@/lib/content-optimization/seo-research-brief-for-optimize";

const ReadingDigestSchema = z.object({
  searcherIntent: z.string().min(1),
  mustUseFacts: z.array(z.string().min(1)).min(1),
  contentAngles: z.array(z.string().min(1)).min(1),
  entitiesProducts: z.array(z.string()).default([]),
  avoidClaims: z.array(z.string()).default([]),
  groundingMemo: z.string().min(1),
});

export type AutoSeoResearchReadingDigest = z.infer<typeof ReadingDigestSchema>;

/**
 * Research model ingests a SERP research brief already on the row.
 * Does not fetch DataForSEO or write seo_research; callers create/load the brief first.
 */
export async function readExistingSeoResearchBriefForAutoSeo(args: {
  seoResearchBrief: string;
  articleTitle: string;
  focusKeyword: string;
  pageUrl: string;
  siteId?: string | null;
  businessName?: string;
}): Promise<AutoSeoResearchReadingDigest> {
  const raw = args.seoResearchBrief.trim();
  if (!hasSubstantiveSeoResearchBrief(raw)) {
    throw new Error("No existing research brief to read; Auto SEO Reading Data requires row.seoResearch.");
  }

  const system = [
    "You are a Pulse Engine research reader.",
    "Read the existing SEO research brief only. Do not invent new SERP data, do not invent new research, and do not invent facts missing from the brief.",
    "Extract grounding the content optimizer must follow.",
    'Return JSON only: {"searcherIntent":"...","mustUseFacts":["..."],"contentAngles":["..."],"entitiesProducts":["..."],"avoidClaims":["..."],"groundingMemo":"..."}.',
    "groundingMemo is a dense operator memo (plain text) the writer will follow for every section.",
  ].join(" ");

  const user = [
    `Page URL: ${args.pageUrl}`,
    `Article title: ${args.articleTitle || "(untitled)"}`,
    `Focus keyword: ${args.focusKeyword || "(none)"}`,
    args.businessName ? `Business name: ${args.businessName}` : "",
    "EXISTING RESEARCH BRIEF (read only; do not expand with outside knowledge):",
    raw,
    'Return JSON only: {"searcherIntent":"...","mustUseFacts":["..."],"contentAngles":["..."],"entitiesProducts":["..."],"avoidClaims":["..."],"groundingMemo":"..."}.',
  ]
    .filter(Boolean)
    .join("\n\n");

  const { content } = await callAgentCategoryOpenRouterChat({
    category: "research",
    siteId: args.siteId,
    system,
    user,
    temperature: 0.2,
    maxTokens: 200_000,
    responseFormat: { type: "json_object" },
    useMasterInstructions: false,
    useWordBlacklist: false,
  });

  return parseModelJson(content, ReadingDigestSchema, "Auto SEO research brief reading");
}

export function formatAutoSeoResearchReadingDigest(digest: AutoSeoResearchReadingDigest): string {
  const lines = [
    "RESEARCH BRIEF READING (research model; mandatory grounding for all optimized content):",
    `Searcher intent: ${digest.searcherIntent.trim()}`,
    "Must-use facts:",
    ...digest.mustUseFacts.map((f) => `- ${f.trim()}`),
    "Content angles:",
    ...digest.contentAngles.map((a) => `- ${a.trim()}`),
  ];
  if (digest.entitiesProducts.length > 0) {
    lines.push("Entities / products:", ...digest.entitiesProducts.map((e) => `- ${e.trim()}`));
  }
  if (digest.avoidClaims.length > 0) {
    lines.push("Avoid claims:", ...digest.avoidClaims.map((c) => `- ${c.trim()}`));
  }
  lines.push("Operator memo:", digest.groundingMemo.trim());
  return lines.join("\n");
}
