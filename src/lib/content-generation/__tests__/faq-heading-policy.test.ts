import { describe, expect, it } from "vitest";
import {
  featureIsExplicitFaqMarker,
  filterOutFaqStyleHeadingTitles,
  isFaqStyleHeadingTitle,
  FAQ_CONVERSATIONAL_RULE,
} from "@/lib/content-generation/faq-heading-policy";

describe("isFaqStyleHeadingTitle", () => {
  it("matches literal FAQ headings", () => {
    expect(isFaqStyleHeadingTitle("FAQ")).toBe(true);
    expect(isFaqStyleHeadingTitle("Frequently Asked Questions")).toBe(true);
  });

  it("matches synthesized FAQ-style titles", () => {
    expect(isFaqStyleHeadingTitle("Answering Your Questions on Window Coverings")).toBe(true);
    expect(isFaqStyleHeadingTitle("Common Questions About Blinds")).toBe(true);
    expect(isFaqStyleHeadingTitle("Your Questions Answered")).toBe(true);
    expect(isFaqStyleHeadingTitle("Q&A About Window Treatments")).toBe(true);
  });

  it("does not match normal topic H2s", () => {
    expect(isFaqStyleHeadingTitle("Motorized and Smart Options")).toBe(false);
    expect(isFaqStyleHeadingTitle("Choosing Window Covering Operating Systems")).toBe(false);
    expect(isFaqStyleHeadingTitle("Overview")).toBe(false);
  });

  it("filterOutFaqStyleHeadingTitles removes FAQ-style only", () => {
    const out = filterOutFaqStyleHeadingTitles([
      "Manual and Cordless Systems",
      "Answering Your Questions on Window Coverings",
      "FAQ",
    ]);
    expect(out).toEqual(["Manual and Cordless Systems"]);
  });
});

describe("featureIsExplicitFaqMarker", () => {
  it("matches only an [FAQ] feature marker", () => {
    expect(featureIsExplicitFaqMarker("[FAQ]: 2-column Q&A table")).toBe(true);
    expect(featureIsExplicitFaqMarker("  [faq]: questions")).toBe(true);
    expect(featureIsExplicitFaqMarker("[LIST]: common tax FAQs homeowners ask")).toBe(false);
    expect(featureIsExplicitFaqMarker("[CUSTOM]: do not add an FAQ section")).toBe(false);
  });
});

describe("FAQ_CONVERSATIONAL_RULE", () => {
  it("requires leftover article decisions and forbids promo stems", () => {
    expect(FAQ_CONVERSATIONAL_RULE).toContain("leftover buyer decisions from THIS article");
    expect(FAQ_CONVERSATIONAL_RULE).toContain("same four stems");
    expect(FAQ_CONVERSATIONAL_RULE).toContain("current promotions");
    expect(FAQ_CONVERSATIONAL_RULE).toContain("If-X-then-Y");
    expect(FAQ_CONVERSATIONAL_RULE).toContain("Do not ask a question the Answer H2 already answered");
  });
});
