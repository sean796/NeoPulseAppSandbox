import type { WordPressSite } from "@/components/integrations/types";
import { streamChatCompletion } from "@/lib/api";
import { parseBlogIdeasChecklist, type CSVRow } from "@/lib/bulk/bulk-csv-parser";
import type { LoadBulkSitemapInventoryResult } from "@/lib/bulk/bulk-sitemap-inventory-session";
import type { PromptBulkSitemapInventoryBuckets } from "@/lib/bulk/prompt-bulk-sitemap-inventory";
import { loadKnowledgeBaseForBulkIdeas } from "@/lib/kb-for-bulk-ideas";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import {
  buildBulkBlogIdeasSystemPrompt,
  buildBulkBlogIdeasUserPrompt,
} from "@/lib/prompt-builders";
import type {
  PostCreatorEntityMode,
  PostCreatorExecutionPayload,
} from "@/lib/tasks-types";
import { openRouterMaxOutputTokens } from "@/lib/openrouter-stream-token-limits";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import { formatUpstreamResearchFactsUserBlock } from "@/lib/post-creator/upstream-research-facts";

const DEFAULT_TEMPERATURE = 1.0;
const DEFAULT_TOP_P = 0.9;

export type PostCreatorBulkIdeasOnceArgs = {
  site: WordPressSite;
  inventory: LoadBulkSitemapInventoryResult;
  payload: PostCreatorExecutionPayload;
  postCount: number;
  apiKey: string;
  gscExactKeywords?: string[];
  siteKwJsonText?: string;
  onProgress?: (message: string) => void;
};

function limitKnowledgeBaseText(text: string): string {
  if (text.length <= 5000) return text;
  return `${text.substring(0, 5000)}\n\n[Knowledge base truncated for token optimization...]`;
}

function inventoryBuckets(
  inventory: LoadBulkSitemapInventoryResult,
): PromptBulkSitemapInventoryBuckets {
  return inventory.buckets as PromptBulkSitemapInventoryBuckets;
}

export async function runPostCreatorBulkIdeasOnce(
  args: PostCreatorBulkIdeasOnceArgs,
): Promise<CSVRow[]> {
  const { site, inventory, payload, postCount, apiKey } = args;
  const optionalPrompt = payload.optionalPrompt?.trim() || "";
  const upstreamFacts =
    payload.useUpstreamContext === true
      ? formatUpstreamResearchFactsUserBlock(payload.workflowContextBlock ?? "")
      : "";
  const entityMode: PostCreatorEntityMode = payload.entityMode ?? "blank";
  const entityValue = payload.entityValue?.trim() || "";
  const keywordValue = payload.keywordValue?.trim() || "";
  const titleTemplate = payload.titleTemplate?.trim() || "";
  const featuredImagePerBlog = payload.featuredImage !== false;
  const connectedSite = { name: site.name, siteUrl: getPublicSiteUrl(site) };
  const buckets = inventoryBuckets(inventory);
  const gscKeywords = args.gscExactKeywords?.filter(Boolean) ?? [];
  const keywordMode = gscKeywords.length > 0 ? "gsc-keywords" as const : "per-blog" as const;

  const { activeKnowledgeBaseText } = loadKnowledgeBaseForBulkIdeas();
  const limitedKb = limitKnowledgeBaseText(activeKnowledgeBaseText);

  const systemPrompt = buildBulkBlogIdeasSystemPrompt(
    optionalPrompt,
    limitedKb,
    postCount,
    entityMode,
    entityValue,
    keywordMode,
    keywordValue,
    optionalPrompt,
    titleTemplate,
    featuredImagePerBlog,
    connectedSite,
    undefined,
    gscKeywords.length > 0 ? gscKeywords : undefined,
    undefined,
    "content_blog",
    buckets,
  );

  const userLead = [optionalPrompt, upstreamFacts].filter(Boolean).join("\n\n") || "Generate blog post ideas for this site.";
  const userPrompt = buildBulkBlogIdeasUserPrompt(
    userLead,
    postCount,
    optionalPrompt,
    undefined,
    gscKeywords.length > 0 ? gscKeywords : undefined,
    optionalPrompt || undefined,
    "content_blog",
    buckets,
    args.siteKwJsonText,
  );

  args.onProgress?.("Generating blog ideas…");

  let checklistContent = "";
  const model = getResearchModel(site.id);

  await streamChatCompletion({
    apiKey,
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: DEFAULT_TEMPERATURE,
    maxTokens: openRouterMaxOutputTokens(),
    topP: DEFAULT_TOP_P,
    onContentChunk: (chunk) => {
      checklistContent += chunk;
    },
  });

  const parsed = parseBlogIdeasChecklist(
    checklistContent,
    titleTemplate,
    entityValue,
    keywordValue,
    "",
    "",
    site.name,
  );

  if (parsed.length < postCount) {
    throw new Error(`OpenRouter returned ${parsed.length}/${postCount} blog ideas.`);
  }

  return parsed.slice(0, postCount);
}
