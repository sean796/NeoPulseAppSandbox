import { describe, expect, it } from "vitest";
import {
  HARNESS_OVERVIEW_ANCHOR_ID,
} from "@/lib/bulk/harness-section-anchor-ids";
import {
  findH2OpenPositions,
  injectBodyH2AnchorIds,
  injectHarnessH2AnchorIdsForStitchedBlog,
  outlineFromBodyH2Titles,
  stitchOverviewOntoBody,
  stripLeadingAnswerSection,
  stripLeadingOverviewSection,
  enforceHarnessAnswerBeforeOverview,
} from "@/lib/overview/overview-blog-overview-prepend";
import { buildHarnessSectionAnchorMap } from "@/lib/bulk/harness-section-anchor-ids";
import { HARNESS_ANSWER_ANCHOR_ID } from "@/lib/bulk/blog-harness-answer-agent";
import { FLO_OVERVIEW_CLASS } from "@/lib/overview/wrap-overview-section-html";

describe("stripLeadingAnswerSection", () => {
  it("removes Answer H2 through the next H2", () => {
    const html = [
      `<h2 id="answer">Answer</h2>`,
      `<p>Direct one. Direct two.</p>`,
      `<h2 id="overview">Overview</h2>`,
      `<p>Lead</p>`,
      `<h2>Cost Factors</h2>`,
      `<p>Body</p>`,
    ].join("");
    const out = stripLeadingAnswerSection(html);
    expect(out.toLowerCase()).not.toContain(">answer<");
    expect(out).toContain("Overview");
    expect(out).toContain("Cost Factors");
  });
});

describe("injectHarnessH2AnchorIdsForStitchedBlog", () => {
  it("drops the Answer heading and assigns overview, then body anchor ids", () => {
    const html = [
      `<h2>Answer</h2><p>a. b.</p>`,
      `<h2>Overview</h2><p>Lead</p>`,
      `<h2>Cost Factors</h2><p>Body</p>`,
    ].join("");
    const map = buildHarnessSectionAnchorMap(outlineFromBodyH2Titles(["Cost Factors"]));
    const out = injectHarnessH2AnchorIdsForStitchedBlog(html, map);
    expect(out).not.toContain(">Answer<");
    expect(out).toContain(`<p id="${HARNESS_ANSWER_ANCHOR_ID}">a. b.</p>`);
    expect(out).toContain(`id="${HARNESS_OVERVIEW_ANCHOR_ID}"`);
    expect(out).toContain(`id="cost-factors"`);
  });

  it("supports legacy Overview-first posts without Answer", () => {
    const html = `<h2>Overview</h2><p>Lead</p><h2>Cost Factors</h2><p>Body</p>`;
    const map = buildHarnessSectionAnchorMap(outlineFromBodyH2Titles(["Cost Factors"]));
    const out = injectHarnessH2AnchorIdsForStitchedBlog(html, map);
    expect(out).toContain(`id="${HARNESS_OVERVIEW_ANCHOR_ID}"`);
    expect(out).toContain(`id="cost-factors"`);
    expect(out.toLowerCase()).not.toContain(`id="${HARNESS_ANSWER_ANCHOR_ID}"`);
  });
});

