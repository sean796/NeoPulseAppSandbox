import type { WordPressSite } from "@/components/integrations/types";

/** Hostname without www, TLD stripped, dots → hyphens (e.g. intheshadeflorida.com → intheshadeflorida). */
export function propertyDashboardSlugFromHostname(hostname: string): string {
  const host = hostname.trim().toLowerCase().replace(/^www\./, "");
  if (!host) return "";
  const parts = host.split(".").filter(Boolean);
  const withoutTld = parts.length >= 2 ? parts.slice(0, -1).join(".") : host;
  return withoutTld.replace(/\./g, "-");
}

export function propertyDashboardSlug(site: Pick<WordPressSite, "siteUrl">): string {
  const raw = site.siteUrl?.trim() ?? "";
  if (!raw) return "";
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return propertyDashboardSlugFromHostname(url.hostname);
  } catch {
    return propertyDashboardSlugFromHostname(raw);
  }
}

/** Path for Properties: first dock client stays bare /dashboard; others use /dashboard/{slug}. */
export function propertyDashboardPath(
  site: Pick<WordPressSite, "siteUrl">,
  isHomeFirstClient: boolean,
): string {
  if (isHomeFirstClient) return "/dashboard";
  const slug = propertyDashboardSlug(site);
  return slug ? `/dashboard/${slug}` : "/dashboard";
}

/** Second path segment under /dashboard, or null for home. */
export function propertySlugFromDashboardPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "dashboard") return null;
  const slug = parts[1]?.trim().toLowerCase() ?? "";
  return slug || null;
}

export function findSiteByDashboardSlug(
  sites: readonly Pick<WordPressSite, "id" | "siteUrl">[],
  slug: string,
): Pick<WordPressSite, "id" | "siteUrl"> | undefined {
  const needle = slug.trim().toLowerCase();
  if (!needle) return undefined;
  return sites.find((s) => propertyDashboardSlug(s) === needle);
}
