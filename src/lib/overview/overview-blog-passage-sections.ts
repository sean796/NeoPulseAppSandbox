import { z } from "zod";
import { stitchHarnessSections } from "@/lib/bulk/bulk-harness-outline";
import { headingTitleToHarnessAnchorId } from "@/lib/bulk/harness-section-anchor-ids";
import { parseModelJson } from "@/lib/model-json";
import { callAgentCategoryOpenRouterChat } from "@/lib/openrouter-agent-category-api";
import {
  findH2OpenPositions,
} from "@/lib/overview/overview-blog-overview-prepend";
import { plainTextFromH2InnerHtml } from "@/lib/overview/overview-blog-headers-extract";
import {
  normalizeSectionProseHtml,
  prosePlainText,
} from "@/lib/elementor-page-content/extract-text-editor-prose";
import { extractExactInternalLinkTagsFromHtml } from "@/lib/overview/overview-blog-links-extract";
import {
  formatFuzzySitemapLinksPromptBlock,
  rankFuzzySitemapLinksForSection,
  resolveSitemapFuzzyLinkPool,
  type SitemapFuzzyLinkCandidate,
} from "@/lib/overview/overview-blog-sitemap-fuzzy-links";
import {
  AISEO_FULL_REWRITE_BODY_OUTPUT_CONTRACT,
  AISEO_FULL_REWRITE_HEADING_OUTPUT_CONTRACT,
  AISEO_FULL_REWRITE_SYSTEM_RULE,
} from "@/lib/content-optimization/aiseo-full-rewrite-contract";
import {
  llmAuditSummaryFromSeoResearchBrief,
  parseSeoResearchBrief,
} from "@/lib/content-optimization/seo-research-brief-for-optimize";
import { firstPartyAuthorityBlockFromBrief } from "@/lib/content-optimization/first-party-authority-prompt";

function formatPassageResearchBriefGrounding(
  seoResearchBrief?: string,
  researchReadingDigest?: string,
): string {
  const reading = researchReadingDigest?.trim();
  const raw = seoResearchBrief?.trim();
  if (!reading && !raw) return "";
  const parts: string[] = [
    "RESEARCH BRIEF GROUNDING (mandatory): use searcher intent, angles, and concrete specifics from the blocks below. Do not invent stats, products, or claims that contradict this brief.",
  ];
  if (reading) {
    parts.push(reading);
  }
  if (raw) {
    const brief = parseSeoResearchBrief(raw);
    if (brief) {
      const llmAuditSummary = llmAuditSummaryFromSeoResearchBrief(raw);
      if (llmAuditSummary) {
        parts.push(`--- SEO RESEARCH (LLM audit facts) ---\n${llmAuditSummary}`);
      }
      const firstPartyAuthorityBlock = firstPartyAuthorityBlockFromBrief(brief, "");
      if (firstPartyAuthorityBlock?.trim()) {
        parts.push(firstPartyAuthorityBlock.trim());
      }
    } else if (!reading) {
      parts.push(raw.slice(0, 2500));
    }
  }
  return parts.join("\n\n");
}

export type BlogPassageSection = {
  id: string;
  index: number;
  /** Original opening tag, e.g. `<h2 id="why-wordpress-maintenance">` or `<h2>` */
  h2OpenTag: string;
  title: string;
  bodyHtml: string;
};

export type ParsedBlogPassageDocument = {
  leadingHtml: string;
  sections: BlogPassageSection[];
};

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function extractLegacySectionFactScope(bodyHtml: string): string {
  const plain = prosePlainText(bodyHtml);
  if (!plain) return "(empty section)";
  const stripped = plain.replace(/\s+/g, " ").trim();
  const sentences = stripped
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length <= 1) {
    return stripped.slice(0, 600);
  }
  return sentences
    .slice(0, 10)
    .map((s, i) => `Fact ${i + 1}: ${s}`)
    .join("\n");
}

/**
 * Split core article HTML (after Answer/Overview and before trailing FAQ) into discrete H2 sections
 * for passage-level editing and optimization.
 */
