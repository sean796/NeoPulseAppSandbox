import { describe, expect, it } from "vitest";
import {
  aggregateOrganicSeoLeadDays,
  buildNdusLeadsSummary,
  sumOrganicSeoSources,
} from "@/lib/organic-dashboard/organic-dashboard-ndus-leads";

describe("sumOrganicSeoSources", () => {
  it("sums Google search only", () => {
    expect(
      sumOrganicSeoSources({
        google_organic: 7,
        google_ads: 50,
        other_search: 2,
        referral: 1,
        direct: 1,
        imported: 56,
      }),
    ).toBe(7);
  });

  it("returns 0 for empty or missing maps", () => {
    expect(sumOrganicSeoSources(undefined)).toBe(0);
    expect(sumOrganicSeoSources(null)).toBe(0);
    expect(sumOrganicSeoSources({})).toBe(0);
  });
});

describe("aggregateOrganicSeoLeadDays", () => {
  it("counts Google search only and drops other sources", () => {
    const out = aggregateOrganicSeoLeadDays([
      {
        by_source: { google_organic: 4, referral: 1 },
        by_form: { Contact: 5 },
        spam: 1,
      },
      {
        by_source: { google_organic: 2, google_ads: 8, imported: 3 },
        by_form: { Quote: 10 },
        spam: 0,
      },
    ]);
    expect(out.leads).toBe(6);
    expect(out.spam).toBe(1);
    expect(out.by_source).toEqual({ google_organic: 6 });
  });

  it("returns null summary when Google search leads are zero", () => {
    const summary = buildNdusLeadsSummary(
      {
        success: true,
        primary: {
          leads: 56,
          spam: 0,
          by_source: { imported: 56 },
          by_form: { Contact: 56 },
        },
      },
      false,
    );
    expect(summary).toBeNull();
  });
});

describe("buildNdusLeadsSummary MoM", () => {
  it("computes lead delta percent against compare period", () => {
    const summary = buildNdusLeadsSummary(
      {
        success: true,
        siteName: "Shutter Spot",
        siteUrl: "https://shutterspot.com",
        labels: { google_organic: "Google search" },
        primary: {
          leads: 12,
          spam: 0,
          by_source: { google_organic: 8, direct: 4 },
          by_form: { Contact: 12 },
        },
        compare: {
          leads: 8,
          spam: 0,
          by_source: { google_organic: 5, direct: 3 },
          by_form: { Contact: 8 },
        },
      },
      true,
    );
    expect(summary).not.toBeNull();
    expect(summary!.leads).toBe(8);
    expect(summary!.compareLeads).toBe(5);
    expect(summary!.leadsDelta.deltaPercent).toBe(60);
    expect(summary!.leadsDelta.deltaPositive).toBe(true);
    expect(summary!.bySource[0]).toMatchObject({
      key: "google_organic",
      label: "Google search",
      count: 8,
    });
  });

  it("omits compare when showCompare is false", () => {
    const summary = buildNdusLeadsSummary(
      {
        success: true,
        primary: {
          leads: 3,
          spam: 0,
          by_source: { google_organic: 3 },
          by_form: {},
        },
        compare: {
          leads: 1,
          spam: 0,
          by_source: { google_organic: 1 },
          by_form: {},
        },
      },
      false,
    );
    expect(summary!.compareLeads).toBeNull();
    expect(summary!.leadsDelta.deltaPercent).toBeNull();
  });
});
