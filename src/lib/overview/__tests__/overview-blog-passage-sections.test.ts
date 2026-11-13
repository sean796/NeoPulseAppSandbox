import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  allocateUniquePassageAnchorId,
  rewriteBlogPassageSection,
  splitHtmlBodyIntoH2PassageSections,
  stitchHtmlBodyFromH2PassageSections,
} from "@/lib/overview/overview-blog-passage-sections";

vi.mock("@/lib/openrouter-agent-category-api", () => ({
  callAgentCategoryOpenRouterChat: vi.fn(),
}));

import { callAgentCategoryOpenRouterChat } from "@/lib/openrouter-agent-category-api";

beforeEach(() => {
  vi.mocked(callAgentCategoryOpenRouterChat).mockReset();
});

const section = {
  id: "passage-h2-0",
  index: 0,
  h2OpenTag: "<h2>",
  title: "Legacy Heading",
  bodyHtml: "<p>Legacy body copy about the section topic.</p>",
};

describe("unique H2 passage anchor ids", () => {
  it("allocates -2/-3 suffixes when the same slug is already used", () => {
    const used = new Set<string>();
    const title = "Matching Window Treatments to London Architecture and Climate";
    expect(allocateUniquePassageAnchorId(title, used)).toBe(
      "matching-window-treatments-to-london-architecture-and-climate",
    );
    expect(allocateUniquePassageAnchorId(title, used)).toBe(
      "matching-window-treatments-to-london-architecture-and-climate-2",
    );
    expect(allocateUniquePassageAnchorId(title, used)).toBe(
      "matching-window-treatments-to-london-architecture-and-climate-3",
    );
  });

  it("uniquifies duplicate title-derived ids when parsing and stitching", () => {
    const html = [
      '<h2 id="matching-window-treatments-to-london-architecture-and-climate">Matching Window Treatments to London Architecture and Climate</h2>',
      "<p>First passage.</p>",
      '<h2 id="matching-window-treatments-to-london-architecture-and-climate">Matching Window Treatments to London Architecture and Climate</h2>',
      "<p>Second passage.</p>",
    ].join("\n");
    const parsed = splitHtmlBodyIntoH2PassageSections(html);
    expect(parsed.sections.map((s) => s.id)).toEqual([
      "matching-window-treatments-to-london-architecture-and-climate",
      "matching-window-treatments-to-london-architecture-and-climate-2",
    ]);
    const stitched = stitchHtmlBodyFromH2PassageSections(parsed);
    expect(stitched).toContain(
      'id="matching-window-treatments-to-london-architecture-and-climate"',
    );
    expect(stitched).toContain(
      'id="matching-window-treatments-to-london-architecture-and-climate-2"',
    );
  });
});

describe("rewriteBlogPassageSection malformed model output", () => {
  it("rejects invalid JSON with the passage section label", async () => {
    vi.mocked(callAgentCategoryOpenRouterChat).mockResolvedValue({
      raw: null,
      content: "not json at all",
    });

    await expect(
      rewriteBlogPassageSection({
        mode: "header",
        section,
        siblingTitles: [],
        articleTitle: "Article Title",
        focusKeyword: "focus keyword",
      }),
    ).rejects.toThrow(/Invalid passage section JSON:/);
  });

  it("rejects valid JSON with the wrong shape with the passage section label", async () => {
    vi.mocked(callAgentCategoryOpenRouterChat).mockResolvedValue({
      raw: null,
      content: JSON.stringify({ title: 42 }),
    });

    await expect(
      rewriteBlogPassageSection({
        mode: "header",
        section,
        siblingTitles: [],
        articleTitle: "Article Title",
        focusKeyword: "focus keyword",
      }),
    ).rejects.toThrow(/Invalid passage section JSON:/);
  });
});
