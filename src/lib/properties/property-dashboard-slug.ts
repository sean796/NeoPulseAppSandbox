import type { WordPressSite } from "@/components/integrations/types";

/** Display name → URL slug: lowercase, spaces/punctuation → hyphens (e.g. Advance Blinds → advance-blinds). */
export function propertyDashboardSlugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Hostname fallback when name is empty (www + TLD stripped, dots → hyphens). */
export function propertyDashboardSlugFromHostname(hostname: string): string {
  const host = hostname.trim().toLowerCase().replace(/^www\./, "");
  if (!host) return "";
  const parts = host.split(".").filter(Boolean);
  const withoutTld = parts.length >= 2 ? parts.slice(0, -1).join(".") : host;
  return withoutTld.replace(/\./g, "-");
}

export function propertyDashboardSlug(
  site: Pick<WordPressSite, "name" | "siteUrl">,
): string {
  const fromName = propertyDashboardSlugFromName(site.name ?? "");
  if (fromName) return fromName;
  const raw = site.siteUrl?.trim() ?? "";
  if (!raw) return "";
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return propertyDashboardSlugFromHostname(url.hostname);
  } catch {
    return propertyDashboardSlugFromHostname(raw);
  }
}

/** Path for Properties: always /dashboard/{slug} (including first client). */
export function propertyDashboardPath(
  site: Pick<WordPressSite, "name" | "siteUrl">,
): string {
  const slug = propertyDashboardSlug(site);
  return slug ? `/dashboard/${slug}` : "/dashboard";
}

/** Second path segment under /dashboard, or null for bare /dashboard. */
export function propertySlugFromDashboardPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "dashboard") return null;
  const slug = parts[1]?.trim().toLowerCase() ?? "";
  return slug || null;
}

export function findSiteByDashboardSlug(
  sites: readonly Pick<WordPressSite, "id" | "name" | "siteUrl">[],
  slug: string,
): Pick<WordPressSite, "id" | "name" | "siteUrl"> | undefined {
  const needle = slug.trim().toLowerCase();
  if (!needle) return undefined;
  return sites.find((s) => propertyDashboardSlug(s) === needle);
}
