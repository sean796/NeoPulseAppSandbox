import { getStoredSites } from "@/components/integrations/storage";
import type { WordPressSite } from "@/components/integrations/types";
import type { MasterInstructionSource } from "@/lib/master-instructions-storage";
import { isShutterSpotProperty } from "@/lib/shutter-spot-site";

export const PROFILE_BRAND_NAMING_FILENAME = "profile-brand-naming.txt";

export const KWB_BRAND_RULE_CONTENT = `[KWB brand naming]
preferred_public_names\tKWB Accountants & Advisors; KWB CPAs
discouraged_public_name\tKWB LLP
rule\tRefer to the firm as KWB Accountants & Advisors or KWB CPAs in client-facing copy, titles, meta descriptions, headings, FAQs, and first-party authority statements. Do not use KWB LLP unless quoting the legal entity name in formal compliance context.

[KWB office geography]
office_locations\tYellowknife; Red Deer; Edmonton; other locations
prohibited_framing\tDo not state or imply that KWB is located only in Edmonton or that Edmonton is the sole office.
rule\tKWB has offices and team members in multiple cities including Yellowknife, Red Deer, Edmonton, and other locations. Use multi-location or region-wide framing when describing where the firm operates. Do not default copy to Edmonton-based or located in Edmonton as if that were the only office unless the page topic is specifically about the Edmonton office.`;

export const SHUTTER_SPOT_BRAND_RULE_CONTENT = `[Shutter Spot brand naming]
canonical_public_name\tShutter Spot
discouraged_public_names\tBlind Spot; blind spot
google_ads_mcc_label\tBlind Spot (Google Ads sub-account label only; never use in client-facing copy)
rule\tThe Integrations property name is Shutter Spot. Use exactly "Shutter Spot" in all client-facing copy, titles, meta descriptions, headings, FAQs, schema, and first-party authority statements. Do not substitute Blind Spot, blind spot, or any other name. Do not infer a different brand from the Google Ads MCC label or from other portfolio clients. No renaming or post-processing of the business name.`;

export function isKwbSite(siteUrl: string, siteName: string): boolean {
  const hay = `${siteUrl} ${siteName}`.toLowerCase();
  return hay.includes("kwbllp") || /(^|[^a-z])kwb([^a-z]|$)/.test(hay);
}

export function readStoredSite(siteId: string): WordPressSite | null {
  return getStoredSites().find((s) => s.id === siteId) ?? null;
}

export function kwbProfileBrandNamingSource(): MasterInstructionSource {
  return {
    name: PROFILE_BRAND_NAMING_FILENAME,
    content: KWB_BRAND_RULE_CONTENT,
    uploadedAt: Date.now(),
    kind: "semantic-triples",
  };
}

export function shutterSpotProfileBrandNamingSource(): MasterInstructionSource {
  return {
    name: PROFILE_BRAND_NAMING_FILENAME,
    content: SHUTTER_SPOT_BRAND_RULE_CONTENT,
    uploadedAt: Date.now(),
    kind: "semantic-triples",
  };
}

export function profileMasterRuleSourcesForSite(args: {
  siteId: string;
  siteUrl?: string;
  siteName?: string;
}): MasterInstructionSource[] {
  const stored = readStoredSite(args.siteId);
  const siteUrl = (args.siteUrl || stored?.siteUrl || stored?.productionSiteUrl || "").trim();
  const siteName = (args.siteName || stored?.name || "").trim();
  if (stored && isShutterSpotProperty(stored)) {
    return [shutterSpotProfileBrandNamingSource()];
  }
  if (
    isShutterSpotProperty({
      name: siteName,
      siteUrl,
      productionSiteUrl: stored?.productionSiteUrl,
      googleAdsCustomerId: stored?.googleAdsCustomerId,
    })
  ) {
    return [shutterSpotProfileBrandNamingSource()];
  }
  if (!isKwbSite(siteUrl, siteName)) return [];
  return [kwbProfileBrandNamingSource()];
}