describe("stripLeadingOverviewSection", () => {
  it("removes Overview H2 through the next H2", () => {
    const html = [
      `<h2 id="overview">Overview</h2>`,
      `<p>Lead</p>`,
      `<ul><li><strong>A</strong>, one</li></ul>`,
      `<h2>Cost Factors</h2>`,
      `<p>Body</p>`,
    ].join("");
    const out = stripLeadingOverviewSection(html);
    expect(out.toLowerCase()).not.toContain(">overview<");
    expect(out).toContain("Cost Factors");
    expect(out).toContain("Body");
  });

  it("removes Overview by title without id", () => {
    const html = `<h2>Overview</h2><p>x</p><h2>Next</h2><p>y</p>`;
    const out = stripLeadingOverviewSection(html);
    expect(out).toBe(`<h2>Next</h2><p>y</p>`);
  });

  it("removes every Overview section including H3 AIO", () => {
    const html = [
      `<h2 id="overview">Overview</h2><p>new</p><ul><li><strong>A</strong>, one</li></ul>`,
      `<h3>Overview</h3><p>old aio</p>`,
      `<h2>Unlock Shine</h2><p>body</p>`,
    ].join("");
    const out = stripLeadingOverviewSection(html);
    expect(out.toLowerCase()).not.toContain("overview");
    expect(out).not.toContain("old aio");
    expect(out).toContain("Unlock Shine");
    expect(out).toContain("body");
  });

  it("removes flo-overview wrapper with no residue", () => {
    const html = [
      `<div class="${FLO_OVERVIEW_CLASS}">`,
      `<h2 id="overview">Overview</h2>`,
      `<p>Lead</p>`,
      `<ul><li><strong>A</strong>: one</li></ul>`,
      `</div>`,
      `<h2>Cost Factors</h2>`,
      `<p>Body</p>`,
    ].join("");
    const out = stripLeadingOverviewSection(html);
    expect(out.toLowerCase()).not.toContain("flo-overview");
    expect(out.toLowerCase()).not.toContain(">overview<");
    expect(out).toBe(`<h2>Cost Factors</h2><p>Body</p>`);
  });

  it("dedupeStackedOverviewSections keeps first Overview only", async () => {
    const { dedupeStackedOverviewSections } = await import(
      "@/lib/overview/overview-blog-overview-prepend"
    );
    const html = [
      `<h2 id="overview">Overview</h2><p>NEW</p><ul><li><strong>A</strong>, one</li></ul>`,
      `<h2>Overview</h2><p>OLD</p>`,
      `<h2>Unlock Shine</h2><p>body</p>`,
    ].join("");
    const out = dedupeStackedOverviewSections(html);
    expect(out).toContain("NEW");
    expect(out).not.toContain("OLD");
    expect(out).toContain("Unlock Shine");
    const overviewCount = out.toLowerCase().split(">overview<").length - 1;
    expect(overviewCount).toBe(1);
  });

  it("dedupeStackedOverviewSections keeps wrapped Overview", async () => {
    const { dedupeStackedOverviewSections } = await import(
      "@/lib/overview/overview-blog-overview-prepend"
    );
    const html = [
      `<div class="${FLO_OVERVIEW_CLASS}">`,
      `<h2 id="overview">Overview</h2><p>NEW</p><ul><li><strong>A</strong>: one</li></ul>`,
      `</div>`,
      `<h2>Overview</h2><p>OLD</p>`,
      `<h2>Unlock Shine</h2><p>body</p>`,
    ].join("");
    const out = dedupeStackedOverviewSections(html);
    expect(out).toContain(`class="${FLO_OVERVIEW_CLASS}"`);
    expect(out).toContain("NEW");
    expect(out).not.toContain("OLD");
    expect(out).toContain("Unlock Shine");
    const overviewCount = out.toLowerCase().split(">overview<").length - 1;
    expect(overviewCount).toBe(1);
  });

  it("dedupeStackedOverviewSections keeps Answer first when Overview is restitched", async () => {
    const { dedupeStackedOverviewSections } = await import(
      "@/lib/overview/overview-blog-overview-prepend"
    );
    const html = [
      `<h2 id="${HARNESS_ANSWER_ANCHOR_ID}">Answer</h2><p>Direct answer here.</p>`,
      `<div class="${FLO_OVERVIEW_CLASS}">`,
      `<h2 id="overview">Overview</h2><p>NEW</p><ul><li><strong>A</strong>: one</li></ul>`,
      `</div>`,
      `<h2>Overview</h2><p>OLD</p>`,
      `<h2>Cost Factors</h2><p>body</p>`,
    ].join("");
    const out = dedupeStackedOverviewSections(html);
    const answerPos = out.indexOf(`id="${HARNESS_ANSWER_ANCHOR_ID}"`);
    const overviewPos = out.indexOf(`id="${HARNESS_OVERVIEW_ANCHOR_ID}"`);
    expect(answerPos).toBeGreaterThanOrEqual(0);
    expect(overviewPos).toBeGreaterThan(answerPos);
    expect(out).toContain("Direct answer here");
    expect(out).toContain("NEW");
    expect(out).not.toContain("OLD");
    expect(out).toContain("Cost Factors");
  });
});

describe("extractOverviewSectionHtml", () => {
  it("returns flo-overview wrapper when present", async () => {
    const { extractOverviewSectionHtml } = await import(
      "@/lib/overview/overview-blog-overview-prepend"
    );
    const html = [
      `<div class="${FLO_OVERVIEW_CLASS}">`,
      `<h2 id="overview">Overview</h2><p>Lead</p>`,
      `</div>`,
      `<h2>Next</h2><p>Body</p>`,
    ].join("");
    const out = extractOverviewSectionHtml(html);
    expect(out.startsWith(`<div class="${FLO_OVERVIEW_CLASS}">`)).toBe(true);
    expect(out).toContain("Lead");
    expect(out).not.toContain("Next");
    expect(out.endsWith("</div>")).toBe(true);
  });
});

