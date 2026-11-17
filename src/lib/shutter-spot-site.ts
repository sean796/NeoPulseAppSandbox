import type { WordPressSite } from "@/components/integrations/types";

export const SHUTTER_SPOT_CANONICAL_NAME = "Blind Spot";

export const SHUTTER_SPOT_GOOGLE_ADS_CUSTOMER_ID = "7454061453";

function siteHost(site: WordPressSite): string {
  try {
    const raw = (site.productionSiteUrl || site.siteUrl || "").trim();
    if (!raw) return "";
    const url = raw.startsWith("http") ? raw : `https://${raw}`;
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Integrations property identity for shutterspot.com (public brand Blind Spot; domain stays shutterspot.com). */
export function isShutterSpotProperty(
  site: Pick<WordPressSite, "name" | "siteUrl" | "productionSiteUrl" | "googleAdsCustomerId">,
): boolean {
  const host = siteHost(site as WordPressSite);
  const name = (site.name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const adsDigits = (site.googleAdsCustomerId ?? "").replace(/\D/g, "");
  return (
    host === "shutterspot.com" ||
    name === "shutter spot" ||
    name === "shutterspot" ||
    (name === "blind spot" &&
      (host === "shutterspot.com" || adsDigits === SHUTTER_SPOT_GOOGLE_ADS_CUSTOMER_ID))
  );
}
