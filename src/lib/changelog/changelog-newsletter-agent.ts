/**
 * OpenRouter web-search draft for the Pulse changelog newsletter.
 *
 * Product highlights stay on the archive entry (code-owned). This agent
 * only fills SEO news, languages, and must-read tips from live web search,
 * and every item must map to a theme in this Pulse update.
 */

import { z } from "zod";
import { parseModelJson } from "../model-json";

/** OpenRouter web-search model (same id as LLM_AUDIT_OPENROUTER_MODEL). */
export const CHANGELOG_NEWSLETTER_WEB_MODEL = "openai/gpt-4o-mini:online";

const httpsUrl = z
  .string()
  .min(1)
  .refine((u) => u.startsWith("https://"), { message: "sourceUrl must be https" });

export const newsletterNewsItemSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  date: z.string().min(1),
  sourceUrl: httpsUrl,
  pulseTheme: z.string().min(1),
});

export const newsletterLanguageItemSchema = z.object({
  name: z.string().min(1),
  whyItMatters: z.string().min(1),
  sourceUrl: httpsUrl,
  pulseTheme: z.string().min(1),
});

export const newsletterTipItemSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  sourceUrl: httpsUrl,
  pulseTheme: z.string().min(1),
});

export const changelogNewsletterWebDraftSchema = z.object({
  news: z.array(newsletterNewsItemSchema).length(3),
  languages: z.array(newsletterLanguageItemSchema).length(3),
  tips: z.array(newsletterTipItemSchema).length(3),
});

export type ChangelogNewsletterWebDraft = z.infer<typeof changelogNewsletterWebDraftSchema>;

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
};

export type ChangelogNewsletterPayload = ChangelogNewsletterHighlights & ChangelogNewsletterWebDraft;

export const CHANGELOG_NEWSLETTER_SYSTEM = `You research external news for a Neo Pulse product-update newsletter.

Relevance rules (non-negotiable):
- The user message lists THIS Pulse update (title, highlights, section bullets). That pack is the topic map.
- Every news story, language item, and tip MUST be directly useful for understanding or applying something named in that pack (for example Pulse Host / WordPress hosting, site user management, client reporting narratives, Semrush, GA4, GSC, OpenRouter keys, Local Grid).
- Reject generic AI hype, model release roundups, or SEO gossip that does not map to a Pulse theme in the pack.
- Each item includes pulseTheme: a short phrase naming which Pulse highlight or section theme it supports.
- Use web search only. Every item needs a real https sourceUrl. Never invent URLs, stories, or dates.
- Return exactly 3 news items, 3 language items, and 3 tips. No empty arrays.
- News: three recent industry stories (this week, or last 14 days if thin) that illuminate the Pulse themes above. Two short sentences each. Short human date (e.g. "Nov 12, 2026").
- Languages: three languages that matter for the SAME Pulse themes (stack languages for hosting/agents/reporting, or content languages tied to client SEO work those features support). One sentence on why it matters for this update.
- Tips: three must-read actions an agency owner can take this week that use or benefit from the features in THIS Pulse update. Each tip needs a sourceUrl.
- Do NOT repeat or rephrase the product changelog bullets. Those stay in Highlights.
- Never use the em dash character. Use commas, periods, or parentheses instead.

Output (JSON only, no markdown fences, no commentary):
{
  "news": [{ "title": "...", "summary": "...", "date": "...", "sourceUrl": "https://...", "pulseTheme": "Pulse Host user management" }],
  "languages": [{ "name": "...", "whyItMatters": "...", "sourceUrl": "https://...", "pulseTheme": "..." }],
  "tips": [{ "title": "...", "body": "...", "sourceUrl": "https://...", "pulseTheme": "..." }]
}`;

export function buildChangelogNewsletterUserPrompt(entry: ChangelogNewsletterHighlights): string {
  const bullets =
    entry.highlights.length > 0
      ? entry.highlights.map((h) => `- ${h}`).join("\n")
      : "- (no highlights on this entry)";
  const sectionLines =
    entry.sections && entry.sections.length > 0
      ? entry.sections
          .map((section) => {
            const items = section.items
              .slice(0, 8)
              .map((item) => `  - ${item}`)
              .join("\n");
            return `${section.heading}:\n${items}`;
          })
          .join("\n")
      : "(no sections)";
  return `THIS Pulse update (topic map for every news, language, and tip item):
Title: ${entry.title}
Date: ${entry.date}
Commits: ${entry.commitCount}
Highlights:
${bullets}

Sections:
${sectionLines}

Search the web for sources that illuminate THESE Pulse themes only. Return the newsletter research JSON now.`;
}

export function parseChangelogNewsletterWebDraft(raw: string): ChangelogNewsletterWebDraft {
  return parseModelJson(raw, changelogNewsletterWebDraftSchema, "changelog newsletter web draft");
}

/** Merge code-owned highlights with the validated web draft. */
export function assembleChangelogNewsletter(
  entry: ChangelogNewsletterHighlights,
  draft: ChangelogNewsletterWebDraft,
): ChangelogNewsletterPayload {
  if (!entry.title.trim()) {
    throw new Error("Changelog entry title is required.");
  }
  if (!entry.date.trim()) {
    throw new Error("Changelog entry date is required.");
  }
  if (!Number.isFinite(entry.commitCount) || entry.commitCount < 0) {
    throw new Error("Changelog entry commitCount is required.");
  }
  return {
    title: entry.title.trim(),
    date: entry.date.trim(),
    commitCount: entry.commitCount,
    highlights: entry.highlights.map((h) => h.trim()).filter(Boolean),
    sections: entry.sections,
    news: draft.news,
    languages: draft.languages,
    tips: draft.tips,
  };
}

/** Brand-aligned hero: Neo Pulse dark shell + lime accent. No EKG, no text. */
export const CHANGELOG_NEWSLETTER_HERO_PROMPT = `Create a wide 16:9 editorial hero for the Neo Pulse product newsletter.

Brand lock:
- Background near-black / deep charcoal like #02050a (Neo Pulse dark UI).
- Accent lime green exactly like Neo Pulse brand #84bd00 (not teal, not emerald Tailwind green).
- Clean agency SaaS aesthetic matching a dark dashboard product, not a medical or fitness look.

Composition:
- Abstract soft geometry inspired by the Neo Pulse leaf / n brand mark (two curved organic blades), large and elegant, not a logo recreation with letters.
- Subtle sense of a hosting and reporting control plane: soft panels, faint grid, or layered cards in the dark field.
- Cinematic lighting with a restrained #84bd00 glow. Premium, minimal, modern.

Forbidden:
- No heartbeat / EKG / oscilloscope / cardiogram lines.
- No text, letters, numbers, watermarks, logos, UI chrome, or browser mockups.
- No purple gradients, no neon cyber clutter, no stock-photo people.`;
