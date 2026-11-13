import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import type { LocalGridScanDocument } from "@/lib/local-grid-studio/local-grid-types";

const fillDistinctNeighbourhoodSlotsForBucket = vi.fn();
const allocatePagesAcrossNeighbourhoodPicks = vi.fn();
const planWeightedGridPlaces = vi.fn();
const fillEntitySlotKeywordsFromGsc = vi.fn();
const processParsedLocalDominatorRows = vi.fn();
const pickNeighbourhoodEntitiesForCluster = vi.fn();

vi.mock("@/lib/local-analysis/entity-grid-location-wiki-agent", () => ({
  fillDistinctNeighbourhoodSlotsForBucket: (...args: unknown[]) =>
    fillDistinctNeighbourhoodSlotsForBucket(...args),
  allocatePagesAcrossNeighbourhoodPicks: (...args: unknown[]) =>
    allocatePagesAcrossNeighbourhoodPicks(...args),
  maxClustersForBudget: (n: number) => Math.max(1, Math.floor(n / 3) || 1),
  pickNeighbourhoodEntitiesForCluster: (...args: unknown[]) =>
    pickNeighbourhoodEntitiesForCluster(...args),
}));

vi.mock("@/lib/local-grid-studio/local-grid-decision-weights", () => ({
  planWeightedGridPlaces: (...args: unknown[]) => planWeightedGridPlaces(...args),
  weakestPinAddressesForCity: () => ["123 Hyde Park Rd, London, ON"],
}));

vi.mock("@/lib/local-analysis/entity-preload-clusters-hydrate", () => ({
  fillEntitySlotKeywordsFromGsc: (...args: unknown[]) => fillEntitySlotKeywordsFromGsc(...args),
}));

vi.mock("@/lib/process-local-dominator-upload", () => ({
  processParsedLocalDominatorRows: (...args: unknown[]) => processParsedLocalDominatorRows(...args),
}));

vi.mock("@/lib/local-dominator-csv", async () => {
  const actual = await vi.importActual<typeof import("@/lib/local-dominator-csv")>(
    "@/lib/local-dominator-csv",
  );
  return {
    ...actual,
    parseLocalDominatorCsv: () => ({
      error: null,
      rows: [
        {
          keyword: "blinds near me",
          rank: 8,
          latitude: 42.98,
          longitude: -81.25,
          distance: 1,
          distanceMeasure: "mile",
          business: "Custom Shades of London",
          address: "123 Hyde Park Rd, London, ON N6H 1A1",
          primaryCategory: "Blinds shop",
          scanDate: "2026-11-11",
        },
      ],
    }),
    buildLocalGridSummary: () => ({
      summaryMarkdown: "## Local grid\n- London, ON",
      placeHints: ["Hyde Park", "Oakridge"],
      rowCount: 1,
      scanDateRange: "2026-11-11",
      keywords: ["blinds near me"],
      byKeyword: [],
    }),
    wikipediaSearchAugmentFromGridRows: () => "Ontario Canada",
  };
});

vi.mock("@/lib/openrouter-api-key-resolve", () => ({
  resolveOpenRouterApiKeyForHarness: async () => "test-key",
}));

vi.mock("@/lib/optimization-settings-storage", () => ({
  getBlogModel: () => "test-model",
}));

vi.mock("@/lib/app-notifications", () => ({
  notify: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/app-navigation", () => ({
  appNavigate: vi.fn(),
}));

const site = {
  id: "wp-customshades",
  name: "Custom Shades of London",
  siteUrl: "https://www.customshadesoflondon.ca/",
} as WordPressSite;

