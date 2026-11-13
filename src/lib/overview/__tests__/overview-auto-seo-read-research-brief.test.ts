import { describe, expect, it } from "vitest";
import { formatAutoSeoResearchReadingDigest } from "@/lib/overview/overview-auto-seo-read-research-brief";

describe("formatAutoSeoResearchReadingDigest", () => {
  it("formats research-model reading into mandatory grounding text", () => {
    const text = formatAutoSeoResearchReadingDigest({
      searcherIntent: "Compare faux wood vs real wood blinds",
      mustUseFacts: ["Faux wood resists humidity", "Real wood can warp"],
      contentAngles: ["Home durability", "Cost tradeoffs"],
      entitiesProducts: ["Faux wood blinds"],
      avoidClaims: ["Guaranteed lifetime"],
      groundingMemo: "Lead with humidity resistance for coastal homes.",
    });
    expect(text).toContain("RESEARCH BRIEF READING");
    expect(text).toContain("Compare faux wood vs real wood blinds");
    expect(text).toContain("Faux wood resists humidity");
    expect(text).toContain("Lead with humidity resistance for coastal homes.");
  });
});