export function splitHtmlBodyIntoH2PassageSections(html: string): ParsedBlogPassageDocument {
  const src = (html ?? "").trim();
  if (!src) {
    return { leadingHtml: "", sections: [] };
  }

  const positions = findH2OpenPositions(src);
  if (positions.length === 0) {
    return { leadingHtml: src, sections: [] };
  }

  const leadingHtml = src.slice(0, positions[0]!).trim();
  const sections: BlogPassageSection[] = [];
  const low = src.toLowerCase();
  const usedIds = new Set<string>();

  for (let i = 0; i < positions.length; i += 1) {
    const openAt = positions[i]!;
    const nextOpenAt = i + 1 < positions.length ? positions[i + 1]! : src.length;
    const gt = src.indexOf(">", openAt);
    if (gt === -1 || gt >= nextOpenAt) continue;

    const h2OpenTagRaw = src.slice(openAt, gt + 1);
    const closeAt = low.indexOf("</h2>", gt + 1);
    if (closeAt === -1 || closeAt >= nextOpenAt) continue;

    const rawTitleInner = src.slice(gt + 1, closeAt);
    const title = plainTextFromH2InnerHtml(rawTitleInner);
    const bodyStart = closeAt + "</h2>".length;
    const bodyHtml = src.slice(bodyStart, nextOpenAt).trim();

    const idMatch = /\bid\s*=\s*["']([^"']+)["']/i.exec(h2OpenTagRaw);
    const id = allocateUniquePassageAnchorId(
      title || `passage-h2-${i}`,
      usedIds,
      idMatch?.[1]?.trim(),
    );
    const openWithId = /\bid\s*=/i.test(h2OpenTagRaw)
      ? h2OpenTagRaw.replace(/\bid\s*=\s*["'][^"']*["']/i, `id="${id}"`)
      : `<h2 id="${id}">`;

    sections.push({
      id,
      index: i,
      h2OpenTag: openWithId,
      title,
      bodyHtml,
    });
  }

  return { leadingHtml, sections };
}

/** Allocate a stable H2 id from a title, appending -2/-3 when the slug is already taken. */
export function allocateUniquePassageAnchorId(
  title: string,
  usedIds: Set<string>,
  preferredId?: string,
): string {
  const base =
    (preferredId?.trim() || headingTitleToHarnessAnchorId(title) || "passage-h2").replace(
      /-\d+$/,
      "",
    ) || "passage-h2";
  let anchorId = preferredId?.trim() || headingTitleToHarnessAnchorId(title) || base;
  if (!anchorId) anchorId = base;
  if (!usedIds.has(anchorId)) {
    usedIds.add(anchorId);
    return anchorId;
  }
  let n = 2;
  while (usedIds.has(`${base}-${n}`)) n += 1;
  const next = `${base}-${n}`;
  usedIds.add(next);
  return next;
}

export function buildH2OpenTagForTitle(title: string, usedIds?: Set<string>): string {
  if (!usedIds) {
    const anchorId = headingTitleToHarnessAnchorId(title);
    return `<h2 id="${anchorId}">`;
  }
  const anchorId = allocateUniquePassageAnchorId(title, usedIds);
  return `<h2 id="${anchorId}">`;
}

/**
 * Stitch discrete H2 passage sections back into clean HTML while preserving H2 attributes (like `#id` jump anchors).
 */
export function stitchHtmlBodyFromH2PassageSections(doc: ParsedBlogPassageDocument): string {
  const parts: string[] = [];
  if (doc.leadingHtml.trim()) {
    parts.push(doc.leadingHtml.trim());
  }

  const usedIds = new Set<string>();
  for (const sec of doc.sections) {
    const preferred =
      /\bid\s*=\s*["']([^"']+)["']/i.exec(sec.h2OpenTag)?.[1]?.trim() || sec.id;
    const uniqueId = allocateUniquePassageAnchorId(sec.title, usedIds, preferred);
    const openTag = `<h2 id="${uniqueId}">`;
    const headingLine = `${openTag}${escapeHtmlText(sec.title.trim())}</h2>`;
    const body = sec.bodyHtml.trim();
    parts.push(body ? `${headingLine}\n${body}` : headingLine);
  }

  return parts.join("\n\n").trim();
}

/** Full post HTML: Answer, Overview, H2 core, trailing FAQ. */
export function stitchOverviewBlogPostHtml(args: {
  ansHtml: string;
  ovHtml: string;
  leadingHtml: string;
  sections: BlogPassageSection[];
  trailingFaq: string;
}): string {
  const nextCore = stitchHtmlBodyFromH2PassageSections({
    leadingHtml: args.leadingHtml,
    sections: args.sections,
  });
  return stitchHarnessSections(
    [args.ansHtml, args.ovHtml, nextCore, args.trailingFaq].filter((part) =>
      Boolean(part?.trim()),
    ),
  );
}

export type PassageRewriteMode = "header" | "copy" | "both";

