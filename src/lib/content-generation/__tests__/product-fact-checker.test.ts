import { describe, expect, it } from "vitest";
import {
  applyProductFactCheckEdits,
  assertProductFactCheckerModel,
  FACT_CHECKER_STEP_LABEL,
  FACT_SOURCE_ATTR,
  softFinishProductFactCheckEdits,
  validateProductFactEdit,
  wrapAnchorInReplacement,
} from "../product-fact-checker";

describe("FACT_CHECKER_STEP_LABEL", () => {
  it("is Fact checker", () => {
    expect(FACT_CHECKER_STEP_LABEL).toBe("Fact checker");
  });
});

describe("wrapAnchorInReplacement", () => {
  it("wraps the anchor in an evidence link", () => {
    const out = wrapAnchorInReplacement(
      "PowerView is listed in the Hunter Douglas guide.",
      "Hunter Douglas guide",
      "https://www.hunterdouglas.com/powerview",
    );
    expect(out).toContain(`href="https://www.hunterdouglas.com/powerview"`);
    expect(out).toContain(`${FACT_SOURCE_ATTR}="1"`);
    expect(out).toContain('rel="nofollow noopener noreferrer"');
    expect(out).toContain(">Hunter Douglas guide</a>");
  });
});

describe("validateProductFactEdit", () => {
  it("rejects a kept claim with no http source", () => {
    expect(() =>
      validateProductFactEdit(
        {
          quote: "Saves 40% on heating.",
          verdict: "supported",
          replacement: "Saves 40% on heating.",
          anchor: "Saves 40%",
          sourceUrl: "",
          sourceTitle: "",
          qualification: "",
        },
        "blindmagic.com",
      ),
    ).toThrow(/http\(s\) sourceUrl/);
  });

  it("rejects a client-site source", () => {
    expect(() =>
      validateProductFactEdit(
        {
          quote: "SoftTouch is a headrail wand.",
          verdict: "supported",
          replacement: "SoftTouch is a headrail wand per SoftTouch.",
          anchor: "SoftTouch",
          sourceUrl: "https://www.blindmagic.com/softtouch",
          sourceTitle: "Client",
          qualification: "",
        },
        "blindmagic.com",
      ),
    ).toThrow(/client site/);
  });

  it("allows omit with empty replacement", () => {
    const out = validateProductFactEdit(
      {
        quote: "Saves 97% of heat.",
        verdict: "omit",
        replacement: "",
        anchor: "",
        sourceUrl: "",
        sourceTitle: "",
        qualification: "",
      },
      "blindmagic.com",
    );
    expect(out.replacement).toBe("");
    expect(out.verdict).toBe("omit");
  });
});

