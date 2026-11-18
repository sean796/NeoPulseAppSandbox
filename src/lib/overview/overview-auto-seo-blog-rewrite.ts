import { z } from "zod";
import type { WordPressSite } from "@/components/integrations/types";
import { logger } from "@/lib/logger";
import { headingTitleToHarnessAnchorId } from "@/lib/bulk/harness-section-anchor-ids";
import { MAX_CHECKLIST_ITEMS_BLOG } from "@/lib/content-generation/article-length-policy";
import { AISEO_FULL_REWRITE_SYSTEM_RULE } from "@/lib/content-optimization/aiseo-full-rewrite-contract";
import { UNIQUE_DYNAMIC_BODY_H2_RULE } from "@/lib/content-optimization/harness-heading-titles";
import { parseAssistantJsonObject } from "@/lib/competitor-research/competitor-report-json-parse";
import {
  normalizeSectionProseHtml,
  prosePlainText,
} from "@/lib/elementor-page-content/extract-text-editor-prose";
import { callAgentCategoryOpenRouterChat } from "@/lib/openrouter-agent-category-api";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import { getBlogModel } from "@/lib/optimization-settings-storage";
import { isFaqHeadingTitle, stripTrailingFaqSection } from "@/lib/overview/overview-blog-faq-append";
import {
  extractAnswerSectionHtml,
  extractOverviewSectionHtml,
  generateAndPrependAnswerHtml,
  generateAndPrependOverviewHtml,
  stripLeadingAnswerSection,
  stripLeadingOverviewSection,
} from "@/lib/overview/overview-blog-overview-prepend";
import {
  allocateUniquePassageAnchorId,
  rewriteBlogPassageSection,
  splitHtmlBodyIntoH2PassageSections,
  stitchHtmlBodyFromH2PassageSections,
  stitchOverviewBlogPostHtml,
  type BlogPassageSection,
} from "@/lib/overview/overview-blog-passage-sections";
import { extractAllSectionLinkRowsFromHtml } from "@/lib/overview/overview-blog-links-extract";
import {
  rankFuzzyMoneyPageLinksForAnswer,
  rankFuzzySitemapLinksForSection,
  resolveSitemapFuzzyLinkPool,
} from "@/lib/overview/overview-blog-sitemap-fuzzy-links";
import {
  RESEARCH_DISCLOSURE_ANCHOR_ID,
  stripResearchDisclosureSection,
} from "@/lib/overview/overview-research-disclosure";
import { recordOverviewStudioRevision } from "@/lib/overview/record-overview-studio-revision";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";

const BODY_H2_MIN = 5;
const BODY_H2_MAX = MAX_CHECKLIST_ITEMS_BLOG;

/** Always Answer + Overview + Intro + 5–6 body H2s. */
export function countAutoSeoBlogBodySteps(_sourceHtml?: string): number {
  return 1 + 1 + 1 + BODY_H2_MAX;
}

function isBodyPassageSection(sec: BlogPassageSection): boolean {
  const title = sec.title.trim().toLowerCase();
  if (!title) return false;
  if (isFaqHeadingTitle(sec.title)) return false;
  if (sec.id === RESEARCH_DISCLOSURE_ANCHOR_ID) return false;
  if (title.includes("research") && title.includes("fact")) return false;
  if (title === "introduction" || title === "intro") return false;
  return true;
}

const SectionFitSchema = z.object({
  decisions: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      action: z.enum(["keep", "rewrite"]),
    }),
  ),
});