const PassageSectionHeaderModelSchema = z.object({
  title: z.string().nullish(),
});

const PassageSectionCopyModelSchema = z.object({
  bodyHtml: z.string().nullish(),
});

const PassageSectionBothModelSchema = z.object({
  title: z.string().nullish(),
  bodyHtml: z.string().nullish(),
});

export async function rewriteBlogPassageSection(args: {
  mode: PassageRewriteMode;
  section: BlogPassageSection;
  siblingTitles: string[];
  articleTitle: string;
  focusKeyword: string;
  seoResearchBrief?: string;
  /** Research-model read of the existing brief (Auto SEO Reading Data). */
  researchReadingDigest?: string;
  siteId?: string | null;
  siteUrl?: string;
  pageUrl?: string;
  businessName?: string;
  apiKey?: string;
  sitemapLinkCandidates?: SitemapFuzzyLinkCandidate[];
}): Promise<{ title: string; bodyHtml: string }> {
  const {
    mode,
    section,
    siblingTitles,
    articleTitle,
    focusKeyword,
    seoResearchBrief,
    researchReadingDigest,
    siteId,
    siteUrl,
    pageUrl,
    businessName,
    apiKey,
    sitemapLinkCandidates,
  } = args;

  const lockedLinks =
    siteUrl?.trim() && mode !== "header"
      ? extractExactInternalLinkTagsFromHtml(section.bodyHtml, siteUrl.trim(), pageUrl)
      : [];

  let resolvedLinkCandidates: SitemapFuzzyLinkCandidate[] = sitemapLinkCandidates ?? [];
  if (mode !== "header" && resolvedLinkCandidates.length === 0 && (siteId || siteUrl)) {
    const pool = await resolveSitemapFuzzyLinkPool({
      siteId,
      pageUrl,
    });
    resolvedLinkCandidates = rankFuzzySitemapLinksForSection({
      pool,
      sectionTitle: section.title,
      sectionBodyHtml: section.bodyHtml,
      articleTitle,
      focusKeyword,
      pageUrl,
      limit: 8,
    });
  }

  const lockedLinksBlock = formatFuzzySitemapLinksPromptBlock(
    resolvedLinkCandidates,
    lockedLinks,
  );

  if (mode === "header") {
    const system = [
      "You are a Pulse Engine AISEO Passage Heading Architect.",
      AISEO_FULL_REWRITE_SYSTEM_RULE,
      "Author a brand-new, specific, search-intent-aligned H2 heading from scratch that replaces the legacy heading and is distinct from sibling H2s.",
      "HARD UNIQUENESS: the new title MUST NOT match any sibling H2 heading (case-insensitive). Never reuse another section's title or a near-identical paraphrase of one.",
      'Return JSON only: {"title":"..."}. Plain text only, Title Case, no HTML tags or colons.',
    ].join(" ");

    const user = [
      `Article title: ${articleTitle || "(untitled)"}`,
      `Focus keyword: ${focusKeyword || "(none)"}`,
      businessName ? `Business name: ${businessName}` : "",
      `Sibling H2 headings (MUST NOT reuse any of these): ${siblingTitles.filter(Boolean).join(" | ") || "(none)"}`,
      `Legacy H2 heading to replace: ${section.title}`,
      `Section topic reference:\n${section.bodyHtml.slice(0, 1200)}`,
      AISEO_FULL_REWRITE_HEADING_OUTPUT_CONTRACT,
      'Return JSON: {"title":"..."}',
    ]
      .filter(Boolean)
      .join("\n\n");

    const { content } = await callAgentCategoryOpenRouterChat({
      category: "blog",
      siteId,
      apiKey,
      system,
      user,
      temperature: 0.55,
      maxTokens: 512,
      responseFormat: { type: "json_object" },
      useMasterInstructions: true,
      useWordBlacklist: true,
    });

    const parsed = parseModelJson(content, PassageSectionHeaderModelSchema, "passage section");
    const rawTitle = parsed.title?.trim();
    if (!rawTitle) {
      throw new Error("Heading rewrite returned empty title in JSON.");
    }
    const title = rawTitle;
    if (!title.trim()) {
      throw new Error("Heading rewrite title was empty.");
    }
    return {
      title,
      bodyHtml: section.bodyHtml,
    };
  }

  const system =
    mode === "copy"
      ? [
          "You are a Pulse Engine AISEO Section Author.",
          AISEO_FULL_REWRITE_SYSTEM_RULE,
          "Author a complete from-scratch replacement for this H2 section body for passage-level ranking, AI Overviews citation clarity, and factual specificity.",
          'Return JSON only: {"bodyHtml":"..."}.',
          "Do NOT include the outer <h2> tag in bodyHtml.",
          "Discard the legacy sentence order and paragraph structure completely. Never do a sentence-by-sentence synonym swap.",
          "Structure the new section cleanly using semantic HTML (<p>, <ul>, <ol>, <table>, <h3>, <blockquote>): break up dense or run-on blocks into clear paragraphs, scannable bullet/numbered lists, or comparison tables where appropriate while preserving core facts.",
          "MANDATORY INTERNAL LINKS (1 to 3 per section): weave 1 to 3 contextual <a href=\"...\">anchor</a> links in bodyHtml using URLs from SITEMAP INTERNAL LINK TARGETS (prioritizing [PRODUCT / PAGE] URLs over [BLOG POST] URLs, never entity/service-area URLs). Front-load links in the opening clause / first half of sentences; never dump links at the end of a paragraph or list them standalone.",
          "TRADEMARKS & COPYRIGHTS: always include official ® / ™ / © symbols on proprietary product lines, automation systems, and brand names in both prose and link anchor text where applicable from the research brief and manufacturer standards.",
          "HARD WORD BANS (rejection gate): NEVER write 'our team', 'our experts', 'our professionals', 'when it comes to', 'whether you're looking', 'rest assured', 'peace of mind', 'delve', 'leverage', 'crucial', 'vital', 'navigate', 'comprehensive', 'seamless', 'seamlessly', 'elevate', 'utilize', or any em-dash/en-dash. Refer to the business directly by name or as 'we' / 'our installers' / 'our specialists', never 'our team'.",
          "ZERO PHRASE REUSE: Do NOT reuse any 4-word sequence from the legacy section facts.",
          "RESEARCH GROUNDING: when RESEARCH BRIEF GROUNDING is provided, every concrete claim, product, and angle must align with those LLM-audit and first-party facts.",
        ].join(" ")
      : [
          "You are a Pulse Engine AISEO Section & Heading Architect.",
          AISEO_FULL_REWRITE_SYSTEM_RULE,
          "Author a brand-new H2 heading (Title Case, plain text, no colons) and a complete from-scratch replacement for the section body for passage-level ranking, AI Overviews citation clarity, and factual specificity.",
          'Return JSON only: {"title":"...","bodyHtml":"..."}.',
          "Do NOT include the outer <h2> tag inside bodyHtml.",
          "HARD UNIQUENESS: the new title MUST NOT match any sibling H2 heading (case-insensitive). Never reuse another section's title or a near-identical paraphrase of one.",
          "Discard the legacy sentence order and paragraph structure completely. Never do a sentence-by-sentence synonym swap.",
          "Structure the new section cleanly using semantic HTML (<p>, <ul>, <ol>, <table>, <h3>, <blockquote>): break up dense or run-on blocks into clear paragraphs, scannable bullet/numbered lists, or comparison tables where appropriate while preserving core facts.",
          "MANDATORY INTERNAL LINKS (1 to 3 per section): weave 1 to 3 contextual <a href=\"...\">anchor</a> links in bodyHtml using URLs from SITEMAP INTERNAL LINK TARGETS (prioritizing [PRODUCT / PAGE] URLs over [BLOG POST] URLs, never entity/service-area URLs). Front-load links in the opening clause / first half of sentences; never dump links at the end of a paragraph or list them standalone.",
          "TRADEMARKS & COPYRIGHTS: always include official ® / ™ / © symbols on proprietary product lines, automation systems, and brand names in both prose and link anchor text where applicable from the research brief and manufacturer standards.",
          "HARD WORD BANS (rejection gate): NEVER write 'our team', 'our experts', 'our professionals', 'when it comes to', 'whether you're looking', 'rest assured', 'peace of mind', 'delve', 'leverage', 'crucial', 'vital', 'navigate', 'comprehensive', 'seamless', 'seamlessly', 'elevate', 'utilize', or any em-dash/en-dash. Refer to the business directly by name or as 'we' / 'our installers' / 'our specialists', never 'our team'.",
          "ZERO PHRASE REUSE: Do NOT reuse any 4-word sequence from the legacy section facts.",
          "RESEARCH GROUNDING: when RESEARCH BRIEF GROUNDING is provided, every concrete claim, product, and angle must align with those LLM-audit and first-party facts.",
        ].join(" ");

  const researchGrounding = formatPassageResearchBriefGrounding(
    seoResearchBrief,
    researchReadingDigest,
  );

  const user = [
    `Article title: ${articleTitle || "(untitled)"}`,
    `Focus keyword: ${focusKeyword || "(none)"}`,
    businessName ? `Business name: ${businessName} (refer to ${businessName} by name or "we", NEVER "our team" or "our experts")` : "",
    `Sibling H2 headings (MUST NOT reuse any of these): ${siblingTitles.filter(Boolean).join(" | ") || "(none)"}`,
    `Legacy H2 heading to replace: ${section.title}`,
    `SECTION FACT & TOPIC SCOPE (write a brand-new section covering these facts with completely new sentence structures, formatting, and wording; do NOT copy any 4-word phrase from below):\n${extractLegacySectionFactScope(section.bodyHtml)}`,
    lockedLinksBlock,
    researchGrounding,
    mode === "copy"
      ? 'Return JSON only: {"bodyHtml":"..."}'
      : 'Return JSON only: {"title":"...","bodyHtml":"..."}',
    AISEO_FULL_REWRITE_BODY_OUTPUT_CONTRACT,
    mode === "both" ? AISEO_FULL_REWRITE_HEADING_OUTPUT_CONTRACT : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const { content } = await callAgentCategoryOpenRouterChat({
    category: "blog",
    siteId,
    apiKey,
    system,
    user,
    temperature: 0.65,
    maxTokens: 4096,
    responseFormat: { type: "json_object" },
    useMasterInstructions: true,
    useWordBlacklist: true,
  });

  let parsedBodyHtml: string | null | undefined;
  let parsedTitle: string | null | undefined;
  if (mode === "copy") {
    const parsed = parseModelJson(content, PassageSectionCopyModelSchema, "passage section");
    parsedBodyHtml = parsed.bodyHtml;
  } else {
    const parsed = parseModelJson(content, PassageSectionBothModelSchema, "passage section");
    parsedBodyHtml = parsed.bodyHtml;
    parsedTitle = parsed.title;
  }
  const rawBody = parsedBodyHtml?.trim();
  if (!rawBody) {
    throw new Error("Passage rewrite returned empty bodyHtml in JSON.");
  }
  const bodyHtml = normalizeSectionProseHtml(rawBody);
  if (!prosePlainText(bodyHtml).trim()) {
    throw new Error("Passage rewrite bodyHtml was empty after normalize.");
  }

  let title = section.title;
  if (mode === "both") {
    const rawTitle = parsedTitle?.trim();
    if (!rawTitle) {
      throw new Error("Passage rewrite returned empty title in JSON.");
    }
    const nextTitle = rawTitle.trim();
    if (!nextTitle) {
      throw new Error("Passage rewrite title was empty.");
    }
    title = nextTitle;
  }

  return {
    title,
    bodyHtml,
  };
}

type LeadRewriteCtx = Omit<
  Parameters<typeof rewriteBlogPassageSection>[0],
  "section" | "siblingTitles" | "mode"
> & { siblingTitles?: string[] };

/** Rewrite an Answer/Overview block (or other lead HTML) as one passage. */
export async function rewriteBlogLeadSectionBlock(
  sectionHtml: string,
  ctx: LeadRewriteCtx,
): Promise<string> {
  const src = (sectionHtml ?? "").trim();
  if (!src) return src;

  const parsed = splitHtmlBodyIntoH2PassageSections(src);
  const siblingTitles = ctx.siblingTitles ?? [];

  if (parsed.sections.length === 0) {
    const rewritten = await rewriteBlogPassageSection({
      ...ctx,
      mode: "copy",
      section: {
        id: "lead-block",
        index: 0,
        h2OpenTag: "<h2>",
        title: "Lead",
        bodyHtml: src,
      },
      siblingTitles,
    });
    return normalizeSectionProseHtml(rewritten.bodyHtml);
  }

  const sec = parsed.sections[0]!;
  const rewritten = await rewriteBlogPassageSection({
    ...ctx,
    mode: "copy",
    section: sec,
    siblingTitles,
  });
  const bodyHtml = normalizeSectionProseHtml(rewritten.bodyHtml);
  const title = rewritten.title?.trim() || sec.title;
  const leading = parsed.leadingHtml.trim();
  const head = `${sec.h2OpenTag}${title}</h2>${bodyHtml}`;
  return leading ? `${leading}\n${head}`.trim() : head;
}