describe("enforceHarnessAnswerBeforeOverview", () => {
  it("re-stitches when Overview precedes Answer", () => {
    const reversed = `<div class="flo-overview"><h2 id="overview">Overview</h2><p>Lead</p><ul><li><strong>A</strong>: one</li></ul></div><h2 id="answer">Answer</h2><p>Direct answer here.</p><h2>Cost Factors</h2><p>Body</p>`;
    const fixed = enforceHarnessAnswerBeforeOverview(reversed);
    const answerPos = fixed.indexOf('id="answer"');
    const overviewPos = fixed.indexOf('id="overview"');
    expect(answerPos).toBeGreaterThanOrEqual(0);
    expect(overviewPos).toBeGreaterThan(answerPos);
    expect(fixed).toContain("Cost Factors");
  });

  it("is a no-op when Answer already precedes Overview", () => {
    const correct = `<h2 id="answer">Answer</h2><p>Direct answer here.</p><div class="flo-overview"><h2 id="overview">Overview</h2><p>Lead</p></div><h2>Cost Factors</h2><p>Body</p>`;
    expect(enforceHarnessAnswerBeforeOverview(correct)).toBe(correct);
  });
});

describe("stitchOverviewOntoBody", () => {
  it("prepends Answer before wrapped Overview when answerHtml is provided", () => {
    const result = stitchOverviewOntoBody({
      sourceHtml: `<h2>Cost Factors</h2><p>Body</p>`,
      answerHtml: `<h2>Answer</h2><p>One. Two.</p>`,
      overviewHtml: `<h2>Overview</h2><p>Lead</p><ul><li><strong>A</strong>: one</li></ul>`,
    });
    const answerPos = result.html.indexOf(`id="${HARNESS_ANSWER_ANCHOR_ID}"`);
    const overviewPos = result.html.indexOf(`id="${HARNESS_OVERVIEW_ANCHOR_ID}"`);
    expect(answerPos).toBeGreaterThanOrEqual(0);
    expect(overviewPos).toBeGreaterThan(answerPos);
    expect(result.html).not.toContain(">Answer<");
    expect(result.html).toContain("One. Two.");
    expect(result.html).toContain("Cost Factors");
  });

  it("wraps Overview in flo-overview", () => {
    const result = stitchOverviewOntoBody({
      sourceHtml: `<h2>Cost Factors</h2><p>Body</p>`,
      overviewHtml: `<h2>Overview</h2><p>Lead</p><ul><li><strong>A</strong>: one</li></ul>`,
    });
    expect(result.html.startsWith(`<div class="${FLO_OVERVIEW_CLASS}">`)).toBe(true);
    expect(result.html).toContain(`id="${HARNESS_OVERVIEW_ANCHOR_ID}"`);
    expect(result.html).toContain("Cost Factors");
  });

  it("prepends Overview with overview id and injects body ids", () => {
    const body = `<h2>Cost Factors</h2><p>a</p><h2>Tax Rebates</h2><p>b</p>`;
    const overview = `<h2>Overview</h2><p>Answer</p><ul><li><strong>Cost</strong>, <a href="#cost-factors">cost factors</a>.</li></ul>`;
    const first = stitchOverviewOntoBody({ sourceHtml: body, overviewHtml: overview });
    expect(first.html.startsWith(`<div class="${FLO_OVERVIEW_CLASS}">`)).toBe(true);
    expect(first.html).toContain(`<h2 id="${HARNESS_OVERVIEW_ANCHOR_ID}">`);
    expect(first.html).toContain(`id="cost-factors"`);
    expect(first.html).toContain(`id="tax-rebates"`);
    expect(first.bodyH2Titles).toEqual(["Cost Factors", "Tax Rebates"]);

    const second = stitchOverviewOntoBody({
      sourceHtml: first.html,
      overviewHtml: `<h2>Overview</h2><p>Replaced</p><ul><li><strong>Cost</strong>, again.</li></ul>`,
    });
    const overviewCount = second.html.toLowerCase().split(">overview<").length - 1;
    expect(overviewCount).toBe(1);
    expect(second.html).toContain("Replaced");
    expect(second.html).not.toContain("Answer");
    expect(second.html.toLowerCase().split("flo-overview").length - 1).toBe(1);
  });
});

describe("looksLikeBlockedHostHtml", () => {
  it("flags Cloudflare Attention Required pages", async () => {
    const { looksLikeBlockedHostHtml } = await import(
      "@/lib/overview/overview-blog-overview-prepend"
    );
    expect(
      looksLikeBlockedHostHtml(
        `<!DOCTYPE html><html><title>Attention Required! | Cloudflare</title><body>cloudflare</body></html>`,
      ),
    ).toBe(true);
    expect(looksLikeBlockedHostHtml(`<h2>Cost</h2><p>ok</p>`)).toBe(false);
  });
});

describe("injectBodyH2AnchorIds", () => {
  it("sets id on each body H2 from the anchor map", () => {
    const html = `<h2>Cost Factors</h2><p>a</p><h2>Tax Rebates</h2><p>b</p>`;
    const map = buildHarnessSectionAnchorMap(outlineFromBodyH2Titles(["Cost Factors", "Tax Rebates"]));
    const out = injectBodyH2AnchorIds(html, map);
    expect(out).toContain(`id="cost-factors"`);
    expect(out).toContain(`id="tax-rebates"`);
    expect(findH2OpenPositions(out)).toHaveLength(2);
  });
});
