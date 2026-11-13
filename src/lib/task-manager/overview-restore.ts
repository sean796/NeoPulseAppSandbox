import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import {
  wordpressSiteCanonicalName,
  wordpressSiteMenuDisplayName,
} from "@/lib/wordpress-site-display-name";

const KEY = "neo-pulse-task-overview-restore";
export const OVERVIEW_TASK_RESTORE_EVENT = "neo-pulse-overview-task-restore";
export const OVERVIEW_TASK_CLIENT_QUERY = "client";

export type OverviewTaskRestoreIntent = {
  siteId?: string;
  sitemapSource?: OverviewSitemapSource;
  /** Human-readable client label for the task URL (never a numeric site id). */
  clientName?: string;
};

function parseIntent(raw: string): OverviewTaskRestoreIntent | null {
  const parsed = JSON.parse(raw) as OverviewTaskRestoreIntent;
  if (!parsed || typeof parsed !== "object") return null;
  const sitemapSource =
    parsed.sitemapSource === "posts" ||
    parsed.sitemapSource === "pages" ||
    parsed.sitemapSource === "sap"
      ? parsed.sitemapSource
      : undefined;
  const siteId = typeof parsed.siteId === "string" ? parsed.siteId.trim() : undefined;
  const clientName = typeof parsed.clientName === "string" ? parsed.clientName.trim() : undefined;
  if (!sitemapSource && !siteId && !clientName) return null;
  return {
    siteId: siteId || undefined,
    sitemapSource,
    clientName: clientName || undefined,
  };
}

export function writeOverviewTaskRestoreIntent(intent: OverviewTaskRestoreIntent): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(intent));
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OVERVIEW_TASK_RESTORE_EVENT, { detail: intent }));
  }
}

/** Read restore intent without clearing it (site-change race with openTask). */
export function peekOverviewTaskRestoreIntent(): OverviewTaskRestoreIntent | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return parseIntent(raw);
  } catch {
    return null;
  }
}

export function consumeOverviewTaskRestoreIntent(): OverviewTaskRestoreIntent | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return parseIntent(raw);
  } catch {
    return null;
  }
}

/**
 * Studio task deep link: source bucket + connected client NAME (not site id).
 * Example: `/generator/opt?source=posts&client=In%20the%20Shade`
 */
export function buildAutoSeoTaskHref(
  sitemapSource: OverviewSitemapSource,
  clientName?: string,
): string {
  const params = new URLSearchParams();
  params.set("source", sitemapSource);
  const name = clientName?.trim();
  if (name) params.set(OVERVIEW_TASK_CLIENT_QUERY, name);
  return `/generator/opt?${params.toString()}`;
}

export function parseOverviewSourceFromPath(
  pathname: string,
  search: string,
): OverviewSitemapSource | null {
  try {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const fromQuery = params.get("source")?.trim();
    if (fromQuery === "posts" || fromQuery === "pages" || fromQuery === "sap") return fromQuery;
  } catch {
    /* ignore */
  }
  void pathname;
  return null;
}

export function parseOverviewClientNameFromSearch(search: string): string | null {
  try {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const client = params.get(OVERVIEW_TASK_CLIENT_QUERY)?.trim();
    return client || null;
  } catch {
    return null;
  }
}

function normalizeClientLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Match Integrations site by display name (never by numeric id string in the URL). */
export function resolveSiteIdByClientName(
  sites: WordPressSite[],
  clientName: string,
): string | null {
  const needle = normalizeClientLabel(clientName);
  if (!needle) return null;
  for (const site of sites) {
    const labels = [
      wordpressSiteMenuDisplayName(site),
      wordpressSiteCanonicalName(site),
      site.name?.trim() ?? "",
      site.napInfo?.name?.trim() ?? "",
    ];
    if (labels.some((label) => label && normalizeClientLabel(label) === needle)) {
      return site.id;
    }
  }
  return null;
}
