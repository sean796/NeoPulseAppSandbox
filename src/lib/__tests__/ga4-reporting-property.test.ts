import { describe, expect, it, vi, beforeEach } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";

vi.mock("@/components/integrations/storage", () => ({
  getStoredSites: vi.fn(() => []),
  saveSites: vi.fn(),
  fetchWordPressSitesMirror: vi.fn(async () => ({ ok: true, sites: [] })),
}));

vi.mock("@/lib/agent-runs/resolve-agent-run-site", () => ({
  findConnectedWordPressSite: vi.fn(() => null),
}));

import { getStoredSites } from "@/components/integrations/storage";
import { resolveGa4PropertyIdForReporting } from "@/lib/ga4-reporting-property";

function site(partial: Partial<WordPressSite>): WordPressSite {
  return {
    id: "test",
    name: "Blind Magic",
    siteUrl: "https://blindmagic.com",
    username: "u",
    appPassword: "p",
    connectedAt: 0,
    ...partial,
  };
}

describe("resolveGa4PropertyIdForReporting", () => {
  beforeEach(() => {
    vi.mocked(getStoredSites).mockReturnValue([]);
  });

  it("uses ga4PropertyId on the site", () => {
    expect(resolveGa4PropertyIdForReporting(site({ ga4PropertyId: "498324127" }))).toBe(
      "498324127",
    );
  });

  it("does not treat googleAdsCustomerId as GA4 property id", () => {
    expect(resolveGa4PropertyIdForReporting(site({ googleAdsCustomerId: "5619137403" }))).toBe("");
  });

  it("falls back to stored site row by id", () => {
    const row = site({ id: "abc", ga4PropertyId: "111222333" });
    vi.mocked(getStoredSites).mockReturnValue([row]);
    expect(resolveGa4PropertyIdForReporting(site({ id: "abc", ga4PropertyId: "" }))).toBe(
      "111222333",
    );
  });
});
