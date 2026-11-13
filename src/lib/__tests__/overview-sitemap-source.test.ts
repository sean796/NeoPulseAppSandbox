import { describe, expect, it } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import {
  canLoadOverviewSitemapSource,
  isOverviewPostsSourceAvailable,
  overviewEntityRestCollectionForSite,
  overviewInventoryCollectionsForOverviewLoad,
  overviewInventoryCollectionsFromSource,
  overviewInventoryCollectionsForSite,
  overviewUrlsFromInventoryRows,
  pageSitemapXmlUrlForPlay,
  resolveOverviewSitemapUrls,
} from "@/lib/overview/overview-sitemap-source";
import type { OverviewInventoryRow } from "@/lib/overview/overview-inventory-csv";

function shutterSpotSite(): WordPressSite {
  return {
    id: "shutterspot",
    name: "Shutter Spot",
    siteUrl: "https://shutterspot.com",
    username: "user",
    appPassword: "pass",
    connectedAt: Date.now(),
    entitySitemapUrl: "https://shutterspot.com/service-area-sitemap.xml",
    manualEndpoint: "service-area",
    sitemaps: {
      mainSitemapUrl: "https://shutterspot.com/sitemap_index.xml",
      detectedAt: Date.now(),
      type: "index",
      childSitemaps: [
        "https://shutterspot.com/post-sitemap.xml",
        "https://shutterspot.com/page-sitemap.xml",
        "https://shutterspot.com/hunter-douglas-sitemap.xml",
        "https://shutterspot.com/service-area-sitemap.xml",
        "https://shutterspot.com/location-sitemap.xml",
        "https://shutterspot.com/promotion-sitemap.xml",
      ],
      endpoints: {
        "https://shutterspot.com/service-area-sitemap.xml": "service-area",
      },
      childTagsByUrl: {
        "https://shutterspot.com/service-area-sitemap.xml": {
          roles: ["entity"],
          custom: ["Service Areas"],
        },
        "https://shutterspot.com/location-sitemap.xml": {
          roles: [],
          custom: ["Locations"],
        },
      },
    },
  } as WordPressSite;
}

describe("resolveOverviewSitemapUrls", () => {
  it("Pages merges page sitemap plus non-post, non-entity children", () => {
    const site = shutterSpotSite();
    expect(resolveOverviewSitemapUrls(site, "pages")).toEqual([
      "https://shutterspot.com/page-sitemap.xml",
      "https://shutterspot.com/hunter-douglas-sitemap.xml",
      "https://shutterspot.com/location-sitemap.xml",
      "https://shutterspot.com/promotion-sitemap.xml",
    ]);
  });

  it("Posts resolves post sitemap only", () => {
    const site = shutterSpotSite();
    expect(resolveOverviewSitemapUrls(site, "posts")).toEqual([
      "https://shutterspot.com/post-sitemap.xml",
    ]);
  });

  it("SAP resolves service-area entity sitemap only", () => {
    const site = shutterSpotSite();
    expect(resolveOverviewSitemapUrls(site, "sap")).toEqual([
      "https://shutterspot.com/service-area-sitemap.xml",
    ]);
  });

  it("SAP never uses location-sitemap even when misconfigured as entity", () => {
    const site = shutterSpotSite();
    site.entitySitemapUrl = "https://shutterspot.com/location-sitemap.xml";
    site.manualEndpoint = "location";
    site.sitemaps!.childTagsByUrl = {
      "https://shutterspot.com/location-sitemap.xml": {
        roles: ["entity"],
        custom: ["Locations"],
      },
    };
    expect(resolveOverviewSitemapUrls(site, "sap")).toEqual([
      "https://shutterspot.com/service-area-sitemap.xml",
    ]);
    expect(overviewEntityRestCollectionForSite(site)).toBe("service-area");
  });

  it("Pages still loads appendable CPT sitemaps when page sitemap is missing", () => {
    const site = shutterSpotSite();
    site.sitemaps!.childSitemaps = site.sitemaps!.childSitemaps!.filter(
      (u) => !u.includes("page-sitemap"),
    );
    expect(resolveOverviewSitemapUrls(site, "pages")).toEqual([
      "https://shutterspot.com/hunter-douglas-sitemap.xml",
      "https://shutterspot.com/location-sitemap.xml",
      "https://shutterspot.com/promotion-sitemap.xml",
    ]);
  });

  it("respects disabled child sitemaps from Integrations", () => {
    const site = shutterSpotSite();
    site.sitemaps!.disabledChildSitemapUrls = [
      "https://shutterspot.com/promotion-sitemap.xml",
    ];
    expect(resolveOverviewSitemapUrls(site, "pages")).toEqual([
      "https://shutterspot.com/page-sitemap.xml",
      "https://shutterspot.com/hunter-douglas-sitemap.xml",
      "https://shutterspot.com/location-sitemap.xml",
    ]);
  });

  it("Posts returns empty when post sitemap is excluded in Integrations", () => {
    const site = shutterSpotSite();
    site.sitemaps!.disabledChildSitemapUrls = ["https://shutterspot.com/post-sitemap.xml"];
    expect(resolveOverviewSitemapUrls(site, "posts")).toEqual([]);
    expect(isOverviewPostsSourceAvailable(site)).toBe(true);
    expect(canLoadOverviewSitemapSource(site, "posts")).toBe(true);
  });
});

