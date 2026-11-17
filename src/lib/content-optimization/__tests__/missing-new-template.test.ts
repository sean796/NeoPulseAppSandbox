import { describe, expect, it } from "vitest";
import {
  auditUrlsMissingNewTemplate,
  htmlHasNewTemplateAnswerH2,
  isMissingNewTemplateFilter,
  missingTemplateAuditToCsv,
} from "@/lib/content-optimization/missing-new-template";

describe("missing-new-template", () => {
  it("detects the Answer chrome H2", () => {
    expect(htmlHasNewTemplateAnswerH2("<h2>Answer</h2><p>Fact.</p>")).toBe(true);
    expect(htmlHasNewTemplateAnswerH2('<h2 class="wp">Answer</h2>')).toBe(true);
  });

  it("keeps Overview-only and We Care About pages as missing", () => {
    expect(
      htmlHasNewTemplateAnswerH2(
        "<h2>Overview</h2><h2>What We Offer</h2><h2>We Care About Oakmont, St. Albert, AB</h2>",
      ),
    ).toBe(false);
    expect(htmlHasNewTemplateAnswerH2("<h2>Your Guide to Lightlock Shades</h2>")).toBe(false);
  });

  it("splits a URL list into missing vs already new", () => {
    const html: Record<string, string> = {
      "https://a.test/new/": "<h2>Answer</h2><h2>Overview</h2>",
      "https://a.test/old/": "<h2>Overview</h2><h2>We Care About Town</h2>",
    };
    const audit = auditUrlsMissingNewTemplate(Object.keys(html), (url) => html[url] ?? "");
    expect(audit.scanned).toBe(2);
    expect(audit.missing).toEqual(["https://a.test/new/"]);
    expect(audit.alreadyNew).toEqual(["https://a.test/old/"]);
    expect(audit.h2sByUrl["https://a.test/old/"]).toEqual(["Overview", "We Care About Town"]);
    expect(audit.h2sByUrl["https://a.test/new/"]).toEqual(["Answer", "Overview"]);
  });

  it("recognizes only the missing_new_template filter", () => {
    expect(isMissingNewTemplateFilter("missing_new_template")).toBe(true);
    expect(isMissingNewTemplateFilter("all")).toBe(false);
  });

  it("writes url and H2", () => {
    const csv = missingTemplateAuditToCsv({
      scanned: 2,
      missing: ["https://a.test/old/"],
      alreadyNew: ["https://a.test/new/"],
      h2sByUrl: {
        "https://a.test/old/": ["Overview", "We Care About Town"],
        "https://a.test/new/": ["Answer", "Overview"],
      },
    });
    expect(csv).toBe(
      "url,H2\nhttps://a.test/old/,Overview | We Care About Town\nhttps://a.test/new/,Answer | Overview\n",
    );
  });

  it("writes custom headers", () => {
    const csv = missingTemplateAuditToCsv(
      {
        scanned: 1,
        missing: ["https://a.test/old/"],
        alreadyNew: [],
        h2sByUrl: { "https://a.test/old/": ["Overview"] },
      },
      ["url", "H2", "status"],
    );
    expect(csv).toBe("url,H2,status\nhttps://a.test/old/,Overview,missing\n");
  });
});
