/**
 * Changelog newsletter draft: Morning Brew / TLDR voice.
 * Layout: summary (hook + body) + Highlights + More you know (Pulse-relative)
 * + AISEO News + Google Updates + Industry News (fun stories).
 * Never Languages, hero, or Do this week.
 */

import { z } from "zod";
import { parseModelJson } from "../model-json";

/** Pack-only editorial voice (hook, body, highlights). */
export const CHANGELOG_NEWSLETTER_INTRO_MODEL = "deepseek/deepseek-v4.1-flash";

/** @deprecated alias */
export const CHANGELOG_NEWSLETTER_EDITORIAL_MODEL = CHANGELOG_NEWSLETTER_INTRO_MODEL;

/** Web search model for article cards. */
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

/** Pack-only pass: hook, body, weekly highlights (most significant only). */
export const changelogNewsletterIntroDraftSchema = z.object({
  hook: z
    .string()
    .min(NEWSLETTER_HOOK_MIN)
    .max(NEWSLETTER_HOOK_MAX)
    .refine((h) => h.trim().split(/\s+/).length <= 8, {
      message: "hook must be 8 words or fewer",
    }),
  body: z.string().min(NEWSLETTER_BODY_MIN),
  highlights: z.array(z.string().min(1)).min(3).max(5),
});

/** Pulse-relative More you know. */
export const changelogNewsletterReadingDraftSchema = z.object({
  articles: z.array(newsletterArticleSchema).length(3),
});

/** Fun Industry News stories. */
export const changelogNewsletterIndustryDraftSchema = z.object({
  articles: z.array(newsletterArticleSchema).length(3),
});

/** AISEO News (AI Overviews / GEO / AI search visibility). */
export const changelogNewsletterAiseoDraftSchema = z.object({
  articles: z.array(newsletterArticleSchema).length(3),
});

/** Google Updates (core updates, Search Console, Search product changes). */
export const changelogNewsletterGoogleDraftSchema = z.object({
  articles: z.array(newsletterArticleSchema).length(3),
});

export type ChangelogNewsletterIntroDraft = z.infer<typeof changelogNewsletterIntroDraftSchema>;
export type ChangelogNewsletterReadingDraft = z.infer<typeof changelogNewsletterReadingDraftSchema>;
export type ChangelogNewsletterIndustryDraft = z.infer<
  typeof changelogNewsletterIndustryDraftSchema
>;
export type ChangelogNewsletterAiseoDraft = z.infer<typeof changelogNewsletterAiseoDraftSchema>;
export type ChangelogNewsletterGoogleDraft = z.infer<typeof changelogNewsletterGoogleDraftSchema>;

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
  /** Pulse-relative supporting articles (More you know). */
  articles: z.infer<typeof newsletterArticleSchema>[];
  /** AISEO / AI search visibility stories. */
  aiseoArticles: z.infer<typeof newsletterArticleSchema>[];
  /** Google Search algorithm and product updates. */
  googleArticles: z.infer<typeof newsletterArticleSchema>[];
  /** Fun industry stories (Industry News). */
  industryArticles: z.infer<typeof newsletterArticleSchema>[];
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

