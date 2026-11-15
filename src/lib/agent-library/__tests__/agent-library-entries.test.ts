import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/openrouter-agent-category-api", () => ({
  resolveModelForAgentCategory: () => "deepseek/deepseek-v4.1-flash",
}));

import {
  ASSIGNABLE_SITE_AGENTS,
  buildSkillsLibraryEntries,
  buildUnifiedAgentLibraryEntries,
} from "@/lib/agent-library/agent-library-api";

describe("agent library entries", () => {
  it("gives the App Changelog Writer an Open path to the Changelog screen", () => {
    const entries = buildUnifiedAgentLibraryEntries([], {});
    const changelog = entries.find((e) => e.id === "reporting.changelog.app-update-log");
    expect(changelog).toBeDefined();
    expect(changelog?.appPath).toBe("/changelog");
    expect(changelog?.category).toBe("research");
    expect(changelog?.origin).toBe("pulse-mastra");
  });

  it("keeps Semrush Safe Fix out of the agent library and in the skills library", () => {
    const agents = buildUnifiedAgentLibraryEntries([], {});
    const skills = buildSkillsLibraryEntries([], {});
    expect(agents.some((e) => e.id === "reporting.semrush.safe-fix")).toBe(false);
    const safeFix = skills.find((e) => e.id === "reporting.semrush.safe-fix");
    expect(safeFix).toBeDefined();
    expect(safeFix?.appPath).toBeUndefined();
  });

  it("keeps Posts Content Gap Check out of the agent library and in the skills library", () => {
    const agents = buildUnifiedAgentLibraryEntries([], {});
    const skills = buildSkillsLibraryEntries([], {});
    expect(agents.some((e) => e.id === "content.posts.gap-check")).toBe(false);
    const gap = skills.find((e) => e.id === "content.posts.gap-check");
    expect(gap).toBeDefined();
    expect(gap?.label).toBe("Posts Content Gap Check");
    expect(gap?.appPath).toBeUndefined();
  });

  it("lists Semrush Safe Fix as an assignable site agent", () => {
    expect(ASSIGNABLE_SITE_AGENTS.some((a) => a.id === "reporting.semrush.safe-fix")).toBe(true);
  });

  it("lists Posts Content Gap Check as an assignable site agent", () => {
    expect(ASSIGNABLE_SITE_AGENTS.some((a) => a.id === "content.posts.gap-check")).toBe(true);
  });

  it("leaves plain agents without an Open path", () => {
    const entries = buildUnifiedAgentLibraryEntries([], {});
    const withPath = new Set(["reporting.changelog.app-update-log"]);
    const withoutPath = entries.filter((e) => !withPath.has(e.id));
    expect(withoutPath.length).toBeGreaterThan(40);
    expect(withoutPath.every((e) => e.appPath === undefined)).toBe(true);
  });
});
