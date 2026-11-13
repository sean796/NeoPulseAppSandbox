/**
 * Decision-engine ranking for weekly newsletter coding impacts.
 * Scores themes from the week pack; writer must lead with the top winners.
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

export const CHANGELOG_IMPACT_RANK_SYSTEM = `You are the Neo Pulse Decision Engine scoring CODING IMPACT for a weekly CEO newsletter.

Job: read the week's commit pack and return the 5 to 8 most significant coding / product-engineering impacts, ranked by impactScore (0 to 5).

Score for REAL impact on the product and the agency that runs on it:
- 5 = foundational / transformative (architecture that changes what Pulse can ship; reporting that refuses to fail; live hub that stays up)
- 4 = major unlock (keys that unblock generation; navigation that finally works; Integrations/leads that change the workday)
- 3 = important reliability or workflow win
- 2 = useful but not headline
- 1 = minor
- 0 = noise

Hard rules:
- Recency bias is forbidden. Score the whole week.
- Prefer structural coding wins (architecture under 500-line modules, hub live reliability, report resilience, deep links, API keys, Integrations/leads) over newsletter meta.
- BAN from ranked list (do not include): AgentMail, AISEO News / Google Updates email sections, weekly-highlights format tweaks, email palette / wire-seed / setup-key, Friday auto-send copy about the newsletter, flatten/push ops, wave/audit grade language as a theme title.
- Changelog studio may appear only if impactScore would be >= 4 AND it is not crowding out higher foundation wins; prefer product reliability over "we built a changelog email".
- theme: short CEO-readable label of the win (not a commit hash).
- why: one short sentence of why the score is high.
- Never use the em dash character.

Output JSON only:
{
  "ranked": [{ "theme": "...", "impactScore": 5, "why": "..." }]
}`;

export function buildChangelogImpactRankUserPrompt(commitLines: string[]): string {
  const today = new Date().toISOString().slice(0, 10);
  return `Today is ${today}. Score coding IMPACT for this week's Neo Pulse commit pack.

Commit pack (oldest first):
${commitLines.join("\n")}

Return the ranked Decision Engine JSON now. Highest impactScore first.`;
}

export function parseChangelogImpactRank(raw: string): ChangelogImpactRank {
  const parsed = parseModelJson(raw, changelogImpactRankSchema, "changelog impact rank");
  const ranked = [...parsed.ranked].sort((a, b) => b.impactScore - a.impactScore);
  return { ranked };
}

/** Top themes the newsletter writer must cover (highest scores first). */
export function topImpactThemes(rank: ChangelogImpactRank, limit = 5): string[] {
  return rank.ranked
    .slice()
    .sort((a, b) => b.impactScore - a.impactScore)
    .slice(0, limit)
    .map((r) => r.theme);
}
