/**
 * Blog Ideas Studio work as a background job: Ideas, then create posts.
 * Does not touch the open UI. Uses the client record from the client URL.
 */
import type { WordPressSite } from "@/components/integrations/types";
import { resolvePromptBulkIdeasContext } from "@/lib/bulk/prompt-bulk-ideas-context";
import { generateSimplePromptIdeas } from "@/lib/bulk/prompt-bulk-ideas-simple";
import type { BlogIdeasStudioRunResult } from "@/lib/bulk/blog-ideas-studio-trigger";
import { GEMINI_FLASH_MODEL } from "@/lib/global-agent-models";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import { openRouterMaxOutputTokens } from "@/lib/openrouter-stream-token-limits";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { resolveModelForAgentCategory } from "@/lib/openrouter-agent-category-api";
import { generateBulkSplashStatus } from "@/lib/bulk/bulk-splash-status-agent";
import { runPostCreatorBulkRows } from "@/lib/post-creator/post-creator-bulk-runner";
import {
  buildPostCreatorWordPressPosting,
  resolvePostCreatorSchedule,
} from "@/lib/post-creator/post-creator-schedule";
import type { PostCreatorExecutionPayload } from "@/lib/tasks-types";

function isApiJargon(label: string): boolean {
  const s = label.toLowerCase();
  return (
    s.includes("[llm]") ||
    s.includes("maxtokens") ||
    s.includes("dataforseo") ||
    s.includes("openrouter") ||
    s.includes("deepseek") ||
    s.includes("prompt ") && s.includes("chars")
  );
}

function nextMonthStartYmd(now = new Date()): string {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const year = m === 12 ? y + 1 : y;
  const month = m === 12 ? 1 : m + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export async function runBlogIdeasStudioBackgroundJob(args: {
  site: WordPressSite;
  postCount: number;
  signal?: AbortSignal;
  onProgress?: (step: string, progress: number) => void;
}): Promise<BlogIdeasStudioRunResult> {
  const postCount = Math.max(1, Math.floor(Number(args.postCount) || 0));
  const site = args.site;
  if (!site?.id?.trim()) {
    throw new Error("Client from client URL is required.");
  }
  if (!site.username?.trim() || !site.appPassword?.trim()) {
    throw new Error("WordPress credentials are required.");
  }
  if (args.signal?.aborted) {
    throw new Error("Cancelled");
  }

  let splashSeq = 0;
  const report = (
    step: string,
    progress: number,
    extra?: { title?: string; keyword?: string },
  ) => {
    const seq = ++splashSeq;
    if (step.trim() && !isApiJargon(step)) {
      args.onProgress?.(step.trim(), progress);
    }
    void generateBulkSplashStatus({
      step,
      articleTitle: extra?.title,
      keyword: extra?.keyword,
      siteName: site.name,
      signal: args.signal,
    })
      .then((pair) => {
        const line = pair.status.trim();
        if (seq !== splashSeq || !line || isApiJargon(line)) return;
        args.onProgress?.(line, progress);
      })
      .catch(() => {
        /* Keep the last readable step line. */
      });
  };

  report("Generating blog ideas", 5);
  const ideasContext = await resolvePromptBulkIdeasContext(site);
  if (!ideasContext.isReady) {
    throw new Error(
      "Site sitemap inventory and GSC keywords must be loaded before generating ideas.",
    );
  }

  if (args.signal?.aborted) {
    throw new Error("Cancelled");
  }

  report(`Generating ${postCount} blog ideas`, 20);
  const apiKey = (await resolveOpenRouterApiKeyForHarness()).trim();
  const model =
    getResearchModel(site.id)?.trim() ||
    resolveModelForAgentCategory("research", site.id)?.trim() ||
    GEMINI_FLASH_MODEL;

  const rows = await generateSimplePromptIdeas({
    apiKey,
    model,
    count: postCount,
    temperature: 0.35,
    maxTokens: openRouterMaxOutputTokens(),
    connectedSite: ideasContext.connectedSite,
    siteInventoryJson: ideasContext.siteInventoryJson,
    gscKeywords: ideasContext.gscKeywords,
    contentScope: ["posts"],
  });
  if (rows.length !== postCount) {
    throw new Error(`Blog Ideas Studio returned ${rows.length}/${postCount} ideas.`);
  }

  if (args.signal?.aborted) {
    throw new Error("Cancelled");
  }

  const monthStart = nextMonthStartYmd();
  const payload: PostCreatorExecutionPayload = {
    postCount,
    scheduleTimesPerMonth: postCount,
    keywordSource: "gsc",
    sitemapType: "post",
    featuredImage: true,
    postDestination: "wordpress",
    scheduleFrequency: "custom",
    scheduleCustomStartDate: monthStart,
    scheduleStartDay: 1,
    scheduleStartTime: "09:00",
    scheduleStaggerOptimized: true,
    targetBucket: "posts",
    saveLocalArchive: true,
  };
  const schedule = resolvePostCreatorSchedule(payload);
  const wordPressPosting = buildPostCreatorWordPressPosting(site, rows.length, schedule, payload);

  report("Creating posts", 40);
  const bulk = await runPostCreatorBulkRows({
    site,
    rows,
    wordPressPosting,
    schedule,
    isCancelled: async () => Boolean(args.signal?.aborted),
    onProgress: (p) => {
      const pct = 40 + Math.floor((60 * (p.rowIndex + 1)) / Math.max(1, p.totalRows));
      const row = rows[p.rowIndex];
      report(p.message, Math.min(99, pct), {
        title: row?.title,
        keyword: row?.keyword,
      });
    },
  });

  return {
    created: bulk.created,
    failed: bulk.failed,
    urls: bulk.urls,
  };
}