export const CHANGELOG_NEWSLETTER_INTRO_SYSTEM = `You write the Neo Pulse product newsletter in a Morning Brew / TLDR voice for a CEO / agency owner who does NOT write code.

Perspective (non-negotiable):
- Write from PULSE's point of view. Neo Pulse is the product that shipped. The reader uses Pulse to run their agency.
- Never sound like a client-owned changelog or a client marketing brief.
- Do not lead with "client-facing stuff got the most love" energy.
- Good: "Pulse now expands every section in report PDFs so the pack reads finished."
- Bad: "This week the client-facing stuff got the most love."
- You may mention client work as the outcome of a Pulse capability, but Pulse is the subject of every sentence that can take one.

Audience:
- Reader has never opened the codebase. They do not know commits, modules, CI, schemas, APIs, or file paths.
- Explain outcomes in plain English: what Pulse made easier, faster, clearer, or more trustworthy.
- Never list technical changes. Never dump jargon. Translate every ship into product meaning.

Banned jargon (never use these words or close cousins in hook, body, or highlights):
commit, commits, module, refactor, flatten, schema, API, endpoint, payload, hydrate, deploy, pipeline, worker, JSON, TypeScript, PHP, CI, gate, PR, merge, soft-reset, sandbox, origin, repo, OpenRouter, AgentMail (ok only if explained as "the email Pulse sends you"), hash, UUID, CLS, DOM, Tailwind.

Layout this copy feeds:
- Summary block (hook + body), then Weekly highlights (repo updates only). More you know, AISEO News, Google Updates, and Industry News are written elsewhere.
- Never write Languages, hero image, Do this week, or extra sections into the copy.

Voice:
- Punchy, conversational, slightly witty, self-aware.
- Fun to skim over morning coffee. Millennial tech-newsletter energy without cringe, without emoji spam.
- Short sentences. Zero corporate changelog speak.
- Humor must sound COMPETENT and INTENTIONAL. Upgrade energy, not apology energy.

Grounding:
- The user pack is the ONLY source of facts.
- Never invent features. Never Rank Math or EMCP. Never external URLs.
- Never use the em dash character.

Write:
1) hook: SHORT email-safe headline. Max 8 words and max 48 characters. Complete thought. Never end mid-phrase. Gmail subject from Pulse's POV (examples: "Pulse reports look finished.", "Pulse makes adding a site simpler.").
2) body: one short plain-English paragraph about the week's biggest Pulse ships and why they matter. Not a feature dump. Pulse is the actor.
3) highlights: ONLY the 3 to 5 most significant weekly repo updates. Rewrite as Pulse outcomes. Skip tiny or routine noise. Lead with what Pulse did.

Banned tone:
- Dry release-note speak ("Significant improvements to…", "extensive refactoring").
- Confidence killers: "mystery delivery", "no idea what we were doing", "finally figured out", "we were lost", "oops", "chaos inbox".
- Client-owned framing: "the client-facing stuff…", treating the newsletter like a client deliverable instead of a Pulse product update.

Output JSON only:
{
  "hook": "...",
  "body": "...",
  "highlights": ["...", "..."]
}`;

/** More you know pick: find live Pulse-relative article URLs only. */
export const CHANGELOG_NEWSLETTER_PULSE_PICK_SYSTEM = `You find 3 CURRENT, real https news URLs that help a non-technical CEO understand WHY this Neo Pulse ship matters.

Themes must come from the user pack (client reporting trust, local SEO / map visibility, internal changelog / ops clarity, client onboarding, search ranking shifts, AI tools for agencies). This is NOT fun Industry News. Do not pick random NVIDIA/OpenAI headlines unless they clearly explain a theme from THIS ship.

Hard rules:
- Use web search NOW. Return only live https article URLs you actually opened.
- Prefer roughly the last 14 days (stretch to 30 only if needed).
- Recognizable publishers only (Digiday, AdExchanger, Search Engine Land, Search Engine Journal, The Verge, TechCrunch, Wired, Reuters, Bloomberg, CNBC, FT, WSJ, etc.).
- Never invent URLs or domains. Never marketingland.com filler. Never parked domains.
- Banned evergreen: "Importance of…", "Crucial for…", "What You Need to Know", "Future of…", vague listicles with no news hook.
- Never WordPress / GA4 / Semrush / GSC install how-tos.
- Never use the em dash character.

Output JSON only:
{
  "stories": [{ "title": "...", "url": "https://...", "date": "Nov 12, 2026" }]
}`;

