import { describe, expect, it } from "vitest";
import {
  CHANGELOG_IMPACT_DECISION_MODEL,
  CHANGELOG_IMPACT_RANK_SYSTEM,
  buildChangelogImpactRankUserPrompt,
  parseChangelogImpactRank,
  topImpactThemes,
} from "@/lib/changelog/changelog-newsletter-impact-rank";

describe("changelog newsletter impact rank", () => {
  it("locks Decision Engine model and bans newsletter meta in the rank prompt", () => {
    expect(CHANGELOG_IMPACT_DECISION_MODEL).toContain("liquid/lfm");
    expect(CHANGELOG_IMPACT_RANK_SYSTEM).toContain("Decision Engine");
    expect(CHANGELOG_IMPACT_RANK_SYSTEM).toContain("USER-FACING PRODUCT IMPACT");
    expect(CHANGELOG_IMPACT_RANK_SYSTEM).toContain("BAN from ranked list");
    expect(CHANGELOG_IMPACT_RANK_SYSTEM).toContain("AgentMail");
    expect(CHANGELOG_IMPACT_RANK_SYSTEM).toContain("everyday Pulse users");
    expect(CHANGELOG_IMPACT_RANK_SYSTEM).toContain("Recency bias is forbidden");
  });

  it("parses ranked themes and returns highest scores first", () => {
    const rank = parseChangelogImpactRank(
      JSON.stringify({
        ranked: [
          {
            theme: "Workspace links open the page you clicked",
            impactScore: 4,
            why: "Stops dumping you on Dashboard.",
          },
          {
            theme: "Changelog screen with approve and due flag",
            impactScore: 5,
            why: "New weekly review screen people open.",
          },
          { theme: "Keys screen registers your AI key as you type", impactScore: 4, why: "Generation starts working." },
        ],
      }),
    );
    expect(rank.ranked[0]?.impactScore).toBe(5);
    expect(topImpactThemes(rank, 2)).toEqual([
      "Changelog screen with approve and due flag",
      "Workspace links open the page you clicked",
    ]);
  });

  it("builds a week pack user prompt for the Decision Engine", () => {
    const prompt = buildChangelogImpactRankUserPrompt([
      "- 2026-11-06 Wave 5 batch 2: split 45 files under 500 lines",
      "- 2026-11-13 Do not blank the organic report when a single fetch-part fails",
    ]);
    expect(prompt).toContain("USER-FACING product IMPACT");
    expect(prompt).toContain("Wave 5");
    expect(prompt).toContain("organic report");
  });
});
