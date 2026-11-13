import { describe, expect, it } from "vitest";
import { resolveOrganicDashboardSite } from "@/lib/organic-dashboard/resolve-organic-dashboard-site";
import type { WordPressSite } from "@/components/integrations/types";

function site(id: string, enabled = true): WordPressSite {
  return {
    id,
    name: id,
    siteUrl: `https://${id}.example/`,
    enabled,
  } as WordPressSite;
}

describe("resolveOrganicDashboardSite", () => {
  it("uses URL id when it matches a connected property", () => {
    const sites = [site("a"), site("b")];
    expect(resolveOrganicDashboardSite(sites, "b", "a")?.id).toBe("b");
  });

  it("uses active property when URL id is missing or stale", () => {
    const sites = [site("blind"), site("dm")];
    expect(resolveOrganicDashboardSite(sites, undefined, "dm")?.id).toBe("dm");
    expect(resolveOrganicDashboardSite(sites, "wp-old-id", "dm")?.id).toBe("dm");
  });

  it("honors the active site even when enabled is false", () => {
    const sites = [site("blind", false), site("custom", true)];
    expect(resolveOrganicDashboardSite(sites, undefined, "blind")?.id).toBe("blind");
    expect(resolveOrganicDashboardSite(sites, "blind", "blind")?.id).toBe("blind");
  });

  it("does not fall back to another property", () => {
    const sites = [site("first"), site("second")];
    expect(resolveOrganicDashboardSite(sites, "missing", null)).toBeUndefined();
    expect(resolveOrganicDashboardSite(sites, "missing", "gone")).toBeUndefined();
    expect(resolveOrganicDashboardSite(sites, undefined, null)).toBeUndefined();
  });
});