/** More you know cards: write against required Pulse-relative seed URLs. */
export const CHANGELOG_NEWSLETTER_READING_SYSTEM = `You write punchy "More you know" cards for a Neo Pulse newsletter.

Job: explain 3 required live articles that help a non-technical CEO understand WHY this Pulse ship matters. Use ONLY the required https URLs in the user message. sourceUrl must match exactly.

Voice:
- Punchy. 1 to 2 sentence summaries max. No engineering jargon.
- whyItHelps: one short kicker that ties the article to what Pulse just shipped. Plain English. Never "This is why Pulse shipped…" formula. Never clueless / mystery-delivery energy.

Hard rules:
- Never invent or swap URLs.
- Never use the em dash character.
- Never mention Rank Math or EMCP.

Output JSON only:
{
  "articles": [{ "title": "...", "summary": "...", "date": "Nov 12, 2026", "sourceUrl": "https://...", "whyItHelps": "..." }]
}`;

/** AISEO News: AI Overviews / GEO / AI search visibility. */
export const CHANGELOG_NEWSLETTER_AISEO_SYSTEM = `You write punchy cards for the "AISEO News" block in a Neo Pulse newsletter.

Job: cover 3 CURRENT AI SEO stories (AI Overviews, AI Mode, GEO, AI citations, generative search visibility). Agency-relevant. Not a Pulse changelog rewrite. Not generic Industry News fluff. Not Google core-update recaps (those belong in Google Updates).

Voice:
- Punchy. 1 to 2 sentence summaries max.
- whyItHelps: one short kicker on why an agency SEO lead should care this week.
- Competent wit only. Never clueless or mystery-delivery energy.

Hard rules:
- Use ONLY the required live https URLs provided in the user message. sourceUrl must match exactly. Never invent replacements.
- Never use the em dash character.
- Never mention Rank Math or EMCP.

Output JSON only:
{
  "articles": [{ "title": "...", "summary": "...", "date": "Nov 12, 2026", "sourceUrl": "https://...", "whyItHelps": "..." }]
}`;

/** Google Updates: Search algorithm and Search product changes. */
export const CHANGELOG_NEWSLETTER_GOOGLE_SYSTEM = `You write punchy cards for the "Google Updates" block in a Neo Pulse newsletter.

Job: cover 3 CURRENT Google Search updates (core updates, spam updates, Search Console changes, Search Status / product docs that affect rankings or reporting). Agency-relevant. Not AISEO theory pieces. Not fun Industry News.

Voice:
- Punchy. 1 to 2 sentence summaries max.
- whyItHelps: one short kicker on what an agency should watch or brief this week.
- Competent wit only. Never clueless or mystery-delivery energy.

Hard rules:
- Use ONLY the required live https URLs provided in the user message. sourceUrl must match exactly. Never invent replacements.
- Never use the em dash character.
- Never mention Rank Math or EMCP.

Output JSON only:
{
  "articles": [{ "title": "...", "summary": "...", "date": "Nov 12, 2026", "sourceUrl": "https://...", "whyItHelps": "..." }]
}`;

/** Industry News: fun / engaging top stories (separate section). */
export const CHANGELOG_NEWSLETTER_INDUSTRY_SYSTEM = `You write punchy cards for the "Industry News" block in a Neo Pulse newsletter.

Job: make 3 fun, engaging CURRENT industry stories feel worth a coffee skim. Tech / AI / marketing / agency vibes. Not a rewrite of the Pulse changelog. Not "why we shipped" pieces. Not AISEO deep-dives. Not Google core-update recaps.

Voice:
- Punchy. 1 to 2 sentence summaries max.
- whyItHelps: one short witty kicker for agency folks. Light and human. Not stiff.
- Competent wit only. Never clueless or mystery-delivery energy.

Hard rules:
- Use ONLY the required live https URLs provided in the user message. sourceUrl must match exactly. Never invent replacements.
- Never use the em dash character.
- Never mention Rank Math or EMCP.

Output JSON only:
{
  "articles": [{ "title": "...", "summary": "...", "date": "Nov 12, 2026", "sourceUrl": "https://...", "whyItHelps": "..." }]
}`;

/** @deprecated */
export const CHANGELOG_NEWSLETTER_SYSTEM = CHANGELOG_NEWSLETTER_READING_SYSTEM;

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