/** AI marks which existing body H2s already fit the keyword/brief (keep) vs misfit (rewrite). */
async function classifyBodySectionFit(args: {
  articleTitle: string;
  focusKeyword: string;
  sections: BlogPassageSection[];
  seoResearchBrief?: string;
  siteId?: string | null;
  apiKey?: string;
}): Promise<Array<"keep" | "rewrite">> {
  const n = args.sections.length;
  if (n === 0) return [];
  const catalog = args.sections
    .map((sec, i) => {
      const preview = prosePlainText(sec.bodyHtml).trim().slice(0, 400);
      return `${i}. TITLE: ${sec.title}\nBODY: ${preview || "(empty)"}`;
    })
    .join("\n\n");
  const { content } = await callAgentCategoryOpenRouterChat({
    category: "blog",
    siteId: args.siteId,
    apiKey: args.apiKey,
    system: [
      "You score existing blog H2 sections for Auto SEO surgical rewrite.",
      'Mark keep when the section title and body already fit the article focus, are unique vs siblings, and are not empty, off-topic, or duplicate-theme.',
      "Mark rewrite when empty, off-topic, wrong product, duplicate thermal/energy theme, or mismatched to the focus keyword / research brief.",
      `Return one decision per index 0..${n - 1}.`,
      'JSON only: {"decisions":[{"index":0,"action":"keep"|"rewrite"}]}',
    ].join(" "),
    user: [
      `Article title: ${args.articleTitle || "(untitled)"}`,
      `Focus keyword: ${args.focusKeyword || "(none)"}`,
      args.seoResearchBrief?.trim()
        ? `Research:\n${args.seoResearchBrief.trim().slice(0, 3000)}`
        : "",
      `Sections:\n${catalog}`,
      "Return decisions now.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    temperature: 0.2,
    maxTokens: 2048,
    responseFormat: { type: "json_object" },
    useMasterInstructions: false,
    useWordBlacklist: false,
  });
  const parsed = SectionFitSchema.parse(parseAssistantJsonObject(content));
  const byIndex = new Map<number, "keep" | "rewrite">();
  for (const d of parsed.decisions) {
    if (d.index >= 0 && d.index < n) byIndex.set(d.index, d.action);
  }
  return args.sections.map((sec, i) => {
    const plain = prosePlainText(sec.bodyHtml).trim();
    if (!plain) return "rewrite";
    return byIndex.get(i) ?? "rewrite";
  });
}

export interface RunAutoSeoBlogBodyRewriteArgs {
  sourceHtml: string;
  articleTitle: string;
  focusKeyword: string;
  seoResearchBrief?: string;
  researchReadingDigest?: string;
  site?: WordPressSite | null;
  pageUrl: string;
  sitemapSource?: OverviewSitemapSource;
  revisionRunId?: string;
  shouldContinue?: () => boolean;
  onStepProgress?: (stepIndex: number, totalBodySteps: number, stepLabel: string) => void;
  onCommitHtml: (html: string, h2Titles: string[]) => void;
}

const OutlineSchema = z.object({
  titles: z.array(z.string()).min(BODY_H2_MIN).max(BODY_H2_MAX),
});

const IntroSchema = z.object({
  bodyHtml: z.string(),
});

async function planBodyH2Titles(args: {
  articleTitle: string;
  focusKeyword: string;
  legacyCoreHtml: string;
  seoResearchBrief?: string;
  researchReadingDigest?: string;
  siteId?: string | null;
  businessName?: string;
  apiKey?: string;
}): Promise<string[]> {
  const legacyPlain = prosePlainText(args.legacyCoreHtml).trim().slice(0, 6000);
  const { content } = await callAgentCategoryOpenRouterChat({
    category: "blog",
    siteId: args.siteId,
    apiKey: args.apiKey,
    system: [
      "You plan the full Auto SEO blog body outline.",
      `Return exactly ${BODY_H2_MIN}-${BODY_H2_MAX} unique body H2 titles.`,
      UNIQUE_DYNAMIC_BODY_H2_RULE,
      "Title Case, 3-14 words, no colons, no Answer/Overview/FAQ/Introduction.",
      "Include exactly one real-world / local homeowner example style H2.",
      'JSON only: {"titles":["..."]}',
    ].join(" "),
    user: [
      `Article title: ${args.articleTitle || "(untitled)"}`,
      `Focus keyword: ${args.focusKeyword || "(none)"}`,
      args.businessName ? `Business: ${args.businessName}` : "",
      args.seoResearchBrief?.trim()
        ? `Research:\n${args.seoResearchBrief.trim().slice(0, 4000)}`
        : "",
      args.researchReadingDigest?.trim()
        ? `Digest:\n${args.researchReadingDigest.trim().slice(0, 3000)}`
        : "",
      `Legacy body facts:\n${legacyPlain || "(none)"}`,
      `Return ${BODY_H2_MIN}-${BODY_H2_MAX} titles now.`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    temperature: 0.45,
    maxTokens: 2048,
    responseFormat: { type: "json_object" },
    useMasterInstructions: true,
    useWordBlacklist: true,
  });

  const titles = OutlineSchema.parse(parseAssistantJsonObject(content)).titles.map((t) =>
    t.trim(),
  );
  if (titles.some((t) => !t)) {
    throw new Error("Auto SEO outline returned an empty H2 title.");
  }
  const keys = titles.map((t) => t.toLowerCase());
  if (new Set(keys).size !== keys.length) {
    throw new Error("Auto SEO outline returned duplicate H2 titles.");
  }
  return titles;
}

async function rewriteIntroHtml(args: {
  legacyCoreHtml: string;
  articleTitle: string;
  focusKeyword: string;
  siblingTitles: string[];
  siteId?: string | null;
  businessName?: string;
  seoResearchBrief?: string;
  researchReadingDigest?: string;
  apiKey?: string;
}): Promise<string> {
  const legacyPlain = prosePlainText(args.legacyCoreHtml).trim().slice(0, 4000);
  const { content } = await callAgentCategoryOpenRouterChat({
    category: "blog",
    siteId: args.siteId,
    apiKey: args.apiKey,
    system: [
      "You write the Auto SEO article introduction.",
      AISEO_FULL_REWRITE_SYSTEM_RULE,
      "Output 1-2 <p> paragraphs only. No <h2>. Do not cover body H2 topics in depth.",
      'JSON only: {"bodyHtml":"..."}',
    ].join(" "),
    user: [
      `Article title: ${args.articleTitle || "(untitled)"}`,
      `Focus keyword: ${args.focusKeyword || "(none)"}`,
      args.businessName ? `Business: ${args.businessName}` : "",
      `Following H2s: ${args.siblingTitles.join(" | ")}`,
      `Legacy facts:\n${legacyPlain || "(none)"}`,
      'Return {"bodyHtml":"<p>...</p>"}',
    ]
      .filter(Boolean)
      .join("\n\n"),
    temperature: 0.55,
    maxTokens: 1024,
    responseFormat: { type: "json_object" },
    useMasterInstructions: true,
    useWordBlacklist: true,
  });
  const bodyHtml = normalizeSectionProseHtml(
    IntroSchema.parse(parseAssistantJsonObject(content)).bodyHtml,
  );
  if (!prosePlainText(bodyHtml).trim()) {
    throw new Error("Auto SEO intro rewrite returned empty bodyHtml.");
  }
  return bodyHtml;
}

/**
 * Auto SEO body path: Answer + Overview + Intro always rewrite.
 * Existing body H2s are kept when they fit; only misfit sections rewrite.
 * When the post lacks 5–6 body H2s, plan titles and rewrite those slots.
 */
export async function runAutoSeoBlogBodyRewrite(
  args: RunAutoSeoBlogBodyRewriteArgs,
): Promise<{ html: string; h2Titles: string[]; trailingFaq: string }> {
  const {
    sourceHtml,
    articleTitle,
    focusKeyword,
    seoResearchBrief,
    researchReadingDigest,
    site,
    pageUrl,
    sitemapSource,
    revisionRunId,
    shouldContinue = () => true,
    onStepProgress,
    onCommitHtml,
  } = args;

  const ansBefore = extractAnswerSectionHtml(sourceHtml);
  const ovBefore = extractOverviewSectionHtml(sourceHtml);
  const withoutLead = stripLeadingOverviewSection(stripLeadingAnswerSection(sourceHtml));
  const coreOnly = stripTrailingFaqSection(withoutLead);
  const trailingFaq =
    withoutLead.length > coreOnly.length
      ? withoutLead.slice(coreOnly.length).trim()
      : "";
  const legacyCoreHtml = stripResearchDisclosureSection(coreOnly.trim()).trim();
  if (!legacyCoreHtml) {
    throw new Error(`Auto SEO requires article body HTML for ${pageUrl}.`);
  }

  const totalBodySteps = countAutoSeoBlogBodySteps();
  let stepCursor = 0;
  const apiKey = await resolveOpenRouterApiKeyForHarness();

  const existingDoc = splitHtmlBodyIntoH2PassageSections(legacyCoreHtml);
  const existingBodySections = existingDoc.sections.filter(isBodyPassageSection);
  const introSeedHtml = existingDoc.leadingHtml.trim() || legacyCoreHtml;

  let workingSections: BlogPassageSection[] = [];
  let sectionActions: Array<"keep" | "rewrite"> = [];

  if (
    existingBodySections.length >= BODY_H2_MIN &&
    existingBodySections.length <= BODY_H2_MAX
  ) {
    const actions = await classifyBodySectionFit({
      articleTitle,
      focusKeyword,
      sections: existingBodySections,
      seoResearchBrief,
      siteId: site?.id ?? null,
      apiKey,
    });
    if (!shouldContinue()) {
      return {
        html: sourceHtml,
        h2Titles: existingBodySections.map((s) => s.title),
        trailingFaq,
      };
    }
    workingSections = existingBodySections.map((sec, i) => ({
      ...sec,
      index: i,
    }));
    sectionActions = actions;
    logger.start(
      `[Auto SEO] Surgical rewrite ${pageUrl}: keep ${actions.filter((a) => a === "keep").length}, rewrite ${actions.filter((a) => a === "rewrite").length} of ${workingSections.length} H2s`,
    );
  } else {
    const plannedTitles = await planBodyH2Titles({
      articleTitle,
      focusKeyword,
      legacyCoreHtml,
      seoResearchBrief,
      researchReadingDigest,
      siteId: site?.id ?? null,
      businessName: site?.name,
      apiKey,
    });
    if (!shouldContinue()) {
      return { html: sourceHtml, h2Titles: plannedTitles, trailingFaq };
    }
    const usedIds = new Set<string>();
    workingSections = plannedTitles.map((title, i) => {
      const id = allocateUniquePassageAnchorId(title, usedIds);
      return {
        id,
        index: i,
        h2OpenTag: `<h2 id="${id}">`,
        title,
        bodyHtml: legacyCoreHtml,
      };
    });
    sectionActions = workingSections.map(() => "rewrite");
    logger.start(
      `[Auto SEO] Full body outline ${pageUrl}: ${workingSections.length} H2s (existing count ${existingBodySections.length} outside ${BODY_H2_MIN}-${BODY_H2_MAX})`,
    );
  }

  let ansHtml = ansBefore;
  let ovHtml = ovBefore;
  let leadingHtml = "";

  const sitemapLinkPool = await resolveSitemapFuzzyLinkPool({
    site,
    siteId: site?.id ?? null,
    pageUrl,
  });
  const usedLinkUrlKeys = new Set<string>();
  const recordUsedLinksFromHtml = (fragmentHtml: string) => {
    for (const row of extractAllSectionLinkRowsFromHtml(fragmentHtml)) {
      if (!row.href || row.href.startsWith("#")) continue;
      const k = normalizePageUrlKey(row.href);
      if (k) usedLinkUrlKeys.add(k);
    }
  };

  const passageRewriteCtx = {
    articleTitle,
    focusKeyword,
    seoResearchBrief,
    researchReadingDigest,
    siteId: site?.id ?? null,
    siteUrl: site?.siteUrl,
    pageUrl,
    businessName: site?.name,
    apiKey,
  };

  const commitCurrent = () => {
    const html = stitchOverviewBlogPostHtml({
      ansHtml,
      ovHtml,
      leadingHtml,
      sections: workingSections,
      trailingFaq,
    });
    const h2Titles = workingSections.map((s) => s.title).filter(Boolean);
    onCommitHtml(html, h2Titles);
    return { html, h2Titles };
  };

  const answerMoneyPages = rankFuzzyMoneyPageLinksForAnswer({
    pool: sitemapLinkPool,
    articleTitle,
    focusKeyword,
    bodyH2Titles: workingSections.map((s) => s.title),
    pageUrl,
    limit: 6,
  });
  const topAnswerMoneyHref = answerMoneyPages[0]?.url;
  if (topAnswerMoneyHref && !topAnswerMoneyHref.startsWith("#")) {
    const k = normalizePageUrlKey(topAnswerMoneyHref);
    if (k) usedLinkUrlKeys.add(k);
  }

  for (const sec of workingSections) {
    if (sectionActions[sec.index] === "keep") {
      recordUsedLinksFromHtml(sec.bodyHtml);
    }
  }

  const preassignedSectionCandidates = workingSections.map((sec) => {
    const candidates = rankFuzzySitemapLinksForSection({
      pool: sitemapLinkPool,
      sectionTitle: sec.title,
      sectionBodyHtml:
        sectionActions[sec.index] === "keep" ? sec.bodyHtml : legacyCoreHtml,
      articleTitle,
      focusKeyword,
      pageUrl,
      usedUrls: usedLinkUrlKeys,
      limit: 8,
    });
    const topHref = candidates[0]?.url;
    if (topHref && !topHref.startsWith("#")) {
      const k = normalizePageUrlKey(topHref);
      if (k) usedLinkUrlKeys.add(k);
    }
    return candidates;
  });

  const outlineCore = stitchHtmlBodyFromH2PassageSections({
    leadingHtml: "",
    sections: workingSections.map((sec) => ({
      ...sec,
      bodyHtml: "<p>Body section.</p>",
    })),
  });

  const answerTask = (async () => {
    if (!shouldContinue()) return null;
    stepCursor += 1;
    onStepProgress?.(stepCursor, totalBodySteps, "Answer");
    const ansRes = await generateAndPrependAnswerHtml({
      sourceHtml: outlineCore,
      articleTitle,
      focusKeyword,
      pageUrl,
      connectedSite: site ? { name: site.name, siteUrl: site.siteUrl } : undefined,
      site: site ?? undefined,
      pageKind: sitemapSource === "sap" ? "entity" : "post",
      seoResearchBrief,
      previousAnswerHtml: ansBefore,
      moneyPageCandidates: answerMoneyPages,
      apiKey,
      model: getBlogModel(site?.id),
    });
    logger.success(`[Auto SEO] Answer rewritten (${ansRes.answerHtml.length} chars) for ${pageUrl}`);
    return ansRes.answerHtml;
  })();

  const overviewTask = (async () => {
    if (!shouldContinue()) return null;
    stepCursor += 1;
    onStepProgress?.(stepCursor, totalBodySteps, "Overview");
    const ovRes = await generateAndPrependOverviewHtml({
      sourceHtml: outlineCore,
      articleTitle,
      focusKeyword,
      pageUrl,
      connectedSite: site ? { name: site.name, siteUrl: site.siteUrl } : undefined,
      site: site ?? undefined,
      pageKind: sitemapSource === "sap" ? "entity" : "post",
      seoResearchBrief,
      pregeneratedAnswerHtml:
        ansBefore.trim() ||
        `<p id="answer">${focusKeyword || articleTitle}</p>`,
      apiKey,
      model: getBlogModel(site?.id),
    });
    const extractedOv = ovRes ? extractOverviewSectionHtml(ovRes.html) : null;
    if (!extractedOv?.trim()) {
      throw new Error(`Auto SEO Overview empty for ${pageUrl}`);
    }
    logger.success(`[Auto SEO] Overview rewritten (${extractedOv.length} chars) for ${pageUrl}`);
    return extractedOv;
  })();

  const introTask = (async () => {
    if (!shouldContinue()) return null;
    stepCursor += 1;
    onStepProgress?.(stepCursor, totalBodySteps, "Introduction");
    const intro = await rewriteIntroHtml({
      legacyCoreHtml: introSeedHtml,
      articleTitle,
      focusKeyword,
      siblingTitles: workingSections.map((s) => s.title),
      siteId: site?.id ?? null,
      businessName: site?.name,
      seoResearchBrief,
      researchReadingDigest,
      apiKey,
    });
    logger.success(`[Auto SEO] Intro rewritten (${intro.length} chars) for ${pageUrl}`);
    return intro;
  })();

  const sectionTasks = workingSections.map((sec, sIdx) =>
    (async () => {
      if (!shouldContinue()) return null;
      stepCursor += 1;
      onStepProgress?.(stepCursor, totalBodySteps, sec.title || `Section ${sIdx + 1}`);
      if (sectionActions[sIdx] === "keep") {
        logger.success(
          `[Auto SEO] H2 ${sIdx + 1}/${workingSections.length} kept: "${sec.title}"`,
        );
        return {
          sIdx,
          sec,
          rewritten: { title: sec.title, bodyHtml: sec.bodyHtml },
          kept: true as const,
        };
      }
      const rewritten = await rewriteBlogPassageSection({
        mode: "both",
        section: sec,
        siblingTitles: workingSections.filter((_, i) => i !== sIdx).map((s) => s.title),
        ...passageRewriteCtx,
        sitemapLinkCandidates: preassignedSectionCandidates[sIdx] ?? [],
      });
      logger.success(
        `[Auto SEO] H2 ${sIdx + 1}/${workingSections.length}: "${sec.title}" -> "${rewritten.title}"`,
      );
      return { sIdx, sec, rewritten, kept: false as const };
    })(),
  );

  const [rewrittenAnswer, rewrittenOverview, rewrittenIntro, ...sectionResults] =
    await Promise.all([answerTask, overviewTask, introTask, ...sectionTasks]);

  if (!shouldContinue()) return { ...commitCurrent(), trailingFaq };

  if (!rewrittenAnswer?.trim()) throw new Error(`Auto SEO Answer empty for ${pageUrl}`);
  ansHtml = rewrittenAnswer;
  recordUsedLinksFromHtml(ansHtml);
  recordOverviewStudioRevision({
    pageUrl,
    stepLabel: "Answer",
    runId: revisionRunId,
    beforeHtml: ansBefore,
    afterHtml: ansHtml,
  });

  if (!rewrittenOverview?.trim()) throw new Error(`Auto SEO Overview empty for ${pageUrl}`);
  ovHtml = rewrittenOverview;

  if (!rewrittenIntro?.trim()) throw new Error(`Auto SEO Intro empty for ${pageUrl}`);
  leadingHtml = rewrittenIntro;
  recordOverviewStudioRevision({
    pageUrl,
    stepLabel: "Introduction",
    runId: revisionRunId,
    beforeHtml: legacyCoreHtml.slice(0, 2000),
    afterHtml: leadingHtml,
  });

  const usedPassageIds = new Set<string>();
  for (const res of sectionResults) {
    if (!res) throw new Error(`Auto SEO section missing for ${pageUrl}`);
    const { sIdx, sec, rewritten, kept } = res;
    const oldAnchorIds = new Set(
      [sec.id, headingTitleToHarnessAnchorId(sec.title)].filter(Boolean),
    );
    let nextTitle = (rewritten.title || sec.title).trim();
    const nextBody = kept
      ? normalizeSectionProseHtml(sec.bodyHtml)
      : normalizeSectionProseHtml(rewritten.bodyHtml);
    if (!prosePlainText(nextBody).trim()) {
      throw new Error(`Auto SEO section ${sIdx + 1} empty body for ${pageUrl}`);
    }
    recordUsedLinksFromHtml(nextBody);

    const taken = workingSections
      .map((s, i) => (i === sIdx ? "" : s.title.trim().toLowerCase()))
      .filter(Boolean);
    if (!kept && nextTitle && taken.includes(nextTitle.toLowerCase())) {
      const unique = await rewriteBlogPassageSection({
        mode: "header",
        section: { ...sec, title: nextTitle, bodyHtml: nextBody },
        siblingTitles: workingSections
          .map((s, i) => (i === sIdx ? "" : s.title))
          .filter(Boolean),
        ...passageRewriteCtx,
      });
      if (unique.title?.trim()) nextTitle = unique.title.trim();
    }

    const nextId = allocateUniquePassageAnchorId(
      nextTitle,
      usedPassageIds,
      kept ? sec.id : undefined,
    );
    const nextH2OpenTag = `<h2 id="${nextId}">`;
    if (ovHtml && nextId) {
      for (const oldAnchorId of oldAnchorIds) {
        if (oldAnchorId && oldAnchorId !== nextId) {
          ovHtml = ovHtml
            .split(`href="#${oldAnchorId}"`)
            .join(`href="#${nextId}"`)
            .split(`href='#${oldAnchorId}'`)
            .join(`href='#${nextId}'`);
        }
      }
    }

    recordOverviewStudioRevision({
      pageUrl,
      stepLabel: kept
        ? `${nextTitle || `Section ${sIdx + 1}`} (kept)`
        : nextTitle || `Section ${sIdx + 1}`,
      sectionTitle: nextTitle || undefined,
      runId: revisionRunId,
      beforeHtml: `${sec.h2OpenTag}${sec.title}</h2>\n${sec.bodyHtml.slice(0, 1500)}`,
      afterHtml: `${nextH2OpenTag}${nextTitle}</h2>\n${nextBody}`,
    });
    workingSections[sIdx] = {
      ...sec,
      id: nextId,
      h2OpenTag: nextH2OpenTag,
      title: nextTitle,
      bodyHtml: nextBody,
    };
  }

  recordOverviewStudioRevision({
    pageUrl,
    stepLabel: "Overview",
    runId: revisionRunId,
    beforeHtml: ovBefore,
    afterHtml: ovHtml,
  });

  return { ...commitCurrent(), trailingFaq };
}
