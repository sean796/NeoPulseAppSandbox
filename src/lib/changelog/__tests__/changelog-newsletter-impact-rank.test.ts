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
    expect(CHANGELOG_IMPACT_RANK_SYSTEM).toContain("MAJOR WEEKLY FEATURES");
    expect(CHANGELOG_IMPACT_RANK_SYSTEM).toContain("Hard BAN from ranked list");
    expect(CHANGELOG_IMPACT_RANK_SYSTEM).toContain("AgentMail");
    expect(CHANGELOG_IMPACT_RANK_SYSTEM).toContain("API Keys");
    expect(CHANGELOG_IMPACT_RANK_SYSTEM).toContain("Recency bias is forbidden");
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
            theme: "Changelog screen with approve and due flag",
            impactScore: 5,
            why: "New weekly review screen people open.",
          },
          { theme: "Keys screen registers your AI key as you type", impactScore: 5, why: "Generation starts working." },
          {
            theme: "Integrations add-client dock",
            impactScore: 5,
            why: "Add clients from the properties list.",
          },
          {
            theme: "Google Business and Organic Website Leads in Integrations",
            impactScore: 4,
            why: "Leads live on the property.",
          },
        ],
      }),
    );
    expect(rank.ranked[0]?.impactScore).toBe(5);
    expect(topImpactThemes(rank, 3)).toEqual([
      "Changelog screen with approve and due flag",
      "Integrations add-client dock",
      "Google Business and Organic Website Leads in Integrations",
    ]);
  });

  it("builds a week pack user prompt for the Decision Engine", () => {
    const prompt = buildChangelogImpactRankUserPrompt([
      "- 2026-11-06 Wave 5 batch 2: split 45 files under 500 lines",
      "- 2026-11-13 Do not blank the organic report when a single fetch-part fails",
    ]);
    expect(prompt).toContain("major weekly FEATURES");
    expect(prompt).toContain("Wave 5");
    expect(prompt).toContain("organic report");
  });
});
