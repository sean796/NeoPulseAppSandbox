import { describe, expect, it } from "vitest";
import {
  buildApplyCategoriesBody,
  buildRecommendCategoriesBody,
  parseApplyCategoriesResponse,
  parseRecommendCategoriesResponse,
  parseWriteCategoriesResponse,
} from "@/lib/gbp-post/gbp-categories-api";

function fakeResponse(ok: boolean, status = ok ? 200 : 400): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Bad Request",
  } as Response;
}

describe("gbp-categories-api", () => {
  it("buildRecommendCategoriesBody requires benchmarks", () => {
    expect(() =>
      buildRecommendCategoriesBody({
        gbpLocationId: "123",
        siteName: "Acme",
        siteUrl: "https://acme.example",
        keyword: "blinds",
        categoryBenchmarks: [{ category: "  " }],
        competitorCategoryHints: [],
      }),
    ).toThrow(/benchmarks/i);
  });

  it("buildRecommendCategoriesBody allows site URL without gbpLocationId", () => {
    const body = buildRecommendCategoriesBody({
      gbpLocationId: "",
      siteName: "Acme",
      siteUrl: "https://acme.example",
      keyword: "blinds",
      categoryBenchmarks: [{ category: "Blinds shop", top3SharePct: 40 }],
      competitorCategoryHints: [],
    });
    expect(body).toEqual({
      siteName: "Acme",
      siteUrl: "https://acme.example",
      keyword: "blinds",
      categoryBenchmarks: [{ category: "Blinds shop", top3SharePct: 40 }],
      competitorCategoryHints: [],
    });
  });

  it("buildRecommendCategoriesBody shapes payload", () => {
    const body = buildRecommendCategoriesBody({
      gbpLocationId: " 999 ",
      siteName: " Acme ",
      siteUrl: " https://acme.example ",
      keyword: " blinds ",
      categoryBenchmarks: [
        { category: "Blinds shop", top3SharePct: 41.2 },
        { category: "  " },
      ],
      competitorCategoryHints: [
        { primary: "Blinds shop", secondary: "Awning supplier" },
        { primary: "", secondary: "" },
      ],
      openRouterApiKey: " sk-test ",
    });
    expect(body).toEqual({
      gbpLocationId: "999",
      siteName: "Acme",
      siteUrl: "https://acme.example",
      keyword: "blinds",
      categoryBenchmarks: [{ category: "Blinds shop", top3SharePct: 41.2 }],
      competitorCategoryHints: [{ primary: "Blinds shop", secondary: "Awning supplier" }],
      openRouterApiKey: "sk-test",
    });
  });

  it("parseRecommendCategoriesResponse fails without primary", () => {
    expect(() =>
      parseRecommendCategoriesResponse({ success: true, proposed: {} }, fakeResponse(true)),
    ).toThrow(/no primary/i);
  });

  it("parseRecommendCategoriesResponse maps current and proposed", () => {
    const parsed = parseRecommendCategoriesResponse(
      {
        success: true,
        location: "locations/1",
        regionCode: "CA",
        rationale: "Matches blinds winners.",
        current: {
          primary: { name: "categories/gcid:window_treatment_store", displayName: "Window treatment store" },
          additional: [],
        },
        proposed: {
          primary: { name: "categories/gcid:blinds_shop", displayName: "Blinds shop" },
          additional: [{ name: "categories/gcid:awning_supplier", displayName: "Awning supplier" }],
        },
      },
      fakeResponse(true),
    );
    expect(parsed.proposed.primary.displayName).toBe("Blinds shop");
    expect(parsed.proposed.additional).toHaveLength(1);
    expect(parsed.current.primary?.name).toContain("window_treatment_store");
    expect(parsed.rationale).toBe("Matches blinds winners.");
  });

  it("buildApplyCategoriesBody requires primary and drops duplicate additional", () => {
    expect(() =>
      buildApplyCategoriesBody({
        gbpLocationId: "1",
        primaryCategoryName: "",
        additionalCategoryNames: [],
      }),
    ).toThrow(/Primary category/i);

    const body = buildApplyCategoriesBody({
      gbpLocationId: "1",
      siteName: "Acme",
      primaryCategoryName: "categories/gcid:blinds_shop",
      additionalCategoryNames: [
        " categories/gcid:awning_supplier ",
        "categories/gcid:blinds_shop",
        "",
      ],
    });
    expect(body).toEqual({
      gbpLocationId: "1",
      siteName: "Acme",
      primaryCategoryName: "categories/gcid:blinds_shop",
      additionalCategoryNames: ["categories/gcid:awning_supplier"],
    });
  });

  it("parseApplyCategoriesResponse surfaces API errors", () => {
    expect(() =>
      parseApplyCategoriesResponse(
        { success: false, error: "Not connected. Use Connect Google Business first." },
        fakeResponse(false, 401),
      ),
    ).toThrow(/Not connected/i);
  });

  it("parseWriteCategoriesResponse requires written primary from proposed", () => {
    const parsed = parseWriteCategoriesResponse(
      {
        success: true,
        location: "locations/1",
        rationale: "Grid winners.",
        written: {
          primary: { name: "categories/gcid:blinds_shop", displayName: "Blinds shop" },
          additional: [],
        },
        proposed: {
          primary: { name: "categories/gcid:blinds_shop", displayName: "Blinds shop" },
          additional: [],
        },
      },
      fakeResponse(true),
    );
    expect(parsed.written.primary?.displayName).toBe("Blinds shop");
    expect(parsed.rationale).toBe("Grid winners.");
  });
});
