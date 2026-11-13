/**
 * Changelog newsletter draft: Morning Brew / TLDR voice.
 * Lean layout only: summary (hook + body) + Highlights + More you know.
 * Editorial pass (hook + body + highlights) + web More you know articles.
 * Never Languages, hero image, or Do this week.
 */

import { z } from "zod";
import { parseModelJson } from "../model-json";

/** Pack-only editorial voice (hook, body, highlights). */
export const CHANGELOG_NEWSLETTER_INTRO_MODEL = "deepseek/deepseek-v4.1-flash";

/** @deprecated alias */
export const CHANGELOG_NEWSLETTER_EDITORIAL_MODEL = CHANGELOG_NEWSLETTER_INTRO_MODEL;

/** Web search model for More you know articles. */
export const CHANGELOG_NEWSLETTER_WEB_MODEL = "openai/gpt-4o:online";

/** Live app changelog page. */
export const CHANGELOG_NEWSLETTER_FULL_URL = "https://neo-pulse-static.onrender.com/changelog";

export const NEWSLETTER_ARTICLE_SUMMARY_MIN = 60;
export const NEWSLETTER_HOOK_MIN = 8;
export const NEWSLETTER_HOOK_MAX = 48;
export const NEWSLETTER_BODY_MIN = 60;
export const NEWSLETTER_WHY_MIN = 24;

const httpsUrl = z
  .string()
  .min(1)
  .refine((u) => u.startsWith("https://"), { message: "sourceUrl must be https" });

export const newsletterArticleSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(NEWSLETTER_ARTICLE_SUMMARY_MIN),
  date: z.string().min(1),
  sourceUrl: httpsUrl,
  whyItHelps: z.string().min(NEWSLETTER_WHY_MIN),
});

/** Pack-only pass: hook, body, personality highlights. */
export const changelogNewsletterIntroDraftSchema = z.object({
  hook: z
    .string()
    .min(NEWSLETTER_HOOK_MIN)
    .max(NEWSLETTER_HOOK_MAX)
    .refine((h) => h.trim().split(/\s+/).length <= 8, {
      message: "hook must be 8 words or fewer",
    }),
  body: z.string().min(NEWSLETTER_BODY_MIN),
  highlights: z.array(z.string().min(1)).min(5).max(8),
});

/** Web-search pass: CEO supporting reading list. */
export const changelogNewsletterReadingDraftSchema = z.object({
  articles: z.array(newsletterArticleSchema).length(3),
});

export type ChangelogNewsletterIntroDraft = z.infer<typeof changelogNewsletterIntroDraftSchema>;
export type ChangelogNewsletterReadingDraft = z.infer<typeof changelogNewsletterReadingDraftSchema>;

/** @deprecated */
export type ChangelogNewsletterEditorialDraft = ChangelogNewsletterIntroDraft;

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
  hook: string;
  body: string;
  changelogUrl: string;
  articles: z.infer<typeof newsletterArticleSchema>[];
};

