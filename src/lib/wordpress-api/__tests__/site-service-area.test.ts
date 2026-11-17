import { describe, expect, it } from "vitest";
import {
  backfillMissingLocationCountries,
  buildSiteAdditionalLocationsPatch,
  buildSiteLocationsPatch,
  readSiteAdditionalLocations,
  readSiteServiceCity,
  readSiteServiceCountry,
  readSiteServiceState,
} from "@/lib/wordpress-api/site-service-area";
import type { WordPressSite } from "@/components/integrations/types";

function ridgelineSite(overrides: Partial<WordPressSite> = {}): WordPressSite {
  return {
    id: "wp-ridgeline",
    name: "Ridgeline Solar",
    siteUrl: "https://ridgelinesolar.ca/",
    username: "u",
    appPassword: "p",
    connectedAt: 0,
    ...overrides,
  };
}

describe("site-service-area", () => {
  it("reads city and province from default location", () => {
    const site = ridgelineSite({
      locations: [
        {
          id: "l1",
          name: "HQ",
          address: "",
          city: "Edmonton",
          state: "AB",
          zip: "",
          phone: "",
          isDefault: true,
        },
      ],
    });
    expect(readSiteServiceCity(site)).toBe("Edmonton");
    expect(readSiteServiceState(site)).toBe("Alberta");
    expect(readSiteServiceCountry(site)).toBe("Canada");
  });

  it("builds a default location patch for QFO", () => {
    const site = ridgelineSite();
    const patch = buildSiteLocationsPatch(site, "Edmonton", "AB", "Canada");
    expect(patch.locations?.[0]?.city).toBe("Edmonton");
    expect(patch.locations?.[0]?.state).toBe("Alberta");
    expect(patch.locations?.[0]?.country).toBe("Canada");
    expect(patch.locations?.[0]?.isDefault).toBe(true);
    expect(patch.napInfo?.locations?.[0]?.city).toBe("Edmonton");
  });

  it("handles non-string or undefined field inputs without throwing", () => {
    const site = ridgelineSite();
    const patch = buildSiteLocationsPatch(
      site,
      { target: { value: "Edmonton" } } as unknown as string,
      undefined,
      undefined,
    );
    expect(patch.locations).toEqual([]);
  });

  it("preserves secondary locations when updating primary location", () => {
    const site = ridgelineSite({
      locations: [
        {
          id: "l1",
          name: "Edmonton Showroom",
          address: "10615 170 St NW",
          city: "Edmonton",
          state: "Alberta",
          country: "Canada",
          zip: "T5P 4W2",
          phone: "780-484-2390",
          isDefault: true,
        },
        {
          id: "l2",
          name: "Sherwood Park Showroom",
          address: "8005 Emerald Dr Unit 110",
          city: "Sherwood Park",
          state: "Alberta",
          country: "Canada",
          zip: "T8H 0P1",
          phone: "780-464-2366",
          isDefault: false,
        },
      ],
    });
    const patch = buildSiteLocationsPatch(site, "Calgary", "AB", "Canada");
    expect(patch.locations).toHaveLength(2);
    expect(patch.locations?.[0]?.city).toBe("Calgary");
    expect(patch.locations?.[0]?.isDefault).toBe(true);
    expect(patch.locations?.[1]?.city).toBe("Sherwood Park");
    expect(patch.locations?.[1]?.isDefault).toBe(false);
    expect(readSiteAdditionalLocations({ ...site, ...patch })).toHaveLength(1);
  });

  it("updates additional locations while keeping primary location intact", () => {
    const site = ridgelineSite({
      locations: [
        {
          id: "l1",
          name: "HQ",
          address: "",
          city: "Edmonton",
          state: "Alberta",
          country: "Canada",
          zip: "",
          phone: "",
          isDefault: true,
        },
      ],
    });
    const patch = buildSiteAdditionalLocationsPatch(site, [
      { city: "Sherwood Park", state: "AB", country: "Canada" },
      { city: "St. Albert", state: "Alberta", country: "Canada" },
    ]);
    expect(patch.locations).toHaveLength(3);
    expect(patch.locations?.[0]?.city).toBe("Edmonton");
    expect(patch.locations?.[0]?.isDefault).toBe(true);
    expect(patch.locations?.[1]?.city).toBe("Sherwood Park");
    expect(patch.locations?.[1]?.state).toBe("Alberta");
    expect(patch.locations?.[2]?.city).toBe("St. Albert");
  });

  it("accepts a world country outside Canada and United States", () => {
    const site = ridgelineSite();
    const patch = buildSiteLocationsPatch(site, "Mexico City", "", "Mexico");
    expect(patch.locations?.[0]?.country).toBe("Mexico");
    expect(patch.locations?.[0]?.city).toBe("Mexico City");
    expect(patch.locations?.[0]?.state).toBe("");
  });

  it("backfills blank preferred country from province and skips set countries", () => {
    const blank = ridgelineSite({
      id: "wp-blank",
      locations: [
        {
          id: "l1",
          name: "HQ",
          address: "",
          city: "Winnipeg",
          state: "Manitoba",
          zip: "",
          phone: "",
          isDefault: true,
        },
      ],
    });
    const kept = ridgelineSite({
      id: "wp-kept",
      locations: [
        {
          id: "l1",
          name: "HQ",
          address: "",
          city: "Austin",
          state: "Texas",
          country: "United States",
          zip: "",
          phone: "",
          isDefault: true,
        },
      ],
    });
    const { sites, changed } = backfillMissingLocationCountries([blank, kept]);
    expect(changed).toBe(true);
    expect(sites[0]?.locations?.[0]?.country).toBe("Canada");
    expect(sites[1]?.locations?.[0]?.country).toBe("United States");
  });

  it("does not report changed when every country is already set", () => {
    const site = ridgelineSite({
      locations: [
        {
          id: "l1",
          name: "HQ",
          address: "",
          city: "Edmonton",
          state: "Alberta",
          country: "Canada",
          zip: "",
          phone: "",
          isDefault: true,
        },
      ],
    });
    const { changed } = backfillMissingLocationCountries([site]);
    expect(changed).toBe(false);
  });
});
