import { describe, expect, it } from "vitest";
import {
  buildFactCheckerLatestYearBlock,
  buildProductFactCheckerSystemPrompt,
  getFactCheckerLatestYear,
  getFactCheckerRulesBody,
  getFactCheckerSkillBody,
  stripSkillFrontmatter,
} from "../load-fact-checker-skill-prompt";

describe("stripSkillFrontmatter", () => {
  it("removes YAML frontmatter", () => {
    const out = stripSkillFrontmatter("---\nname: x\n---\n\n# Body\n");
    expect(out.startsWith("# Body")).toBe(true);
    expect(out).not.toContain("name: x");
  });
});

describe("getFactCheckerLatestYear", () => {
  it("returns the calendar year", () => {
    expect(getFactCheckerLatestYear(new Date("2026-11-17T12:00:00Z"))).toBe(2026);
  });
});

describe("buildProductFactCheckerSystemPrompt", () => {
  it("loads the live skill and rules into the system prompt", () => {
    const skill = getFactCheckerSkillBody();
    const rules = getFactCheckerRulesBody();
    expect(skill).toContain("Fact Checker");
    expect(rules).toContain("Source priority");
    expect(rules).toContain("Competitive-neutral");
    expect(rules).toContain("LATEST_YEAR");
    expect(rules).toContain("In-article post check");
    expect(rules).toContain("exactly once");

    const year = getFactCheckerLatestYear();
    const system = buildProductFactCheckerSystemPrompt();
    expect(system).toContain(skill.slice(0, 40));
    expect(system).toContain("Competitive-neutral");
    expect(system).toContain("IN-ARTICLE MODE");
    expect(system).toContain("exactly once");
    expect(system).toContain("Do not fail the post because a sentence was repeated");
    expect(system).toContain("qualification string must appear verbatim inside replacement");
    expect(system).toContain("Never stop the post");
    expect(system).toContain("unhandledQuotes");
    expect(system).toContain(buildFactCheckerLatestYearBlock(year));
    expect(system).toContain(`LATEST_YEAR=${year}`);
    expect(system.trimEnd().endsWith("Prefer current-year primary sources.")).toBe(true);
    expect(system).not.toMatch(/^---\s*\nname:/);
  });
});
