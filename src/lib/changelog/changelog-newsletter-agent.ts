/**
 * Changelog newsletter draft: CEO-friendly More you know articles (web search).
 * No Languages. No hero. No Do this week tips.
 */

import { z } from "zod";
import { parseModelJson } from "../model-json";

/** Web search model for More you know articles. */
export const CHANGELOG_NEWSLETTER_WEB_MODEL = "openai/gpt-4o:online";

export const NEWSLETTER_ARTICLE_SUMMARY_MIN = 120;

const httpsUrl = z
  .string()
  .min(1)
  .refine((u) => u.startsWith("https://"), { message: "sourceUrl must be https" });

export const newsletterArticleSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(NEWSLETTER_ARTICLE_SUMMARY_MIN),
  date: z.string().min(1),
  sourceUrl: httpsUrl,
  whyItHelps: z.string().min(40),
});

/** Web-search pass: CEO supporting reading list. */
export const changelogNewsletterReadingDraftSchema = z.object({
  articles: z.array(newsletterArticleSchema).length(3),
});

export type ChangelogNewsletterReadingDraft = z.infer<typeof changelogNewsletterReadingDraftSchema>;

export type ChangelogNewsletterSection = {
  heading: string;
  items: string[];
};

export type ChangelogNewsletterHighlights = {
  title: string;
  date: string;
  commitCount: number;
  highlights: string[];
  sections?: ChangelogNewsletterSection[];
  commitSubjects?: string[];
  rangeFrom?: string;
  rangeTo?: string;
};

export type ChangelogNewsletterPayload = ChangelogNewsletterHighlights & {
  articles: z.infer<typeof newsletterArticleSchema>[];
};

/** @deprecated */
export type ChangelogNewsletterWebDraft = ChangelogNewsletterReadingDraft;

const BANNED_TOPIC_PATTERN = /rank\s*math|\bemcp\b|email\s*desk.*rank|rank.*email\s*desk/i;

export function stripBannedChangelogTopics(
  entry: ChangelogNewsletterHighlights,
): ChangelogNewsletterHighlights {
  const keep = (line: string) => !BANNED_TOPIC_PATTERN.test(line);
  const highlights = entry.highlights.filter(keep);
  const sections = (entry.sections ?? [])
    .map((section) => ({
      heading: section.heading,
      items: section.items.filter(keep),
    }))
    .filter((section) => section.items.length > 0);
  return { ...entry, highlights, sections };
}

function packBlock(entry: ChangelogNewsletterHighlights): string {
  const cleaned = stripBannedChangelogTopics(entry);
  const bullets =
    cleaned.highlights.length > 0
      ? cleaned.highlights.map((h) => `- ${h}`).join("\n")
      : "- (no highlights)";
  const sectionLines =
    cleaned.sections && cleaned.sections.length > 0
      ? cleaned.sections
          .map((section) => {
            const items = section.items.slice(0, 12).map((item) => `  - ${item}`).join("\n");
            return `${section.heading}:\n${items}`;
          })
          .join("\n")
      : "(no sections)";
  const subjects = (cleaned.commitSubjects ?? []).slice(0, 40);
  const commitBlock =
    subjects.length > 0 ? subjects.map((s) => `- ${s}`).join("\n") : "(no commit subjects)";
  return `Neo Pulse update: ${cleaned.title}
Date: ${cleaned.date}
Commits: ${cleaned.commitCount}
Range: ${cleaned.rangeFrom ?? cleaned.date} to ${cleaned.rangeTo ?? cleaned.date}

Highlights:
${bullets}

Sections:
${sectionLines}

Commit subjects:
${commitBlock}`;
}

export const CHANGELOG_NEWSLETTER_READING_SYSTEM = `You curate a "More you know" reading list for a Neo Pulse changelog email sent to client CEOs and non-technical stakeholders.

The user pack describes THIS Neo Pulse ship. Your job is to web-search for real, recent industry news or analysis that explains WHY Pulse made these product moves. This is supporting context for a CEO-friendly changelog, not a rewrite of the changelog and not a developer setup guide.

Audience:
- A client CEO who does not live in the codebase.
- Plain language. No engineering jargon. No "how to click through WordPress admin" tutorials.

Hard rules:
- Use web search. Every item needs a real https sourceUrl you found on a live article page.
- Never invent URLs, titles, dates, or publisher domains. If search does not return a usable page, do not fabricate one.
- Prefer news or analysis from the last 12 months on recognizable trade or business publishers (for example Digiday, Search Engine Land, AdExchanger, Agency Management Institute, Harvard Business Review, Wall Street Journal, Forbes agency coverage).
- sourceUrl must be the exact article page you found. The page title must match your articles.title. Do not point at changelogs, docs hubs, personal portfolios, product marketing pages, or unrelated case studies.
- Search for industry context behind the CAPABILITY CLASS in the pack (for example: why agencies need centralized hosting user control, why client SEO reports need trustworthy narratives and clean property IDs, why AI marketing stacks need serious API-key operations, why local visibility grids matter when Local Grid is in the pack).
- Pick pieces a client CEO would care about: risk, trust, revenue, competitive pressure. Do not pick developer or internal-engineering pieces (code quality, refactoring, CI hygiene).
- Banned: WordPress / GA4 / Semrush / GSC install how-tos, language intros (php.net, MDN intro, W3Schools), vendor 101 docs, anything that only teaches a tool Neo Pulse integrates with.
- Banned filler titles and themes: "future of analytics", "importance of user management", "importance of code quality", "the role of API key management", vague SEO roundups, generic "what you need to know" listicles with no named research or news hook.
- Never mention Rank Math or EMCP.
- Return exactly 3 articles.
- articles.summary: 2 to 4 sentences a CEO can follow.
- articles.whyItHelps: one plain sentence of the form "This is why Pulse shipped X this week," naming a concrete client-facing ship item from the pack.
- Never use the em dash character.

Output JSON only:
{
  "articles": [{ "title": "...", "summary": "...", "date": "Nov 12, 2026", "sourceUrl": "https://...", "whyItHelps": "This is why Pulse shipped ..." }]
}`;

