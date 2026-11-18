import { describe, expect, it } from "vitest";
import {
  buildResearchAndFactCheckingHtml,
  collectExternalSourceUrlsFromHtml,
  insertResearchAndFactCheckingDisclosure,
  RESEARCH_DISCLOSURE_ANCHOR_ID,
  stripResearchDisclosureSection,
} from "../overview-research-disclosure";

describe("overview-research-disclosure", () => {
  it("builds disclosure with research-and-fact-checking anchor", () => {
    const html = buildResearchAndFactCheckingHtml({
      topic: "energy efficient window coverings",
      author: "Blind Magic",
      reviewedLabel: "March 2026",
      sourceUrls: ["https://energy.gov/example"],
    });
    expect(html).toContain(`id="${RESEARCH_DISCLOSURE_ANCHOR_ID}"`);
    expect(html).toContain("Research &amp; Fact-Checking");
    expect(html).toContain("energy efficient window coverings");
    expect(html).toContain("https://energy.gov/example");
    expect(html).toContain("Blind Magic");
  });

  it("inserts disclosure immediately before FAQ", () => {
    const src = [
      "<p>Intro</p>",
      "<h2 id=\"thermal\">Thermal</h2>",
      "<p>Body</p>",
      '<h2 id="faq">FAQ</h2>',
      "<p>Q</p>",
    ].join("\n");
    const out = insertResearchAndFactCheckingDisclosure({
      html: src,
      topic: "window coverings",
      author: "Blind Magic",
      reviewedLabel: "March 2026",
      sourceUrls: ["https://example.com/source"],
      clientSiteUrl: "https://blindmagic.com",
    });
    const disclosureAt = out.indexOf(`id="${RESEARCH_DISCLOSURE_ANCHOR_ID}"`);
    const faqAt = out.indexOf('id="faq"');
    expect(disclosureAt).toBeGreaterThan(-1);
    expect(faqAt).toBeGreaterThan(disclosureAt);
  });

  it("replaces an existing disclosure block", () => {
    const src = [
      "<p>Intro</p>",
      `<h2 id="${RESEARCH_DISCLOSURE_ANCHOR_ID}">Research &amp; Fact-Checking</h2>`,
      "<p>Old disclosure</p>",
      '<h2 id="faq">FAQ</h2>',
      "<p>Q</p>",
    ].join("\n");
    const out = insertResearchAndFactCheckingDisclosure({
      html: src,
      topic: "blinds",
      author: "Blind Magic",
      reviewedLabel: "March 2026",
      sourceUrls: [],
    });
    expect(out.match(/research-and-fact-checking/g)?.length).toBe(1);
    expect(out).not.toContain("Old disclosure");
  });

  it("strips disclosure and skips client-host sources", () => {
    const html = [
      '<p><a href="https://blindmagic.com/blog/x">internal</a></p>',
      '<p><a href="https://energy.gov/guide">ext</a></p>',
      `<h2 id="${RESEARCH_DISCLOSURE_ANCHOR_ID}">Research &amp; Fact-Checking</h2>`,
      "<p>Old</p>",
    ].join("\n");
    const stripped = stripResearchDisclosureSection(html);
    expect(stripped).not.toContain(RESEARCH_DISCLOSURE_ANCHOR_ID);
    expect(stripped).not.toContain("Old");
    const urls = collectExternalSourceUrlsFromHtml(stripped, "https://blindmagic.com");
    expect(urls).toEqual(["https://energy.gov/guide"]);
  });
});
