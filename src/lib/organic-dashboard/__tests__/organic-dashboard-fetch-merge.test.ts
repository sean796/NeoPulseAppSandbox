import { describe, expect, it } from "vitest";
import { mergeOrganicDashboardBundleParts } from "@/lib/organic-dashboard/organic-dashboard-fetch";
import type { OrganicDashboardBundleResponse } from "@/lib/organic-dashboard/organic-dashboard-types";

describe("mergeOrganicDashboardBundleParts", () => {
  it("merges ga4, gsc, and semrush from parallel part responses", () => {
    const meta = {
      fetchedAt: "2026-01-01T00:00:00Z",
      primary: { startDate: "2025-07-01", endDate: "2025-12-31" },
      compare: { startDate: "2025-01-01", endDate: "2025-06-30" },
    };

    const ga4Part: OrganicDashboardBundleResponse = {
      success: true,
      meta,
      ga4: { conversions: { current: 123, previous: 100, change: 23, changePercent: 23 } },
      gsc: { skipped: true, reason: "partial_request" },
      semrush: { skipped: true, reason: "partial_request" },
      sources: { ga4: "ok", gsc: "skipped", semrush: "skipped" },
    };

    const gscPart: OrganicDashboardBundleResponse = {
      success: true,
      meta,
      ga4: { skipped: true, reason: "partial_request" },
      gsc: { success: true, property: "https://example.com/" },
      semrush: { skipped: true, reason: "partial_request" },
      sources: { ga4: "skipped", gsc: "ok", semrush: "skipped" },
    };

    const merged = mergeOrganicDashboardBundleParts([ga4Part, gscPart]);

    expect(merged.ga4).toEqual({ conversions: { current: 123, previous: 100, change: 23, changePercent: 23 } });
    expect(merged.gsc).toEqual({ success: true, property: "https://example.com/" });
    expect(merged.sources?.ga4).toBe("ok");
    expect(merged.sources?.gsc).toBe("ok");
  });

  it("merges googleAds from the googleAds part response", () => {
    const meta = {
      fetchedAt: "2026-01-01T00:00:00Z",
      primary: { startDate: "2025-09-01", endDate: "2025-09-30" },
      compare: { startDate: "2025-08-01", endDate: "2025-08-31" },
    };
    const monolithStub: OrganicDashboardBundleResponse = {
      success: true,
      meta,
      ga4: { conversions: { current: 289, previous: 200, change: 89, changePercent: 44.5 } },
      gsc: { success: true },
      semrush: { skipped: true, reason: "semrush_error" },
      sources: { ga4: "ok", gsc: "ok", semrush: "error" },
    };
    const adsPart: OrganicDashboardBundleResponse = {
      success: true,
      meta,
      ga4: { skipped: true, reason: "partial_request" },
      googleAds: {
        success: true,
        customerId: "5619137403",
        currencyCode: "CAD",
        account: { impressions: 1, clicks: 1, costMicros: 1, conversions: 1, ctr: 0, averageCpc: 0 },
        compareAccount: { impressions: 0, clicks: 0, costMicros: 0, conversions: 0, ctr: 0, averageCpc: 0 },
        dailySeries: [],
      },
      sources: { ga4: "skipped", gsc: "skipped", semrush: "skipped", googleAds: "ok" },
    };
    const merged = mergeOrganicDashboardBundleParts([monolithStub, adsPart]);
    expect(merged.googleAds).toMatchObject({ success: true, customerId: "5619137403" });
    expect(merged.sources?.googleAds).toBe("ok");
  });

  it("merges ndusLeads from the ndusLeads part response", () => {
    const meta = {
      fetchedAt: "2026-01-01T00:00:00Z",
      primary: { startDate: "2025-09-01", endDate: "2025-09-30" },
      compare: { startDate: "2025-08-01", endDate: "2025-08-31" },
    };
    const base: OrganicDashboardBundleResponse = {
      success: true,
      meta,
      ga4: { skipped: true, reason: "partial_request" },
      sources: { ga4: "skipped", gsc: "skipped", semrush: "skipped" },
    };
    const ndusPart: OrganicDashboardBundleResponse = {
      success: true,
      meta,
      ndusLeads: {
        success: true,
        siteId: "shutterspot",
        siteName: "Shutter Spot",
        siteUrl: "https://shutterspot.com",
        primary: {
          leads: 7,
          spam: 0,
          by_source: { google_organic: 5, referral: 2 },
          by_form: { Contact: 7 },
        },
      },
      sources: {
        ga4: "skipped",
        gsc: "skipped",
        semrush: "skipped",
        ndusLeads: "ok",
      },
    };
    const merged = mergeOrganicDashboardBundleParts([base, ndusPart]);
    expect(merged.ndusLeads).toMatchObject({ success: true, siteId: "shutterspot" });
    expect(merged.sources?.ndusLeads).toBe("ok");
  });

  it("merges gmbLeads from the gmbLeads part response", () => {
    const meta = {
      fetchedAt: "2026-01-01T00:00:00Z",
      primary: { startDate: "2025-09-01", endDate: "2025-09-30" },
      compare: { startDate: "2025-08-01", endDate: "2025-08-31" },
    };
    const base: OrganicDashboardBundleResponse = {
      success: true,
      meta,
      ga4: { skipped: true, reason: "partial_request" },
      sources: { ga4: "skipped", gsc: "skipped", semrush: "skipped" },
    };
    const gmbPart: OrganicDashboardBundleResponse = {
      success: true,
      meta,
      gmbLeads: {
        success: true,
        locationId: "1234567890",
        primary: { calls: 4, chat: 1, directions: 9, websiteClicks: 12 },
        compare: { calls: 2, chat: 0, directions: 5, websiteClicks: 8 },
      },
      sources: {
        ga4: "skipped",
        gsc: "skipped",
        semrush: "skipped",
        gmbLeads: "ok",
      },
    };
    const merged = mergeOrganicDashboardBundleParts([base, gmbPart]);
    expect(merged.gmbLeads).toMatchObject({
      success: true,
      locationId: "1234567890",
      primary: { calls: 4, chat: 1 },
    });
    expect(merged.sources?.gmbLeads).toBe("ok");
  });
});
