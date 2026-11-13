import { describe, expect, it } from "vitest";
import {
  findSiteByDashboardSlug,
  propertyDashboardPath,
  propertyDashboardSlug,
  propertyDashboardSlugFromHostname,
  propertySlugFromDashboardPath,
} from "@/lib/properties/property-dashboard-slug";

describe("propertyDashboardSlugFromHostname", () => {
  it("strips www and TLD", () => {
    expect(propertyDashboardSlugFromHostname("www.intheshadeflorida.com")).toBe(
      "intheshadeflorida",
    );
    expect(propertyDashboardSlugFromHostname("intheshadeflorida.com")).toBe("intheshadeflorida");
    expect(propertyDashboardSlugFromHostname("neodigital.ca")).toBe("neodigital");
  });

  it("joins multi-label hosts without TLD using hyphens", () => {
    expect(propertyDashboardSlugFromHostname("blog.example.com")).toBe("blog-example");
  });
});

describe("propertyDashboardSlug", () => {
  it("reads hostname from siteUrl", () => {
    expect(propertyDashboardSlug({ siteUrl: "https://www.superiorblinds.com/" })).toBe(
      "superiorblinds",
    );
  });
});

describe("propertyDashboardPath", () => {
  it("uses bare /dashboard for the first client home", () => {
    expect(
      propertyDashboardPath({ siteUrl: "https://intheshadeflorida.com" }, true),
    ).toBe("/dashboard");
  });

  it("uses /dashboard/slug for other clients", () => {
    expect(
      propertyDashboardPath({ siteUrl: "https://intheshadeflorida.com" }, false),
    ).toBe("/dashboard/intheshadeflorida");
  });
});

describe("propertySlugFromDashboardPath", () => {
  it("returns null on home and slug on named paths", () => {
    expect(propertySlugFromDashboardPath("/dashboard")).toBeNull();
    expect(propertySlugFromDashboardPath("/dashboard/")).toBeNull();
    expect(propertySlugFromDashboardPath("/dashboard/intheshadeflorida")).toBe(
      "intheshadeflorida",
    );
  });
});

describe("findSiteByDashboardSlug", () => {
  const sites = [
    { id: "1", siteUrl: "https://advanceblindsanddrapery.com" },
    { id: "2", siteUrl: "https://intheshadeflorida.com" },
  ];

  it("finds by slug", () => {
    expect(findSiteByDashboardSlug(sites, "intheshadeflorida")?.id).toBe("2");
  });

  it("returns undefined when unknown", () => {
    expect(findSiteByDashboardSlug(sites, "missing")).toBeUndefined();
  });
});