describe("overviewInventoryCollectionsFromSource", () => {
  it("Pages includes pages plus CPT endpoints from appended sitemaps", () => {
    const site = shutterSpotSite();
    expect(overviewInventoryCollectionsFromSource("pages", site)).toEqual([
      "pages",
      "hunter-douglas",
      "location",
      "promotion",
    ]);
  });

  it("Pages skips local/geo sitemaps that are not wp/v2 collections", () => {
    const site = shutterSpotSite();
    site.sitemaps!.childSitemaps = [
      ...(site.sitemaps!.childSitemaps ?? []),
      "https://shutterspot.com/local-sitemap.xml",
      "https://shutterspot.com/shop-by-room-sitemap.xml",
    ];
    expect(overviewInventoryCollectionsFromSource("pages", site)).toEqual([
      "pages",
      "hunter-douglas",
      "location",
      "promotion",
      "shop-by-room",
    ]);
  });

  it("Posts returns posts collection", () => {
    const site = shutterSpotSite();
    expect(overviewInventoryCollectionsFromSource("posts", site)).toEqual(["posts"]);
  });

  it("SAP returns service-area REST collection", () => {
    const site = shutterSpotSite();
    expect(overviewInventoryCollectionsFromSource("sap", site)).toEqual(["service-area"]);
  });

  it("SAP prefers non-location manualEndpoint over sitemap filename", () => {
    const site = shutterSpotSite();
    site.manualEndpoint = "service-areas";
    expect(overviewInventoryCollectionsFromSource("sap", site)).toEqual(["service-areas"]);
  });
});

describe("overviewInventoryCollectionsForSite", () => {
  it("uses Pages-bucket collections when property has detected sitemaps", () => {
    const site = shutterSpotSite();
    expect(overviewInventoryCollectionsForSite(site, "pages")).toEqual([
      "pages",
      "hunter-douglas",
      "location",
      "promotion",
    ]);
  });
});

describe("overviewUrlsFromInventoryRows", () => {
  it("filters inventory rows by requested collections", () => {
    const rows: OverviewInventoryRow[] = [
      { id: 1, url: "https://shutterspot.com/about/", collection: "pages", fields: { title: "", meta: "", keyword: "" } },
      { id: 2, url: "https://shutterspot.com/blog/post/", collection: "posts", fields: { title: "", meta: "", keyword: "" } },
      { id: 3, url: "https://shutterspot.com/promo/", collection: "promotion", fields: { title: "", meta: "", keyword: "" } },
    ];
    expect(overviewUrlsFromInventoryRows(rows, ["pages", "promotion"])).toEqual([
      "https://shutterspot.com/about/",
      "https://shutterspot.com/promo/",
    ]);
  });
});

describe("canLoadOverviewSitemapSource", () => {
  it("returns true when site has sitemaps and WordPress credentials", () => {
    expect(canLoadOverviewSitemapSource(shutterSpotSite(), "pages")).toBe(true);
  });

  it("returns true for SAP when credentials exist even without entity sitemap", () => {
    const site = shutterSpotSite();
    delete site.entitySitemapUrl;
    expect(canLoadOverviewSitemapSource(site, "sap")).toBe(true);
  });

  it("returns true for pages even when all child sitemaps are excluded", () => {
    const site = shutterSpotSite();
    site.sitemaps!.disabledChildSitemapUrls = [...(site.sitemaps!.childSitemaps ?? [])];
    expect(resolveOverviewSitemapUrls(site, "pages")).toEqual([]);
    expect(canLoadOverviewSitemapSource(site, "pages")).toBe(true);
  });

  it("overviewInventoryCollectionsForOverviewLoad includes CPT collections for pages bucket", () => {
    const site = shutterSpotSite();
    const cols = overviewInventoryCollectionsForOverviewLoad(site, "pages");
    expect(cols).toContain("pages");
    expect(cols).toContain("hunter-douglas");
    expect(cols).toContain("promotion");
  });
});

describe("pageSitemapXmlUrlForPlay", () => {
  it("uses the listed page-sitemap.xml child when present", () => {
    expect(pageSitemapXmlUrlForPlay(shutterSpotSite())).toBe(
      "https://shutterspot.com/page-sitemap.xml",
    );
  });

  it("defaults to /page-sitemap.xml when no page child is listed", () => {
    const site = shutterSpotSite();
    site.sitemaps = undefined;
    expect(pageSitemapXmlUrlForPlay(site)).toBe("https://shutterspot.com/page-sitemap.xml");
  });
});
