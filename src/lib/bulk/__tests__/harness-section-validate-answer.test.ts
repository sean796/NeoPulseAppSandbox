import { describe, expect, it } from "vitest";
import {
  trimAnswerSectionToContract,
  assertHarnessAnswerProseComplete,
  assertStitchedHarnessArticle,
  countPlainTextSentences,
  finalizeHarnessSectionHtml,
  prepareHarnessSectionHtml,
  validateHarnessSectionOrThrow,
} from "@/lib/bulk/harness-section-validate";
import { HARNESS_ANSWER_ANCHOR_ID } from "@/lib/bulk/blog-harness-answer-agent";

describe("countPlainTextSentences", () => {
  it("counts two sentences in plain text", () => {
    expect(countPlainTextSentences("First sentence here. Second sentence ends.")).toBe(2);
  });
});

describe("Answer harness validation", () => {
  const validAnswer =
    `<h2>Answer</h2><p>Solar panels cost depends on system size. We see most Edmonton installs land in a mid five-figure range.</p>`;

  it("accepts two sentences in one paragraph", () => {
    expect(() => assertHarnessAnswerProseComplete(validAnswer)).not.toThrow();
    validateHarnessSectionOrThrow(validAnswer, {
      title: "Answer",
      isOverview: false,
      isAnswer: true,
    });
  });

  it("accepts three sentences", () => {
    const html =
      `<h2>Answer</h2><p>Solar panels cost depends on system size. Mid five-figure installs are common here. Acme Solar sizes arrays to roof span.</p>`;
    expect(() => assertHarnessAnswerProseComplete(html)).not.toThrow();
  });

  it("rejects one or four sentences", () => {
    expect(() =>
      assertHarnessAnswerProseComplete(`<h2>Answer</h2><p>Only one.</p>`),
    ).toThrow(/two or three sentences/);
    expect(() =>
      assertHarnessAnswerProseComplete(`<h2>Answer</h2><p>One. Two. Three. Four.</p>`),
    ).toThrow(/two or three sentences/);
  });

  it("rejects lists in Answer body", () => {
    const html = `<h2>Answer</h2><ul><li>No</li></ul>`;
    expect(() => assertHarnessAnswerProseComplete(html)).toThrow(/lists or tables/);
  });

  it("finalize keeps the answer paragraph and drops the Answer heading", () => {
    const out = finalizeHarnessSectionHtml(validAnswer, {
      title: "Answer",
      isOverview: false,
      isAnswer: true,
    });
    expect(out).toContain(`id="${HARNESS_ANSWER_ANCHOR_ID}"`);
    expect(out).not.toContain(">Answer<");
    expect(out).toContain("Solar panels cost depends on system size.");
  });

  it("prepareHarnessSectionHtml normalizes Answer markdown fence", () => {
    const out = prepareHarnessSectionHtml(
      "```html\n<h2>Answer</h2><p>Direct answer one. Field observation two.</p>\n```",
      { title: "Answer", isOverview: false, isAnswer: true },
    );
    expect(out).toContain(`id="${HARNESS_ANSWER_ANCHOR_ID}"`);
  });

  it("prepareHarnessSectionHtml wraps bare Answer prose in one <p>", () => {
    const out = prepareHarnessSectionHtml(
      "<h2>Answer</h2>\nArched openings need a template fit first. Custom Shades of London sizes the curve on site.",
      { title: "Answer", isOverview: false, isAnswer: true },
    );
    expect(out).toMatch(/<p\b[^>]*>[^<]*Arched openings[^<]*<\/p>/i);
    expect(() =>
      validateHarnessSectionOrThrow(out, {
        title: "Answer",
        isOverview: false,
        isAnswer: true,
      }),
    ).not.toThrow();
  });

  it("trimAnswerSectionToContract drops extra headings after Answer paragraph", () => {
    const noisy =
      `<h2>Answer</h2><p>One. Two.</p><h2>Bin Rental Tips For Home Renovations</h2><h2>Navigating</h2>`;
    const out = trimAnswerSectionToContract(noisy);
    expect(out).toBe(`<p>One. Two.</p>`);
  });
});

describe("assertStitchedHarnessArticle", () => {
  it("throws when Answer H2 is missing", () => {
    const html = `<h2 id="overview">Overview</h2><p>Lead</p><h2>Cost</h2><p>Body</p>`;
    expect(() =>
      assertStitchedHarnessArticle(html, { requireIllustrative: false }),
    ).toThrow(/Answer section missing/);
  });

  it("throws when illustrative scenario is missing", () => {
    const html = `<h2 id="answer">Answer</h2><p>One. Two.</p><h2 id="overview">Overview</h2><p>Lead</p>`;
    expect(() =>
      assertStitchedHarnessArticle(html, { requireIllustrative: true }),
    ).toThrow(/ILLUSTRATIVE/);
  });
});
