/**
 * Decision-engine ranking for weekly newsletter product impacts.
 * Scores everyday user-facing Pulse features; writer must lead with the top winners.
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

export const CHANGELOG_IMPACT_RANK_SYSTEM = `You are the Neo Pulse Decision Engine scoring USER-FACING PRODUCT IMPACT for a weekly newsletter.

Readers are everyday Pulse users (agency owners and staff). They open screens, run reports, connect clients, and paste keys. They have never opened the codebase.

Job: read the week's commit pack and return the 5 to 8 most significant product features / workflow wins people can see and use, ranked by impactScore (0 to 5).

Score ONLY what a daily user would notice in the product:
- 5 = new or transformed screen / workflow they use every week (Changelog studio, Integrations leads, add-client dock, Keys that unlock generation)
- 4 = clear fix to a broken everyday path (cold links open the right page; client report still shows the sections that loaded)
- 3 = useful polish on a named screen or report people already use
- 2 = small UI clarity
- 1 = minor
- 0 = noise

Hard rules:
- Recency bias is forbidden. Score the whole week.
- theme must name the SCREEN or FEATURE in plain English a user would recognize (Changelog, Integrations, Keys, client reports, workspace links). Never "hub", "deploy", "module", "architecture", "ownable", "Wave", "CI", "Storybook", "evals", "disk", "500 lines".
- Prefer concrete product ships over reliability poetry. If a reliability fix matters, say what the user still gets on screen (for example "client reports still show the sections that loaded").
- BAN from ranked list: AgentMail, AISEO News / Google Updates email sections, weekly-highlights format, email palette / wire-seed / setup-key, Friday auto-send about the newsletter itself, flatten/push ops, Wave/audit/grade/CI/Storybook/eval work, PHP trait splits, console-call sweeps, "codebase craft" / "small enough to own".
- Changelog studio may rank high when it is a real new screen users open (archive, approve drafts, due flag).
- why: one short sentence of why a daily Pulse user cares.
- Never use the em dash character.

Output JSON only:
{
  "ranked": [{ "theme": "...", "impactScore": 5, "why": "..." }]
}`;

export function buildChangelogImpactRankUserPrompt(commitLines: string[]): string {
  const today = new Date().toISOString().slice(0, 10);
  return `Today is ${today}. Score everyday USER-FACING product IMPACT for this week's Neo Pulse commit pack.

Commit pack (oldest first):
${commitLines.join("\n")}

Return the ranked Decision Engine JSON now. Highest impactScore first. Themes must name screens and features users recognize.`;
}

export function parseChangelogImpactRank(raw: string): ChangelogImpactRank {
  const parsed = parseModelJson(raw, changelogImpactRankSchema, "changelog impact rank");
  const ranked = [...parsed.ranked].sort((a, b) => b.impactScore - a.impactScore);
  return { ranked };
}

/** Top themes the newsletter writer must cover (highest scores first). Default 3 for Jobs-tight weekly highlights. */
export function topImpactThemes(rank: ChangelogImpactRank, limit = 3): string[] {
  return rank.ranked
    .slice()
    .sort((a, b) => b.impactScore - a.impactScore)
    .slice(0, limit)
    .map((r) => r.theme);
}