describe("applyProductFactCheckEdits", () => {
  it("inserts a manufacturer evidence link for a supported claim", () => {
    const html =
      "<p>PowerView schedules shades from the app.</p><p>Other copy.</p>";
    const out = applyProductFactCheckEdits(
      html,
      [
        {
          quote: "PowerView schedules shades from the app.",
          verdict: "supported",
          replacement: "PowerView schedules shades from the app per Hunter Douglas.",
          anchor: "Hunter Douglas",
          sourceUrl: "https://www.hunterdouglas.com/operating-systems/powerview",
          sourceTitle: "Hunter Douglas PowerView",
          qualification: "",
        },
      ],
      { clientHost: "blindmagic.com" },
    );
    expect(out).toContain('href="https://www.hunterdouglas.com/operating-systems/powerview"');
    expect(out).toContain(`${FACT_SOURCE_ATTR}="1"`);
    expect(out).toContain(">Hunter Douglas</a>");
    expect(out).not.toContain("PowerView schedules shades from the app.</p>");
  });

  it("deletes an unsourced claim sentence", () => {
    const html = "<p>This wand lasts 500 hours on one charge. Nearby sentence stays.</p>";
    const out = applyProductFactCheckEdits(
      html,
      [
        {
          quote: "This wand lasts 500 hours on one charge.",
          verdict: "omit",
          replacement: "",
          anchor: "",
          sourceUrl: "",
          sourceTitle: "",
          qualification: "",
        },
      ],
      { clientHost: "blindmagic.com" },
    );
    expect(out).not.toContain("500 hours");
    expect(out).toContain("Nearby sentence stays.");
  });

  it("rejects a quote that appears more than once", () => {
    const sentence = "Standard three-panel bay windows typically span 126 to 184 inches.";
    const html = `<p>${sentence}</p><p>${sentence}</p>`;
    expect(() =>
      applyProductFactCheckEdits(
        html,
        [
          {
            quote: sentence,
            verdict: "omit",
            replacement: "",
            anchor: "",
            sourceUrl: "",
            sourceTitle: "",
            qualification: "",
          },
        ],
        { clientHost: "blindmagic.com" },
      ),
    ).toThrow(/quote appears more than once/);
  });

  it("updates every copy when a repeated quote is accepted", () => {
    const sentence = "Standard three-panel bay windows typically span 126 to 184 inches.";
    const html = `<p>${sentence}</p><p>Other.</p><p>${sentence}</p>`;
    const out = applyProductFactCheckEdits(
      html,
      [
        {
          quote: sentence,
          verdict: "supported",
          replacement: "Bay windows vary by manufacturer.",
          anchor: "manufacturer",
          sourceUrl: "https://www.hunterdouglas.com/bay",
          sourceTitle: "Hunter Douglas",
          qualification: "",
        },
      ],
      { clientHost: "blindmagic.com", replaceRepeatedQuotes: true },
    );
    expect(out).not.toContain(sentence);
    expect(out.match(/Bay windows vary by/g)).toHaveLength(2);
    expect(out).toContain(">manufacturer</a>");
  });

  it("rejects a quote missing from the article", () => {
    expect(() =>
      applyProductFactCheckEdits(
        "<p>Hello.</p>",
        [
          {
            quote: "Missing claim text.",
            verdict: "omit",
            replacement: "",
            anchor: "",
            sourceUrl: "",
            sourceTitle: "",
            qualification: "",
          },
        ],
        { clientHost: "blindmagic.com" },
      ),
    ).toThrow(/quote not found/);
  });
});

describe("assertProductFactCheckerModel", () => {
  it("rejects unhandledQuotes", () => {
    expect(() =>
      assertProductFactCheckerModel({
        edits: [],
        unhandledQuotes: ["Saves 40% on heating bills."],
      }),
    ).toThrow(/unhandled/);
  });

  it("returns edits when unhandledQuotes is empty", () => {
    const edits = assertProductFactCheckerModel({ edits: [], unhandledQuotes: [] });
    expect(edits).toEqual([]);
  });
});

describe("softFinishProductFactCheckEdits", () => {
  it("omits a partially_supported claim when qualification is missing from replacement", () => {
    const quote =
      "Steel measuring tapes provide the required accuracy when recording window dimensions.";
    const html = `<p>${quote} Keep this.</p>`;
    const out = softFinishProductFactCheckEdits(
      html,
      [
        {
          quote,
          verdict: "partially_supported",
          replacement: "Steel measuring tapes are used for window openings.",
          anchor: "Steel measuring tapes",
          sourceUrl: "https://www.nist.gov/pml/owm",
          sourceTitle: "NIST",
          qualification: "accuracy depends on tape class and technique",
        },
      ],
      "nightdaydecor.com",
    );
    expect(out).not.toContain("Steel measuring tapes");
    expect(out).toContain("Keep this.");
  });

  it("keeps a valid supported edit while omitting an invalid sibling", () => {
    const good = "PowerView schedules shades from the app.";
    const bad = "This wand lasts 500 hours on one charge.";
    const html = `<p>${good}</p><p>${bad}</p><p>Footer.</p>`;
    const out = softFinishProductFactCheckEdits(
      html,
      [
        {
          quote: good,
          verdict: "supported",
          replacement: "PowerView schedules shades from the app per Hunter Douglas.",
          anchor: "Hunter Douglas",
          sourceUrl: "https://www.hunterdouglas.com/powerview",
          sourceTitle: "Hunter Douglas",
          qualification: "",
        },
        {
          quote: bad,
          verdict: "partially_supported",
          replacement: "Battery life varies by model.",
          anchor: "Battery life",
          sourceUrl: "https://www.hunterdouglas.com/battery",
          sourceTitle: "Hunter Douglas",
          qualification: "no published 500-hour figure",
        },
      ],
      "blindmagic.com",
    );
    expect(out).toContain(">Hunter Douglas</a>");
    expect(out).not.toContain("500 hours");
    expect(out).toContain("Footer.");
  });
});
