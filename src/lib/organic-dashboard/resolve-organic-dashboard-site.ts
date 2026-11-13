import type { WordPressSite } from "@/components/integrations/types";

/**
 * Resolve the connected property for organic / Local Grid surfaces.
 * URL id wins when present, else the active console site. No enabled gate.
 * No silent swap to another property.
 */
export function resolveOrganicDashboardSite(
  sites: WordPressSite[],
  siteIdFromUrl: string | undefined,
  activeSiteId: string | null,
): WordPressSite | undefined {
  if (sites.length === 0) return undefined;

  if (siteIdFromUrl) {
    const byUrl = sites.find((s) => s.id === siteIdFromUrl);
    if (byUrl) return byUrl;
  }

  if (activeSiteId) {
    const byActive = sites.find((s) => s.id === activeSiteId);
    if (byActive) return byActive;
  }

  return undefined;
}