export function buildChangelogNewsletterIntroUserPrompt(
  entry: ChangelogNewsletterHighlights,
): string {
  return `${packBlock(entry)}

Write the Morning Brew style hook, body, and weekly highlights for this ship.
Audience reminder: CEO / agency owner who does not know the code. Plain English outcomes only.
Repo updates rule: only the most significant weekly wins (3 to 5). Return the editorial JSON.`;
}

export type ChangelogNewsletterNewsSeed = {
  title: string;
  url: string;
  date?: string;
};

/**
 * Code-owned live wire seeds for Pulse-relative More you know.
 * Themes: client reporting trust, local maps, AI Overview traffic impact.
 */
export const CHANGELOG_NEWSLETTER_PULSE_WIRE_SEEDS: ChangelogNewsletterNewsSeed[] = [
  {
    title: "Don't wait for the SEO report to tell clients something's wrong",
    url: "https://searchengineland.com/seo-report-client-wrong-500715",
    date: "Nov 5, 2026",
  },
  {
    title: "Inside Google Maps: 72 ranking signals and the architecture behind local search",
    url: "https://searchengineland.com/inside-google-maps-72-ranking-signals-and-the-architecture-behind-local-search-486906",
    date: "Oct 15, 2026",
  },
  {
    title: "Google AI Overviews in France: Big click losses, but not for everyone",
    url: "https://searchengineland.com/google-ai-overviews-france-analysis-501153",
    date: "Nov 9, 2026",
  },
];

/**
 * Code-owned live wire seeds for AISEO News.
 * Titles must overlap each page's document title for live URL assert.
 */
export const CHANGELOG_NEWSLETTER_AISEO_WIRE_SEEDS: ChangelogNewsletterNewsSeed[] = [
  {
    title: "Google's Guide to Optimizing for Generative AI Features on Google Search",
    url: "https://developers.google.com/search/docs/fundamentals/ai-optimization-guide",
    date: "Nov 12, 2026",
  },
  {
    title: "Google Placing Citation/Source Icons At Bottom Of AI Overviews",
    url: "https://www.seroundtable.com/google-ai-overview-source-icons-bottom-42519.html",
    date: "Nov 11, 2026",
  },
  {
    title: "Are we chasing AI visibility at the expense of business results?",
    url: "https://searchengineland.com/are-we-chasing-ai-visibility-at-the-expense-of-business-results-501382",
    date: "Nov 12, 2026",
  },
];

/**
 * Code-owned live wire seeds for Google Updates.
 * Titles must overlap each page's document title for live URL assert.
 */
export const CHANGELOG_NEWSLETTER_GOOGLE_WIRE_SEEDS: ChangelogNewsletterNewsSeed[] = [
  {
    title: "Google November 2026 core update rolling out now",
    url: "https://searchengineland.com/google-november-2026-core-update-rolling-out-now-501348",
    date: "Nov 10, 2026",
  },
  {
    title: "Google Search Console performance report data bug Nov 9 -11",
    url: "https://searchengineland.com/google-search-console-performance-report-data-bug-nov-9-11-501899",
    date: "Nov 12, 2026",
  },
  {
    title: "November 2026 Google Webmaster Report: Spam Update Done, AI Overviews, Help Docs, Local",
    url: "https://www.seroundtable.com/november-2026-google-webmaster-report-42431.html",
    date: "Nov 12, 2026",
  },
];

