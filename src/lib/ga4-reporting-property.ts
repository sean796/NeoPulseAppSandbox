import type { WordPressSite } from "@/components/integrations/types";
import {
  fetchWordPressSitesMirror,
  getStoredSites,
  saveSites,
} from "@/components/integrations/storage";
import { findConnectedWordPressSite } from "@/lib/agent-runs/resolve-agent-run-site";
import { normalizeGa4PropertyIdForApi } from "@/lib/ga4-property-id";
import { wordPressSiteHostKey } from "@/lib/wordpress-site-host-key";

function pickGa4PropertyIdFromSite(site: WordPressSite | null | undefined): string {
  if (!site) return "";
  try {
    return normalizeGa4PropertyIdForApi(site.ga4PropertyId?.trim() ?? "");
  } catch {
    return "";
  }
}

function mirrorRowForSite(site: WordPressSite, serverSites: WordPressSite[]): WordPressSite | undefined {
  const byId = serverSites.find((s) => s.id === site.id);
  if (byId) return byId;
  const host = wordPressSiteHostKey(site.siteUrl);
  if (host) {
    const byHost = serverSites.find((s) => wordPressSiteHostKey(s.siteUrl) === host);
    if (byHost) return byHost;
  }
  const nameKey = (site.name ?? "").trim().toLowerCase();
  if (!nameKey) return undefined;
  return serverSites.find((s) => (s.name ?? "").trim().toLowerCase() === nameKey);
}

/** GA reporting: site field, stored copy, connected site (Settings GA service account for all clients). */
export function resolveGa4PropertyIdForReporting(site: WordPressSite): string {
  const direct = pickGa4PropertyIdFromSite(site);
  if (direct) return direct;
  const stored = getStoredSites().find((s) => s.id === site.id);
  const fromStored = pickGa4PropertyIdFromSite(stored);
  if (fromStored) return fromStored;
  const connected = site.id ? findConnectedWordPressSite(site.id) : null;
  const fromConnected = pickGa4PropertyIdFromSite(connected);
  if (fromConnected) return fromConnected;
  return "";
}

/** Local site fields first; then server property mirror (Integrations sites.json). */
export async function resolveGa4PropertyIdForReportingAsync(site: WordPressSite): Promise<string> {
  const sync = resolveGa4PropertyIdForReporting(site);
  if (sync) return sync;
  const mirrorResult = await fetchWordPressSitesMirror();
  if (!mirrorResult.ok || mirrorResult.sites.length === 0) return sync;
  const serverSites = mirrorResult.sites;
  const row = mirrorRowForSite(site, serverSites);
  const fromMirror = pickGa4PropertyIdFromSite(row);
  if (!fromMirror) return sync;
  const local = getStoredSites();
  let idx = local.findIndex((s) => s.id === site.id);
  if (idx < 0) {
    const nameKey = (site.name ?? "").trim().toLowerCase();
    if (nameKey) {
      idx = local.findIndex((s) => (s.name ?? "").trim().toLowerCase() === nameKey);
    }
  }
  if (idx >= 0 && !pickGa4PropertyIdFromSite(local[idx]!)) {
    const next = [...local];
    next[idx] = { ...next[idx]!, ga4PropertyId: fromMirror };
    saveSites(next);
  }
  return fromMirror;
}
