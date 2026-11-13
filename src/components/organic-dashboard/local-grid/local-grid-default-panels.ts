import type { WordPressSite } from "@/components/integrations/types";
import { geocodeLocalGridAddress } from "@/lib/local-grid-studio/local-grid-api";
import { createFallbackWorkspace } from "@/lib/local-grid-studio/local-grid-workspace-persist";
import type { LocalGridWorkspacePanel } from "@/lib/local-grid-studio/local-grid-workspace-panels";

/** One panel per site location, centered on the store address (geocoded). Distance 1 mile. */
export async function createDefaultPanelsForSite(
  site: WordPressSite | undefined,
  defaultSiteId: string,
  createId: () => string,
): Promise<{ panels: LocalGridWorkspacePanel[]; activePanelId: string }> {
  const kw = site?.primaryLocalKeyword?.trim() || "blinds near me";
  const locs =
    site?.locations && site.locations.length > 0
      ? site.locations
      : site?.napInfo?.locations ?? [];
  if (locs.length === 0) {
    return createFallbackWorkspace(defaultSiteId, createId);
  }

  const panels: LocalGridWorkspacePanel[] = [];
  for (let idx = 0; idx < locs.length; idx++) {
    const loc = locs[idx]!;
    const addr = [loc.address, loc.city, loc.state, loc.zip].filter(Boolean).join(", ");
    const geo = await geocodeLocalGridAddress({
      address: loc.address,
      city: loc.city,
      state: loc.state,
      zip: loc.zip,
      country: loc.country,
    });
    panels.push({
      id: `grid_${defaultSiteId}_loc_${idx + 1}`,
      siteId: defaultSiteId,
      layoutLocked: false,
      layoutSnapshot: {
        keyword: kw,
        centerLat: geo.latitude,
        centerLng: geo.longitude,
        scanSize: "7x7",
        shape: "circle",
        distance: 1,
        distanceMeasure: "mile",
        activeBusiness: {
          key: `biz:${defaultSiteId}:loc:${idx + 1}`,
          business: loc.name || site?.napInfo?.name || site?.name || "",
          address: addr,
          placeId: site?.gbpLocationId?.trim() || "",
          cid: site?.gbpLocationId?.trim() || "",
          websiteUrl: (site?.productionSiteUrl || site?.siteUrl || "").trim(),
          primaryCategory: "",
          secondaryCategories: "",
          rating: null,
          reviews: null,
          latitude: geo.latitude,
          longitude: geo.longitude,
        },
        activeScanId: null,
      },
    });
  }

  return {
    panels,
    activePanelId: panels[0]!.id,
  };
}