/**
 * Code-owned live wire seeds for Industry News fun stories.
 * Titles must overlap each page's document title for live URL assert.
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
    title: "OpenAI rolls out new business profiles, making ChatGPT just a little bit more like Google",
    url: "https://techcrunch.com/2026/11/10/openai-rolls-out-new-business-profiles-making-chatgpt-just-a-little-bit-more-like-google/",
    date: "Nov 10, 2026",
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

export function buildChangelogNewsletterNewsPickUserPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `Today is ${today}. Web-search and return exactly 3 top current industry news stories as JSON.`;
}

export function buildChangelogNewsletterPulsePickUserPrompt(
  entry: ChangelogNewsletterHighlights,
): string {
  const today = new Date().toISOString().slice(0, 10);
  return `${packBlock(entry)}

Today is ${today}. Web-search and return exactly 3 live Pulse-relative supporting stories as JSON.
Real https news URLs only. No evergreen filler. No invented domains.`;
}

export function buildChangelogNewsletterReadingUserPrompt(
  entry: ChangelogNewsletterHighlights,
  seeds: ChangelogNewsletterNewsSeed[],
): string {
  const seedBlock = seeds
    .map((s, i) => `${i + 1}. ${s.title}${s.date ? ` (${s.date})` : ""}\n   ${s.url}`)
    .join("\n");
  return `${packBlock(entry)}

Required live More you know stories (use THESE exact https URLs; do not invent replacements):
${seedBlock}

Write punchy More you know cards for these three Pulse-relative stories. Return the reading-list JSON (articles only). sourceUrl must match exactly.`;
}

export function buildChangelogNewsletterIndustryUserPrompt(
  seeds: ChangelogNewsletterNewsSeed[],
): string {
  const seedBlock = seeds
    .map((s, i) => `${i + 1}. ${s.title}${s.date ? ` (${s.date})` : ""}\n   ${s.url}`)
    .join("\n");
  return `Required live Industry News stories (use THESE exact https URLs; do not invent replacements):
${seedBlock}

Write punchy Industry News cards for these three fun stories. Return the industry JSON (articles only). sourceUrl must match exactly.`;
}

export function buildChangelogNewsletterAiseoUserPrompt(
  seeds: ChangelogNewsletterNewsSeed[],
): string {
  const seedBlock = seeds
    .map((s, i) => `${i + 1}. ${s.title}${s.date ? ` (${s.date})` : ""}\n   ${s.url}`)
    .join("\n");
  return `Required live AISEO News stories (use THESE exact https URLs; do not invent replacements):
${seedBlock}

Write punchy AISEO News cards for these three AI search / GEO stories. Return the AISEO JSON (articles only). sourceUrl must match exactly.`;
}

export function buildChangelogNewsletterGoogleUserPrompt(
  seeds: ChangelogNewsletterNewsSeed[],
): string {
  const seedBlock = seeds
    .map((s, i) => `${i + 1}. ${s.title}${s.date ? ` (${s.date})` : ""}\n   ${s.url}`)
    .join("\n");
  return `Required live Google Updates stories (use THESE exact https URLs; do not invent replacements):
${seedBlock}

Write punchy Google Updates cards for these three Search / Search Console stories. Return the Google Updates JSON (articles only). sourceUrl must match exactly.`;
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

export function parseChangelogNewsletterIndustryDraft(
  raw: string,
): ChangelogNewsletterIndustryDraft {
  return parseModelJson(
    raw,
    changelogNewsletterIndustryDraftSchema,
    "changelog newsletter industry draft",
  );
}

export function parseChangelogNewsletterAiseoDraft(raw: string): ChangelogNewsletterAiseoDraft {
  return parseModelJson(raw, changelogNewsletterAiseoDraftSchema, "changelog newsletter aiseo draft");
}

export function parseChangelogNewsletterGoogleDraft(raw: string): ChangelogNewsletterGoogleDraft {
  return parseModelJson(
    raw,
    changelogNewsletterGoogleDraftSchema,
    "changelog newsletter google draft",
  );
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
        `Article source is not a live matching page: "${article.title}" → ${article.sourceUrl} (${detail}). Re-run so web search returns real publisher URLs.`,
      );
    }
  }
}

export function assembleChangelogNewsletter(
  entry: ChangelogNewsletterHighlights,
  intro: ChangelogNewsletterIntroDraft,
  reading: ChangelogNewsletterReadingDraft,
  aiseo: ChangelogNewsletterAiseoDraft,
  google: ChangelogNewsletterGoogleDraft,
  industry: ChangelogNewsletterIndustryDraft,
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
  if (highlights.length < 3) throw new Error("Newsletter needs at least 3 weekly highlights.");
  if (highlights.length > 5) throw new Error("Newsletter may include at most 5 weekly highlights.");
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
    aiseoArticles: aiseo.articles,
    googleArticles: google.articles,
    industryArticles: industry.articles,
  };
}