/** @deprecated use hook + body */
export type ChangelogNewsletterPayloadLegacyIntro = {
  introParagraphs: string[];
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

export const CHANGELOG_NEWSLETTER_INTRO_SYSTEM = `You write the Neo Pulse product newsletter in a Morning Brew / TLDR voice.

Layout this copy feeds (locked, lean):
- Summary block only (hook + body), then Highlights, then More you know elsewhere.
- Never write Languages, hero image, Do this week, or extra sections into the copy.

Voice:
- Punchy, conversational, slightly witty, self-aware.
- Fun to skim over morning coffee. Millennial tech-newsletter energy without cringe, without emoji spam, without trying too hard.
- Short sentences. Zero corporate changelog speak. Zero "synergy" energy.
- Humor must sound COMPETENT and INTENTIONAL. Upgrade energy, not apology energy. Neo Pulse always knew what it was doing.

Grounding:
- The user pack is the ONLY source of facts.
- Never invent features. Never Rank Math or EMCP. Never external URLs.
- Never use the em dash character.

Write:
1) hook: a SHORT email-safe headline. Max 8 words and max 48 characters. Complete thought. Never end mid-phrase ("a new d…"). This becomes the Gmail subject, so keep it tight (examples: "AgentMail ships the changelog.", "Integrations gets an add-client dock.").
2) body: one short paragraph that explains what shipped and why it matters, newsletter style. Not a feature dump. Put the longer detail here, not in the hook.
3) highlights: 5 to 8 bullets with personality. Same facts as the pack, rewritten so they feel alive. Still specific and true.

Banned tone:
- Dry release-note speak ("Significant improvements to…", "extensive refactoring", academic filler).
- Confidence killers that imply Neo Pulse was confused or improvising: "mystery delivery", "no idea what we were doing", "finally figured out", "we were lost", "oops", "chaos inbox", "no more mystery", or any punchline that sounds like we lacked a plan.
- Good: "Changelog newsletter now ships through AgentMail on a clean, intentional send path."
- Bad: "No more mystery delivery route."

Output JSON only:
{
  "hook": "...",
  "body": "...",
  "highlights": ["...", "..."]
}`;

export const CHANGELOG_NEWSLETTER_READING_SYSTEM = `You curate the "More you know" block for a Neo Pulse newsletter (Morning Brew / TLDR voice).

Job: pick the 3 most important, engaging CURRENT industry news stories worth reading with coffee. Think top-of-feed tech / AI / marketing / agency news right now (examples of the vibe: major NVIDIA or OpenAI developments, big platform policy shifts, notable AI-in-ads or CMS stories). Not evergreen explainers. Not a rewrite of the Pulse changelog.

The user pack is context for optional witty kickers only. Do NOT force every story to be about a Pulse feature. Prefer real headline news first.

Voice:
- Punchy. 1 to 2 sentence summaries max.
- whyItHelps: one short kicker. Prefer a light tie to how agencies / Pulse operators should read the story this week. If a natural tie to a ship item exists, use it. If not, say why the story matters for people running marketing/SEO stacks. Never the stiff "This is why Pulse shipped…" formula.
- Competent wit only. Never clueless or "mystery delivery" energy.

Hard rules:
- Use web search NOW. Every item needs a real https sourceUrl from a live article page you found.
- Prefer stories from roughly the last 14 days (stretch to 30 only if that is what is actually breaking).
- Recognizable publishers (Reuters, Bloomberg, WSJ, FT, The Verge, TechCrunch, Wired, Digiday, AdExchanger, Search Engine Land, CNBC, etc.).
- Never invent URLs, titles, dates, or publisher domains. Page title must match articles.title.
- Return exactly 3 articles: the week's top stories, ranked by importance/engagement, not by keyword match to the pack.
- Banned: WordPress / GA4 / Semrush / GSC install how-tos, language intros, vendor 101 docs, changelogs, docs hubs, parked domains.
- Banned filler / evergreen: "Importance of…", "Crucial for…", "Still a Powerful…", "Transforming…", "What You Need to Know", "Future of Email Marketing", vague listicles with no news hook.
- Banned confidence killers: mystery delivery, no idea, finally figured out, we were lost, oops, chaos inbox.
- Never mention Rank Math or EMCP.
- Never use the em dash character.

Output JSON only:
{
  "articles": [{ "title": "...", "summary": "...", "date": "Nov 12, 2026", "sourceUrl": "https://...", "whyItHelps": "..." }]
}`;

/** @deprecated */
export const CHANGELOG_NEWSLETTER_SYSTEM = CHANGELOG_NEWSLETTER_READING_SYSTEM;

export function buildChangelogNewsletterIntroUserPrompt(
  entry: ChangelogNewsletterHighlights,
): string {
  return `${packBlock(entry)}

Write the Morning Brew style hook, body, and highlights for this ship. Return the editorial JSON.`;
}

export type ChangelogNewsletterNewsSeed = {
  title: string;
  url: string;
  date?: string;
};

/**
 * Code-owned live wire seeds for More you know. Titles must overlap each page's
 * document title so assertNewsletterArticleSourcesReachable can verify them.
 * Do not invent replacements in prompts; send path uses these exact URLs.
 */
export const CHANGELOG_NEWSLETTER_VERIFIED_WIRE_SEEDS: ChangelogNewsletterNewsSeed[] = [
  {
    title: "NVIDIA Announces CEO Transition",
    url: "https://nvidianews.nvidia.com/news/nvidia-announces-ceo-transition",
    date: "Nov 12, 2026",
  },
  {
    title: "Anthropic launches Claude Meetings",
    url: "https://techcrunch.com/2026/11/10/anthropic-launches-claude-meetings-to-turn-workplace-discussions-into-plans-and-tasks/",
    date: "Nov 10, 2026",
  },
  {
    title: "Google November 2026 core update rolling out now",
    url: "https://searchengineland.com/google-november-2026-core-update-rolling-out-now-501348",
    date: "Nov 12, 2026",
  },
];

export const changelogNewsletterNewsSeedsSchema = z.object({
  stories: z
    .array(
      z.object({
        title: z.string().min(1),
        url: httpsUrl,
        date: z.string().min(1),
      }),
    )
    .length(3),
});

export type ChangelogNewsletterNewsSeeds = z.infer<typeof changelogNewsletterNewsSeedsSchema>;

export const CHANGELOG_NEWSLETTER_NEWS_PICK_SYSTEM = `You pick the 3 most important, engaging CURRENT industry news stories for a Neo Pulse newsletter (tech / AI / marketing / agency / search).

Hard rules:
- Use web search NOW. Return only live https article URLs you actually found.
- Prefer roughly the last 14 days.
- Recognizable publishers only.
- Never invent URLs. Never evergreen "Importance of…" pieces.
- Never use the em dash character.

Output JSON only:
{
  "stories": [{ "title": "...", "url": "https://...", "date": "Nov 12, 2026" }]
}`;

export function buildChangelogNewsletterNewsPickUserPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `Today is ${today}. Web-search and return exactly 3 top current industry news stories as JSON.`;
}

