import { describe, expect, it } from "vitest";
import {
  HUMANIZER_MANDATORY_TAG,
  GLOBAL_HUMANIZER_PROMPT_BLOCK,
  HUMANIZER_USER_PROMPT_REMINDER,
  buildHumanizerDownloadText,
  buildHumanizerRagBlock,
  ensureHumanizerOnSystemPrompt,
  prependHumanizerRagToUserPrompt,
} from "@/lib/content-humanizer";
import {
  appendUniversalContentRulesToSystemPrompt,
  buildBlacklistRagBlock,
  injectBlacklistRagIntoMessages,
  prependBlacklistRagToUserPrompt,
} from "@/lib/content-word-blocklist";

describe("GLOBAL_HUMANIZER_PROMPT_BLOCK", () => {
  it("covers all 26 patterns and embedded-mode rules", () => {
    expect(GLOBAL_HUMANIZER_PROMPT_BLOCK).toMatch(/HUMANIZER \(mandatory/i);
    expect(GLOBAL_HUMANIZER_PROMPT_BLOCK).not.toMatch(/\u2014/);
    expect(GLOBAL_HUMANIZER_PROMPT_BLOCK).toMatch(/Embedded mode/i);
    expect(GLOBAL_HUMANIZER_PROMPT_BLOCK).toMatch(/Do not invent facts/i);
    for (let n = 1; n <= 26; n++) {
      expect(GLOBAL_HUMANIZER_PROMPT_BLOCK).toMatch(new RegExp(`(?:^|\\n)${n}\\. `));
    }
  });

  it("download text matches the mandatory tag + prompt block", () => {
    const download = buildHumanizerDownloadText();
    expect(download).toBe(`${HUMANIZER_MANDATORY_TAG}\n${GLOBAL_HUMANIZER_PROMPT_BLOCK}`);
  });
});

describe("ensureHumanizerOnSystemPrompt", () => {
  it("prepends once and is idempotent", () => {
    const once = ensureHumanizerOnSystemPrompt("You write blogs.");
    expect(once).toMatch(/HUMANIZER \(mandatory/i);
    expect(once).toMatch(/\[HUMANIZER - MANDATORY GLOBAL\]/);
    expect(once.match(/HUMANIZER \(mandatory/g)?.length).toBe(1);
    const twice = ensureHumanizerOnSystemPrompt(once);
    expect(twice).toBe(once);
  });

  it("inserts after word blacklist obey line when blacklist leads", () => {
    const withBlacklist = appendUniversalContentRulesToSystemPrompt("You write blogs.");
    expect(withBlacklist.indexOf("WORD BLACKLIST (mandatory")).toBeLessThan(
      withBlacklist.indexOf("HUMANIZER (mandatory"),
    );
    expect(withBlacklist.match(/HUMANIZER \(mandatory/g)?.length).toBe(1);
    expect(withBlacklist.match(/WORD BLACKLIST \(mandatory/g)?.length).toBe(1);
  });
});

describe("Humanizer RAG with blacklist", () => {
  it("buildBlacklistRagBlock includes Humanizer after blacklist", () => {
    const block = buildBlacklistRagBlock();
    expect(block.startsWith("=== WORD BLACKLIST (READ ONLY")).toBe(true);
    expect(block).toMatch(/=== HUMANIZER \(READ ONLY/);
    expect(block).toMatch(/=== END HUMANIZER ===/);
    expect(block.indexOf("WORD BLACKLIST")).toBeLessThan(block.indexOf("HUMANIZER (mandatory"));
  });

  it("prependBlacklistRagToUserPrompt is idempotent for both blocks", () => {
    const once = prependBlacklistRagToUserPrompt("Write the section.");
    const twice = prependBlacklistRagToUserPrompt(once);
    expect(twice).toBe(once);
    expect(once.match(/=== HUMANIZER \(READ ONLY/g)?.length).toBe(1);
    expect(once.match(/=== WORD BLACKLIST \(READ ONLY/g)?.length).toBe(1);
  });

  it("injectBlacklistRagIntoMessages adds Humanizer to the first user message", () => {
    const messages = injectBlacklistRagIntoMessages([
      { role: "system", content: "sys" },
      { role: "user", content: "body" },
    ]);
    expect(messages[1].content).toMatch(/HUMANIZER \(mandatory/i);
    expect(messages[1].content).toMatch(/WORD BLACKLIST \(mandatory/i);
  });

  it("prependHumanizerRagToUserPrompt alone is idempotent", () => {
    const block = buildHumanizerRagBlock();
    expect(block).toMatch(/=== HUMANIZER \(READ ONLY/);
    const once = prependHumanizerRagToUserPrompt("x");
    const twice = prependHumanizerRagToUserPrompt(once);
    expect(twice).toBe(once);
  });

  it("exports a non-empty user reminder", () => {
    expect(HUMANIZER_USER_PROMPT_REMINDER).toMatch(/HUMANIZER - NON-NEGOTIABLE/);
  });
});
