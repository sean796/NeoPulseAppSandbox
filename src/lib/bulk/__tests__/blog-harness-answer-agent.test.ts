import { describe, expect, it } from "vitest";
import {
  BLOG_HARNESS_ANSWER_AGENT_ID,
  BLOG_HARNESS_ANSWER_TITLE,
  HARNESS_ANSWER_ANCHOR_ID,
  buildBlogHarnessAnswerAgent,
  isBlogHarnessAnswerAgent,
} from "@/lib/bulk/blog-harness-answer-agent";
import { generateSingleSectionPrompt } from "@/lib/prompt-builders/core";

describe("buildBlogHarnessAnswerAgent", () => {
  it("returns stable direct-answer agent config", () => {
    const agent = buildBlogHarnessAnswerAgent();
    expect(agent.id).toBe(BLOG_HARNESS_ANSWER_AGENT_ID);
    expect(agent.title).toBe(BLOG_HARNESS_ANSWER_TITLE);
    expect(HARNESS_ANSWER_ANCHOR_ID).toBe("answer");
  });

  it("detects duplicate Answer agents by id or title", () => {
    expect(isBlogHarnessAnswerAgent({ id: BLOG_HARNESS_ANSWER_AGENT_ID, title: "x" })).toBe(true);
    expect(isBlogHarnessAnswerAgent({ id: "other", title: "Answer" })).toBe(true);
    expect(isBlogHarnessAnswerAgent({ id: "other", title: "Cost Factors" })).toBe(false);
  });

  it("Answer section prompt is stat-first in one paragraph", () => {
    const prompt = generateSingleSectionPrompt(buildBlogHarnessAnswerAgent(), "html");
    expect(prompt).toContain('<p id="answer">');
    expect(prompt).not.toContain("<h2>Answer</h2>");
    expect(prompt).toContain("two or three sentences");
    expect(prompt).toContain("STAT/FACT FIRST");
    expect(prompt).toContain("numeric anchor with units and explicit CAD or USD");
    expect(prompt).toContain("installer-only concrete detail");
    expect(prompt).toContain("CONNECTED SITE IDENTITY lists a business name");
    expect(prompt).toContain("somewhere in the Answer paragraph");
    expect(prompt).toContain("Do not skip the name");
    expect(prompt).not.toContain("include the keyword naturally");
  });
});