const scan: LocalGridScanDocument = {
  scanId: "scan_1",
  siteId: site.id,
  scanDateIso: "2026-11-11T00:00:00.000Z",
  scanDateLabel: "Nov 11, 2026",
  keyword: "blinds near me",
  scanSize: "7x7",
  shape: "circle",
  distance: 1,
  distanceMeasure: "mile",
  centerLat: 42.98,
  centerLng: -81.25,
  targetBusiness: {
    key: "custom-shades",
    business: "Custom Shades of London",
    address: "London, ON",
    placeId: "p1",
    websiteUrl: site.siteUrl,
    primaryCategory: "Blinds shop",
    secondaryCategories: "",
    rating: 5,
    reviews: 10,
    latitude: 42.98,
    longitude: -81.25,
  },
  points: [
    {
      pointId: "p0",
      row: 0,
      col: 0,
      latitude: 42.98,
      longitude: -81.25,
      distanceFromCenter: 0,
      items: [
        {
          rank: 8,
          business: "Custom Shades of London",
          address: "123 Hyde Park Rd, London, ON N6H 1A1",
          placeId: "p1",
          websiteUrl: site.siteUrl,
          primaryCategory: "Blinds shop",
          secondaryCategories: "",
          rating: 5,
          reviews: 10,
          googleUrl: "",
        },
      ],
    },
  ],
};

describe("generateLocationsWikiRowsFromGrid", () => {
  beforeEach(() => {
    fillDistinctNeighbourhoodSlotsForBucket.mockReset();
    allocatePagesAcrossNeighbourhoodPicks.mockReset();
    planWeightedGridPlaces.mockReset();
    fillEntitySlotKeywordsFromGsc.mockReset();
    processParsedLocalDominatorRows.mockReset();
    pickNeighbourhoodEntitiesForCluster.mockReset();

    processParsedLocalDominatorRows.mockResolvedValue({
      ok: true,
      placeHints: ["Hyde Park", "Oakridge", "London, ON"],
    });
    planWeightedGridPlaces.mockResolvedValue([
      { place: "London, ON", weight: 10, pages: 3 },
    ]);
    fillDistinctNeighbourhoodSlotsForBucket.mockResolvedValue([
      {
        entity: "Hyde Park, London, ON",
        wiki: {
          gridPlaceLabel: "London, ON",
          title: "Hyde Park, London, Ontario",
          url: "https://en.wikipedia.org/wiki/Hyde_Park%2C_London%2C_Ontario",
        },
      },
      {
        entity: "Oakridge, London, ON",
        wiki: {
          gridPlaceLabel: "London, ON",
          title: "Oakridge, London",
          url: "https://en.wikipedia.org/wiki/Oakridge%2C_London",
        },
      },
    ]);
    allocatePagesAcrossNeighbourhoodPicks.mockReturnValue([
      { entity: "Hyde Park, London, ON", pages: 2, posWeight: 1 },
      { entity: "Oakridge, London, ON", pages: 1, posWeight: 1 },
    ]);
    fillEntitySlotKeywordsFromGsc.mockImplementation(async ({ rows }) => ({
      rows: rows.map((r: { entity: string }, i: number) => ({
        ...r,
        keyword: `blinds ${i}`,
      })),
    }));
  });

  it("uses Wikipedia slot fill, not invent-without-pool neighbourhood LLM", async () => {
    const { generateLocationsWikiRowsFromGrid } = await import(
      "@/lib/local-grid-studio/local-grid-bulk-csv-generator"
    );

    const rows = await generateLocationsWikiRowsFromGrid({
      site,
      scan,
      gridCsvText: "keyword,rank,lat,lng\nblinds near me,8,42.98,-81.25\n",
      count: 3,
      apiKey: "test-key",
    });

    expect(fillDistinctNeighbourhoodSlotsForBucket).toHaveBeenCalledTimes(1);
    expect(pickNeighbourhoodEntitiesForCluster).not.toHaveBeenCalled();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.entity.includes("Hyde Park"))).toBe(true);
    expect(rows.every((r) => Boolean(r.wikipedia_url && r.wikipedia_title))).toBe(true);
  });

  it("fails fast when Wikipedia harvest returns no neighbourhoods", async () => {
    fillDistinctNeighbourhoodSlotsForBucket.mockResolvedValueOnce([]);
    const { generateLocationsWikiRowsFromGrid } = await import(
      "@/lib/local-grid-studio/local-grid-bulk-csv-generator"
    );

    await expect(
      generateLocationsWikiRowsFromGrid({
        site,
        scan,
        gridCsvText: "keyword,rank,lat,lng\nblinds near me,8,42.98,-81.25\n",
        count: 3,
        apiKey: "test-key",
      }),
    ).rejects.toThrow(/No neighbourhoods found inside London, ON/);
  });
});
