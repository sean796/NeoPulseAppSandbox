import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";

function pathOnly(raw: string | null | undefined): string {
  const value = raw?.trim() ?? "";
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) {
    try {
      return new URL(value).pathname || "";
    } catch {
      return "";
    }
  }
  return value.startsWith("/") ? value : `/${value}`;
}

/** Idle / root label for the active sitemap source. */
function sitemapRootPath(source: OverviewSitemapSource): string {
  if (source === "sap") return "/service-area";
  if (source === "posts") return "/post";
  return "/";
}

/** Studio header URL box: path only. Never the domain. Never sitemap filename chrome. */
export function overviewStudioUrlBoxLabel(input: {
  pathLabel?: string | null;
  sitemapSource?: OverviewSitemapSource | null;
}): string {
  const path = pathOnly(input.pathLabel);
  if (path && path !== "/") return path;
  return sitemapRootPath(input.sitemapSource ?? "pages");
}
