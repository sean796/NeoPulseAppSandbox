import { describe, expect, it } from "vitest";
import {
  CHANGELOG_IMPACT_DECISION_MODEL,
  CHANGELOG_IMPACT_RANK_SYSTEM,
  buildChangelogImpactRankUserPrompt,
  parseChangelogImpactRank,
  topImpactThemes,
} from "@/lib/changelog/changelog-newsletter-impact-rank";

describe("changelog newsletter impact rank", () => {
  it("locks Decision Engine model and bans repeats and polish in the rank prompt", () => {
    expect(CHANGELOG_IMPACT_DECISION_MODEL).toContain("liquid/lfm");
    expect(CHANGELOG_IMPACT_RANK_SYSTEM).toContain("Decision Engine");
    expect(CHANGELOG_IMPACT_RANK_SYSTEM).toContain("MAJOR WEEKLY FEATURES");
    expect(CHANGELOG_IMPACT_RANK_SYSTEM).toContain("Hard BAN from ranked list");
    expect(CHANGELOG_IMPACT_RANK_SYSTEM).toContain("PRIOR ARCHIVE");
    expect(CHANGELOG_IMPACT_RANK_SYSTEM).toContain("AgentMail");
    expect(CHANGELOG_IMPACT_RANK_SYSTEM).toContain("API Keys");
    expect(CHANGELOG_IMPACT_RANK_SYSTEM).toContain("Skills schedule");
    expect(CHANGELOG_IMPACT_RANK_SYSTEM).not.toContain("Recency bias is forbidden");
  });

  it("parses ranked themes and drops keys/deep-link polish from top picks", () => {
    const rank = parseChangelogImpactRank(
      JSON.stringify({
        ranked: [
          {
            theme: "Workspace links open the page you clicked",
            impactScore: 4,
            why: "Stops dumping you on Dashboard.",
          },
          {
            theme: "Skills Time Daily Weekly Monthly schedule controls",
            impactScore: 5,
            why: "Per-skill run schedule people can set.",
          },
          { theme: "Keys screen registers your AI key as you type", impactScore: 5, why: "Generation starts working." },
          {
            theme: "Properties profile and Skills library",
            impactScore: 5,
            why: "Profile skills people open and run.",
          },
          {
            theme: "Pulse Host My Sites page",
            impactScore: 4,
            why: "Hosted sites list.",
          },
        ],
      }),
    );
    expect(rank.ranked[0]?.impactScore).toBe(5);
    expect(topImpactThemes(rank, 3)).toEqual([
      "Skills Time Daily Weekly Monthly schedule controls",
      "Properties profile and Skills library",
    ]);
  });

  it("builds a week pack user prompt with prior archive ban list", () => {
    const prompt = buildChangelogImpactRankUserPrompt(
      [
        "- 2026-11-06 Wave 5 batch 2: split 45 files under 500 lines",
        "- 2026-11-15 Ship skill run schedules",
      ],
      ["- Title: Pulse Host site controls", "  - My Sites page"],
    );
    expect(prompt).toContain("major NEW weekly FEATURES");
    expect(prompt).toContain("PRIOR ARCHIVE");
    expect(prompt).toContain("Pulse Host site controls");
    expect(prompt).toContain("Ship skill run schedules");
  });
});
