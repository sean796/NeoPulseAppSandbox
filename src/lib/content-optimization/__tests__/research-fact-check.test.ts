import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import type { SeoContentBriefV1 } from "@/lib/overview-seo-content-brief";

vi.mock("@/lib/competitor-research/competitor-report-openrouter", () => ({
  callOpenRouterChatCompletion: vi.fn(),
}));

vi.mock("@/lib/openrouter-api-key-resolve", () => ({
  resolveOpenRouterApiKeyForHarness: vi.fn(async () => "test-openrouter-key"),
}));

vi.mock("@/lib/optimization-settings-storage", () => ({
  getResearchModel: vi.fn(() => "test-research-model"),
}));

import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import {
  FACT_CHECKING_STEP_LABEL,
  assertRewrittenNapOnCard,
  buildNapCardFromSite,
  formatFactCheckPromptBlock,
  phoneDigits,
  runResearchFactCheck,
} from "../research-fact-check";

const mockCall = vi.mocked(callOpenRouterChatCompletion);

function emptyBrief(overrides?: Partial<SeoContentBriefV1>): SeoContentBriefV1 {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    focusKeyword: "window shades manteca",
    pageUrl: "https://example.com/shades",
    dataforseo: {
      seedKeyword: null,
      organic: [],
      peopleAlsoAsk: [],
      peopleAlsoSearchPhrases: [],
      relatedSearches: [],
      refinementChips: [],
      popularProducts: [],
    },
    gsc: { pageUrl: "https://example.com/shades", queries: [] },
    semrush: {
      urlOrganicKeywords: [],
      phraseRelatedKeywords: [],
      urlOrganicUrls: [],
      phraseRelatedUrls: [],
      phraseOrganicUrls: [],
      externalSemrushUrls: [],
    },
    ...overrides,
  };
}

describe("buildNapCardFromSite", () => {
  it("collects every name, address, phone, and email from napInfo and locations", () => {
    const site = {
      id: "1",
      name: "Blind Spot",
      siteUrl: "https://shutterspot.com",
      napInfo: {
        name: "Blind Spot",
        address: "100 Main St, Manteca, CA 95336",
        phone: "(209) 555-0100",
        email: "hello@shutterspot.com",
        locations: [
          {
            id: "a",
            name: "Blind Spot Manteca",
            address: "200 Oak Ave",
            city: "Manteca",
            state: "CA",
            zip: "95337",
            phone: "209-555-0200",
            email: "manteca@shutterspot.com",
            isDefault: true,
          },
        ],
      },
    } as WordPressSite;

    const card = buildNapCardFromSite(site);
    expect(card.names).toEqual(expect.arrayContaining(["Blind Spot", "Blind Spot Manteca"]));
    expect(card.phones.map(phoneDigits)).toEqual(
      expect.arrayContaining(["2095550100", "2095550200"]),
    );
    expect(card.addresses.some((a) => a.includes("100 Main St"))).toBe(true);
    expect(card.addresses.some((a) => a.includes("200 Oak Ave"))).toBe(true);
    expect(card.emails).toEqual(
      expect.arrayContaining(["hello@shutterspot.com", "manteca@shutterspot.com"]),
    );
  });

  it("returns empty card when site is missing", () => {
    expect(buildNapCardFromSite(null)).toEqual({
      names: [],
      addresses: [],
      phones: [],
      emails: [],
    });
  });
});

describe("assertRewrittenNapOnCard", () => {
  it("throws when a rewritten phone is not on the NAP card", () => {
    expect(() =>
      assertRewrittenNapOnCard(
        [
          {
            kind: "nap",
            original: "Call 214-555-9999",
            verdict: "rewrite",
            rewritten: "Call 214-555-9999",
            reason: "kept bad phone",
          },
        ],
        {
          names: ["Blind Spot"],
          addresses: [],
          phones: ["(209) 555-0100"],
          emails: [],
        },
      ),
    ).toThrow(/rewritten phone is not on the property NAP card/i);
  });

  it("allows a rewritten phone that matches the NAP card", () => {
    expect(() =>
      assertRewrittenNapOnCard(
        [
          {
            kind: "nap",
            original: "Call 214-555-9999",
            verdict: "rewrite",
            rewritten: "Call (209) 555-0100",
            reason: "use property phone",
          },
        ],
        {
          names: ["Blind Spot"],
          addresses: [],
          phones: ["(209) 555-0100"],
          emails: [],
        },
      ),
    ).not.toThrow();
  });
});

