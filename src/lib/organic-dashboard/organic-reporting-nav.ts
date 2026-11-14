import type { NavigateFunction } from "react-router-dom";
import { isManagerTabId } from "@/lib/manager-tab-routes";

export const ORGANIC_REPORTING_MANAGER_TAB = "organic-reporting";

export const NEO_PULSE_OPEN_ORGANIC_REPORTING_EVENT = "neo-pulse-open-organic-reporting";

export type OpenOrganicReportingDetail = { siteId: string };

/** Index shell paths (`/`, `/dashboard/advance-blinds`, `/organic-reporting`, …). */
export function isIndexShellPath(pathname: string): boolean {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  let path = pathname || "/";
  if (base && (path === base || path.startsWith(`${base}/`))) {
    path = path.slice(base.length) || "/";
  }
  if (!path.startsWith("/")) path = `/${path}`;
  if (path === "/") return true;
  const first = path.split("/").filter(Boolean)[0] ?? "";
  return isManagerTabId(first);
}

/** Shareable deep link (cold open, bookmarks). */
export function navigateToOrganicReporting(navigate: NavigateFunction, siteId: string): void {
  navigate(`/sites/${siteId}/organic`, { flushSync: true });
}

/**
 * From the Index shell, switch the Reporting tab in place.
 * Standalone pages use the dedicated reporting route, which hands back to `/organic-reporting`.
 */
export function openOrganicReporting(
  navigate: NavigateFunction,
  pathname: string,
  siteId: string,
): void {
  if (isIndexShellPath(pathname)) {
    window.dispatchEvent(
      new CustomEvent(NEO_PULSE_OPEN_ORGANIC_REPORTING_EVENT, {
        detail: { siteId } satisfies OpenOrganicReportingDetail,
      }),
    );
    return;
  }
  navigateToOrganicReporting(navigate, siteId);
}
