/**
 * Decision-engine ranking for weekly newsletter major features.
 * Scores only big user-facing Pulse features of the week.
 */

import { z } from "zod";
import { parseModelJson } from "../model-json";

/** Pulse Decision category model (Checker & Router). */
export const CHANGELOG_IMPACT_DECISION_MODEL = "liquid/lfm-2.5-24b-a2b";

export const changelogImpactThemeSchema = z.object({
  theme: z.string().min(1),
  impactScore: z.number().min(0).max(5),
  why: z.string().min(1),
});

export const changelogImpactRankSchema = z.object({
  ranked: z.array(changelogImpactThemeSchema).min(3).max(8),
});

export type ChangelogImpactRank = z.infer<typeof changelogImpactRankSchema>;

export const CHANGELOG_IMPACT_RANK_SYSTEM = `You are the Neo Pulse Decision Engine scoring MAJOR WEEKLY FEATURES for a product newsletter.

Readers are everyday Pulse users. They want the big new capabilities of THIS WEEK. Not polish. Not bug fixes. Not keys. Not links.

Job: read the week's commit pack and return the 3 to 5 biggest NEW or TRANSFORMED product features people can open and use, ranked by impactScore (0 to 5).

Score ONLY major features of the week:
- 5 = brand-new screen or major workflow (Changelog studio, Integrations add-client dock, Google Business / Organic Website Leads surfaces, Settings studio rebuild that changes how you work)
- 4 = large feature expansion on a named product area users live in
- 3 = meaningful feature addition (still a feature, not a fix)
- 2 or below = do not use for newsletter highlights

Hard BAN from ranked list (never include, even if many commits):
- API Keys / AI key / OpenRouter / "registers as you type"
- Deep links / cold load / Dashboard bounce
- Partial report fetch / "sections that loaded" / single-source failure
- Hub, deploy, disk, Wave, CI, Storybook, evals, module splits, "ownable", architecture
- AgentMail, AISEO News / Google Updates email sections, newsletter format, wire-seed, palette, Friday auto-send meta, flatten/push

theme: name the MAJOR FEATURE in plain English (screen or capability).
why: one short sentence of why this is a major weekly feature for a Pulse user.
Recency bias is forbidden. Score the whole week.
Never use the em dash character.

Output JSON only:
{
  "ranked": [{ "theme": "...", "impactScore": 5, "why": "..." }]
}`;

export function buildChangelogImpactRankUserPrompt(commitLines: string[]): string {
  const today = new Date().toISOString().slice(0, 10);
  return `Today is ${today}. Score ONLY major weekly FEATURES from this Neo Pulse commit pack.

Ignore keys, deep links, report-partial fixes, hub, Wave, and newsletter meta.

Commit pack (oldest first):
${commitLines.join("\n")}

Return the ranked Decision Engine JSON now. Highest impactScore first. Themes must be major features users open.`;
}

export function parseChangelogImpactRank(raw: string): ChangelogImpactRank {
  const parsed = parseModelJson(raw, changelogImpactRankSchema, "changelog impact rank");
  const ranked = [...parsed.ranked].sort((a, b) => b.impactScore - a.impactScore);
  return { ranked };
}

const BANNED_THEME_NEEDLES = [
  "api key",
  "keys screen",
  "openrouter",
  "as you type",
  "deep link",
  "cold load",
  "dashboard",
  "fetch",
  "source fail",
  "sections that loaded",
  "hub",
  "wave",
  "ownable",
  "agentmail",
  "newsletter",
];

/** True when a Decision theme is polish/fix noise, not a major weekly feature. */
export function isBannedImpactTheme(theme: string): boolean {
  const lower = theme.toLowerCase();
  return BANNED_THEME_NEEDLES.some((n) => lower.includes(n));
}

/** Top major features the newsletter must cover (highest scores first). Drops banned polish themes. */
export function topImpactThemes(rank: ChangelogImpactRank, limit = 3): string[] {
  return rank.ranked
    .slice()
    .sort((a, b) => b.impactScore - a.impactScore)
    .filter((r) => !isBannedImpactTheme(r.theme))
    .slice(0, limit)
    .map((r) => r.theme);
}
