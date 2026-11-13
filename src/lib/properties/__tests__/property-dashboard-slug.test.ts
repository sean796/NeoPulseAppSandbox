import { describe, expect, it } from "vitest";
import {
  findSiteByDashboardSlug,
  propertyDashboardPath,
  propertyDashboardSlug,
  propertyDashboardSlugFromName,
  propertySlugFromDashboardPath,
} from "@/lib/properties/property-dashboard-slug";

describe("propertyDashboardSlugFromName", () => {
  it("hyphenates spaces and strips punctuation", () => {
    expect(propertyDashboardSlugFromName("Advance Blinds")).toBe("advance-blinds");
    expect(propertyDashboardSlugFromName("Blinds West")).toBe("blinds-west");
    expect(propertyDashboardSlugFromName("Custom Shades of London")).toBe(
      "custom-shades-of-london",
    );
    expect(propertyDashboardSlugFromName("Elite Shutters & Shadings")).toBe(
      "elite-shutters-shadings",
    );
    expect(propertyDashboardSlugFromName("You Junk It... I Dump It")).toBe(
      "you-junk-it-i-dump-it",
    );
  });
});

describe("propertyDashboardSlug", () => {
  it("prefers display name over hostname", () => {
    expect(
      propertyDashboardSlug({
        name: "In the Shade",
        siteUrl: "https://intheshadeflorida.com",
      }),
    ).toBe("in-the-shade");
  });

  it("falls back to hostname when name is empty", () => {
    expect(propertyDashboardSlug({ name: "", siteUrl: "https://www.neodigital.ca/" })).toBe(
      "neodigital",
    );
  });
});

describe("propertyDashboardPath", () => {
  it("always includes the slug including for the first client", () => {
    expect(
      propertyDashboardPath({ name: "Advance Blinds", siteUrl: "https://example.com" }),
    ).toBe("/dashboard/advance-blinds");
  });
});

describe("propertySlugFromDashboardPath", () => {
  it("returns null on home and slug on named paths", () => {
    expect(propertySlugFromDashboardPath("/dashboard")).toBeNull();
    expect(propertySlugFromDashboardPath("/dashboard/blinds-west")).toBe("blinds-west");
  });
});

describe("findSiteByDashboardSlug", () => {
  const sites = [
    { id: "1", name: "Advance Blinds", siteUrl: "https://advanceblindsanddrapery.com" },
    { id: "2", name: "Blinds West", siteUrl: "https://blindswest.ca" },
  ];

  it("finds by hyphenated name slug", () => {
    expect(findSiteByDashboardSlug(sites, "blinds-west")?.id).toBe("2");
    expect(findSiteByDashboardSlug(sites, "advance-blinds")?.id).toBe("1");
  });

  it("returns undefined when unknown", () => {
    expect(findSiteByDashboardSlug(sites, "missing")).toBeUndefined();
  });
});