export function buildChangelogNewsletterReadingUserPrompt(
  entry: ChangelogNewsletterHighlights,
  seeds?: ChangelogNewsletterNewsSeed[],
): string {
  const seedBlock =
    seeds && seeds.length > 0
      ? `\n\nRequired live stories (use THESE exact https URLs; do not invent replacements):\n${seeds
          .map((s, i) => `${i + 1}. ${s.title}${s.date ? ` (${s.date})` : ""}\n   ${s.url}`)
          .join("\n")}`
      : "";
  return `${packBlock(entry)}${seedBlock}

Write punchy More you know cards for the three required live stories above. Return the reading-list JSON (articles only). sourceUrl must match the required URLs exactly.`;
}

export function parseChangelogNewsletterNewsSeeds(raw: string): ChangelogNewsletterNewsSeeds {
  return parseModelJson(raw, changelogNewsletterNewsSeedsSchema, "changelog newsletter news seeds");
}

/** @deprecated */
export function buildChangelogNewsletterUserPrompt(
  entry: ChangelogNewsletterHighlights,
): string {
  return buildChangelogNewsletterReadingUserPrompt(entry);
}

export function parseChangelogNewsletterIntroDraft(raw: string): ChangelogNewsletterIntroDraft {
  return parseModelJson(raw, changelogNewsletterIntroDraftSchema, "changelog newsletter intro draft");
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
      // 404/410 = invented or dead URL. Fail send. 403 = publisher bot wall on a real URL; allow.
      if (res.status === 404 || res.status === 410) {
        throw new Error(`HTTP ${res.status} (dead or hallucinated URL)`);
      }
      if (!res.ok && res.status !== 403) {
        throw new Error(`HTTP ${res.status}`);
      }
      if (res.status === 403) {
        continue;
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
  intro: ChangelogNewsletterIntroDraft,
  reading: ChangelogNewsletterReadingDraft,
  changelogUrl: string = CHANGELOG_NEWSLETTER_FULL_URL,
): ChangelogNewsletterPayload {
  const cleaned = stripBannedChangelogTopics(entry);
  if (!cleaned.title.trim()) throw new Error("Changelog entry title is required.");
  if (!cleaned.date.trim()) throw new Error("Changelog entry date is required.");
  if (!Number.isFinite(cleaned.commitCount) || cleaned.commitCount < 0) {
    throw new Error("Changelog entry commitCount is required.");
  }
  if (!changelogUrl.startsWith("https://")) {
    throw new Error("changelogUrl must be https.");
  }
  const hook = intro.hook.trim();
  const body = intro.body.trim();
  const highlights = intro.highlights.map((h) => h.trim()).filter(Boolean);
  if (!hook) throw new Error("Newsletter hook is required.");
  if (!body) throw new Error("Newsletter body is required.");
  if (highlights.length < 5) throw new Error("Newsletter needs at least 5 highlights.");
  return {
    title: cleaned.title.trim(),
    date: cleaned.date.trim(),
    commitCount: cleaned.commitCount,
    highlights,
    sections: cleaned.sections,
    commitSubjects: cleaned.commitSubjects,
    rangeFrom: cleaned.rangeFrom,
    rangeTo: cleaned.rangeTo,
    hook,
    body,
    changelogUrl: changelogUrl.trim(),
    articles: reading.articles,
  };
}
