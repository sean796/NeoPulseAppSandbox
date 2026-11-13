import type { WordPressSite } from "@/components/integrations/types";
import {
  fetchWordPressSitesMirror,
  getStoredSites,
  loadSitesFromServerAlways,
} from "@/components/integrations/storage";
import { fetchAgentRun } from "@/lib/agent-runs-api";
import type { AgentRun } from "@/lib/agent-runs-types";
import { getPublicSiteUrl } from "@/lib/wordpress-site-public-url";
import { wordpressSiteDisplayName } from "@/lib/wordpress-site-display-name";

/** Site ids attached to this agent run. Not the header active site. */
export function resolveAgentRunSiteIds(run: AgentRun): string[] {
  const payload = run.plan?.executionPayload as
    | { siteId?: string; wordpressSiteId?: string }
    | undefined;
  const contract = run.plan?.clientRunContract as { siteId?: string } | undefined;
  const ids = [
    run.context?.siteId,
    payload?.siteId,
    payload?.wordpressSiteId,
    contract?.siteId,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function findConnectedWordPressSite(
  siteId: string,
  sites: WordPressSite[] = [],
): WordPressSite | undefined {
  const id = siteId.trim();
  if (!id) return undefined;
  return sites.find((site) => site.id === id) ?? getStoredSites().find((site) => site.id === id);
}

/** WordPress site for this agent (workflow client / run site). Not the header selection. */
export function resolveAgentRunWordPressSite(
  run: AgentRun,
  sites: WordPressSite[] = [],
  missingError = "WordPress site not found for this task.",
): WordPressSite {
  const ids = resolveAgentRunSiteIds(run);
  for (const id of ids) {
    const site = findConnectedWordPressSite(id, sites);
    if (site) return site;
  }
  throw new Error(missingError);
}

/** Keep the workflow client on the run. Shared compiled tasks can drop it. */
export function pinAgentRunSiteId(run: AgentRun, siteId: string): AgentRun {
  const id = siteId.trim();
  if (!id) return run;
  const payload = (run.plan?.executionPayload ?? {}) as Record<string, unknown>;
  const contract = (run.plan?.clientRunContract ?? {}) as Record<string, unknown>;
  return {
    ...run,
    context: { ...run.context, siteId: id },
    plan: {
      ...run.plan,
      executionPayload: {
        ...payload,
        siteId: id,
        wordpressSiteId: id,
      },
      clientRunContract: {
        ...contract,
        siteId: id,
      },
    },
  };
}

export function mergeAgentRunSiteFromSeed(fetched: AgentRun, seed: AgentRun): AgentRun {
  const fetchedIds = resolveAgentRunSiteIds(fetched);
  if (fetchedIds.some((id) => findConnectedWordPressSite(id))) return fetched;
  const seedId = resolveAgentRunSiteIds(seed)[0];
  if (!seedId) return fetched;
  return pinAgentRunSiteId(fetched, seedId);
}

/** Display name + URL for a connected property row (not the header active site). */
export function resolveWordPressSiteIdentity(
  siteId: string,
  sites: WordPressSite[] = [],
): { siteName: string; siteUrl?: string } {
  const site = findConnectedWordPressSite(siteId, sites);
  if (!site) return { siteName: "" };
  const siteUrl = getPublicSiteUrl(site) || site.siteUrl || site.productionSiteUrl;
  return {
    siteName: wordpressSiteDisplayName(site),
    siteUrl: siteUrl?.trim() || undefined,
  };
}

/** Client identity for an agent run (workflow client / task site). */
export function resolveAgentRunSiteIdentity(
  run: AgentRun,
  sites: WordPressSite[] = [],
): { siteName: string; siteUrl?: string } {
  for (const id of resolveAgentRunSiteIds(run)) {
    const resolved = resolveWordPressSiteIdentity(id, sites);
    if (resolved.siteName.trim()) return resolved;
  }
  const payload = run.plan?.executionPayload as Record<string, unknown> | undefined;
  const contract = run.plan?.clientRunContract as Record<string, unknown> | undefined;
  const siteName =
    textField(payload, "businessName")
    || textField(payload, "siteName")
    || textField(contract, "businessName");
  const siteUrl =
    textField(payload, "siteUrl")
    || textField(payload, "productionSiteUrl")
    || textField(contract, "siteUrl")
    || textField(contract, "productionSiteUrl");
  return { siteName, siteUrl: siteUrl || undefined };
}

export async function fetchAgentRunSiteIdentity(
  teamId: number,
  agentRunId: number,
): Promise<{ siteName: string; siteUrl?: string }> {
  if (agentRunId <= 0 || teamId <= 0) return { siteName: "" };
  const run = await fetchAgentRun(teamId, agentRunId);
  if (!run) return { siteName: "" };
  return resolveAgentRunSiteIdentity(run);
}

function textField(source: Record<string, unknown> | undefined, key: string): string {
  const value = source?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function mergeSitePool(sites: WordPressSite[]): WordPressSite[] {
  const map = new Map<string, WordPressSite>();
  for (const site of getStoredSites()) {
    if (site?.id) map.set(site.id, site);
  }
  for (const site of sites) {
    if (site?.id) map.set(site.id, site);
  }
  return [...map.values()];
}

function poolHasAgentRunSite(run: AgentRun, pool: WordPressSite[]): boolean {
  return resolveAgentRunSiteIds(run).some((id) => pool.some((site) => site.id === id));
}

/**
 * Connected properties for this agent. Loads the server sites.json mirror when
 * the run's client is missing from the in-memory / localStorage list (cold start).
 */
export async function loadSitesForAgentRun(
  run: AgentRun,
  sites: WordPressSite[] = [],
): Promise<WordPressSite[]> {
  const pool = mergeSitePool(sites);
  if (poolHasAgentRunSite(run, pool)) return pool;

  const restored = await loadSitesFromServerAlways();
  const afterRestore = mergeSitePool([...pool, ...restored]);
  if (poolHasAgentRunSite(run, afterRestore)) return afterRestore;

  const mirror = await fetchWordPressSitesMirror();
  return mergeSitePool([...afterRestore, ...mirror]);
}

function siteHasPublicUrl(site: WordPressSite): boolean {
  return Boolean(getPublicSiteUrl(site).trim());
}

function namesMatch(a: string, b: string): boolean {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  return Boolean(left && right && left === right);
}

/** GSC reports use the workflow client property. Connected row when present; otherwise payload URL. */
export function resolveGscReportingSite(
  run: AgentRun,
  sites: WordPressSite[] = [],
): WordPressSite {
  const ids = resolveAgentRunSiteIds(run);
  const pool = mergeSitePool(sites);
  for (const id of ids) {
    const site = pool.find((row) => row.id === id) ?? findConnectedWordPressSite(id, sites);
    if (site && siteHasPublicUrl(site)) return site;
  }
  const payload = run.plan?.executionPayload as Record<string, unknown> | undefined;
  const contract = run.plan?.clientRunContract as Record<string, unknown> | undefined;
  const name =
    textField(payload, "businessName")
    || textField(payload, "siteName")
    || textField(contract, "businessName");
  if (name) {
    const byName = pool.find((row) => namesMatch(wordpressSiteDisplayName(row), name) || namesMatch(row.name, name));
    if (byName && siteHasPublicUrl(byName)) return byName;
  }
  const siteUrl =
    textField(payload, "siteUrl")
    || textField(payload, "productionSiteUrl")
    || textField(contract, "siteUrl")
    || textField(contract, "productionSiteUrl");
  for (const id of ids) {
    const site = pool.find((row) => row.id === id) ?? findConnectedWordPressSite(id, sites);
    if (site) {
      if (siteUrl) {
        return {
          ...site,
          siteUrl: site.siteUrl?.trim() || siteUrl,
          productionSiteUrl: site.productionSiteUrl?.trim() || siteUrl,
        };
      }
      return site;
    }
  }
  return {
    id: ids[0] || "gsc-report",
    name: name || "GSC report",
    siteUrl,
    productionSiteUrl: textField(payload, "productionSiteUrl") || textField(contract, "productionSiteUrl") || siteUrl,
    username: "",
    appPassword: "",
    connectedAt: 0,
  };
}