describe("formatFactCheckPromptBlock", () => {
  it("includes canonical NAP and rewritten claims", () => {
    const block = formatFactCheckPromptBlock({
      checkedAt: "2026-11-16T00:00:00.000Z",
      primaryCity: "Manteca, CA",
      napCard: {
        names: ["Blind Spot"],
        addresses: ["100 Main St, Manteca, CA"],
        phones: ["(209) 555-0100"],
        emails: [],
      },
      checks: [
        {
          kind: "place",
          original: "Homeowners in Highland Park, Dallas love these shades.",
          verdict: "rewrite",
          rewritten: "Homeowners in Manteca love these shades.",
          reason: "wrong market",
          placeType: "neighborhood",
          placeCity: "Dallas, TX",
        },
      ],
    });
    expect(block).toContain("FACT CHECK");
    expect(block).toContain("Blind Spot");
    expect(block).toContain("(209) 555-0100");
    expect(block).toContain("Highland Park");
    expect(block).toContain("Homeowners in Manteca love these shades.");
  });
});

describe("runResearchFactCheck", () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it("reports Fact checking progress and stores the packet on the brief", async () => {
    const onProgress = vi.fn();
    mockCall.mockResolvedValue({
      raw: null,
      content: JSON.stringify({
        checks: [
          {
            kind: "place",
            original: "Visit Highland Park in Dallas for shade ideas.",
            verdict: "rewrite",
            rewritten: "Visit neighborhoods around Manteca for shade ideas.",
            reason: "Dallas is the wrong market",
            placeType: "neighborhood",
            placeCity: "Dallas, TX",
          },
        ],
        firstPartyClaims: null,
        illustrativeExample: null,
        chatGptTexts: null,
      }),
    });

    const site = {
      id: "site-1",
      name: "Blind Spot",
      siteUrl: "https://shutterspot.com",
      napInfo: {
        name: "Blind Spot",
        phone: "(209) 555-0100",
        address: "100 Main St, Manteca, CA 95336",
        locations: [
          {
            id: "a",
            name: "Blind Spot",
            address: "100 Main St",
            city: "Manteca",
            state: "CA",
            zip: "95336",
            phone: "(209) 555-0100",
            isDefault: true,
          },
        ],
      },
    } as WordPressSite;

    const out = await runResearchFactCheck({
      brief: emptyBrief({
        firstPartyClaims: [{ text: "We install in Manteca.", source: "gbp" }],
        queryFanout: {
          queries: ["window shades"],
          namedPrograms: [],
        },
      }),
      site,
      keyword: "window shades manteca",
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledWith(FACT_CHECKING_STEP_LABEL);
    expect(out.queryFanout?.factCheck?.checks).toHaveLength(1);
    expect(out.queryFanout?.factCheck?.checks[0]?.verdict).toBe("rewrite");
    expect(out.queryFanout?.factCheck?.napCard.phones.map(phoneDigits)).toContain("2095550100");
  });

  it("throws when the model invents a phone off the NAP card", async () => {
    mockCall.mockResolvedValue({
      raw: null,
      content: JSON.stringify({
        checks: [
          {
            kind: "nap",
            original: "Call us at 214-555-9999",
            verdict: "rewrite",
            rewritten: "Call us at 214-555-9999",
            reason: "failed to fix",
          },
        ],
        firstPartyClaims: null,
        illustrativeExample: null,
        chatGptTexts: null,
      }),
    });

    await expect(
      runResearchFactCheck({
        brief: emptyBrief(),
        site: {
          id: "1",
          name: "Blind Spot",
          siteUrl: "https://shutterspot.com",
          napInfo: { phone: "(209) 555-0100" },
        } as WordPressSite,
        keyword: "blinds",
      }),
    ).rejects.toThrow(/rewritten phone is not on the property NAP card/i);
  });
});