/** @deprecated */
export const CHANGELOG_NEWSLETTER_SYSTEM = CHANGELOG_NEWSLETTER_READING_SYSTEM;

export function buildChangelogNewsletterReadingUserPrompt(
  entry: ChangelogNewsletterHighlights,
): string {
  return `${packBlock(entry)}

Web-search now for three real CEO-friendly supporting articles that explain why THIS Pulse ship matters. Return the reading-list JSON (articles only).`;
}

/** @deprecated */
export function buildChangelogNewsletterUserPrompt(
  entry: ChangelogNewsletterHighlights,
): string {
  return buildChangelogNewsletterReadingUserPrompt(entry);
}

export function parseChangelogNewsletterReadingDraft(raw: string): ChangelogNewsletterReadingDraft {
  return parseModelJson(raw, changelogNewsletterReadingDraftSchema, "changelog newsletter reading draft");
}

/** @deprecated */
export function parseChangelogNewsletterWebDraft(raw: string): ChangelogNewsletterReadingDraft {
  return parseChangelogNewsletterReadingDraft(raw);
}

const TITLE_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "of",
  "on",
  "the",
  "to",
  "with",
  "how",
  "why",
  "what",
  "is",
  "are",
]);

function significantTitleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4 && !TITLE_STOPWORDS.has(t));
}

function extractHtmlTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) return "";
  return match[1].replace(/\s+/g, " ").trim();
}

/**
 * Fail-fast: every article sourceUrl must be a live page whose document title
 * overlaps the claimed article title. Does not rewrite content; bad links abort.
 */
export async function assertNewsletterArticleSourcesReachable(
  articles: Array<{ title: string; sourceUrl: string }>,
): Promise<void> {
  for (const article of articles) {
    try {
      const res = await fetch(article.sourceUrl, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(12_000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const html = (await res.text()).slice(0, 20_000);
      const lower = html.toLowerCase();
      if (
        lower.includes("domain is for sale") ||
        lower.includes("buy this domain") ||
        lower.includes("this domain may be for sale")
      ) {
        throw new Error("URL resolves to a domain-for-sale page");
      }
      const pageTitle = extractHtmlTitle(html);
      const tokens = significantTitleTokens(article.title);
      const pageLower = pageTitle.toLowerCase();
      const hits = tokens.filter((t) => pageLower.includes(t));
      const needed = Math.min(2, tokens.length);
      if (needed > 0 && hits.length < needed) {
        throw new Error(
          `page title "${pageTitle || "(missing)"}" does not match claimed title`,
        );
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `More you know source is not a live matching article: "${article.title}" → ${article.sourceUrl} (${detail}). Re-run so web search returns real publisher URLs.`,
      );
    }
  }
}

export function assembleChangelogNewsletter(
  entry: ChangelogNewsletterHighlights,
  reading: ChangelogNewsletterReadingDraft,
): ChangelogNewsletterPayload {
  const cleaned = stripBannedChangelogTopics(entry);
  if (!cleaned.title.trim()) throw new Error("Changelog entry title is required.");
  if (!cleaned.date.trim()) throw new Error("Changelog entry date is required.");
  if (!Number.isFinite(cleaned.commitCount) || cleaned.commitCount < 0) {
    throw new Error("Changelog entry commitCount is required.");
  }
  if (cleaned.highlights.length === 0 && (!cleaned.sections || cleaned.sections.length === 0)) {
    throw new Error("Changelog entry has no highlights or sections after cleanup.");
  }
  return {
    title: cleaned.title.trim(),
    date: cleaned.date.trim(),
    commitCount: cleaned.commitCount,
    highlights: cleaned.highlights.map((h) => h.trim()).filter(Boolean),
    sections: cleaned.sections,
    commitSubjects: cleaned.commitSubjects,
    rangeFrom: cleaned.rangeFrom,
    rangeTo: cleaned.rangeTo,
    articles: reading.articles,
  };
}
