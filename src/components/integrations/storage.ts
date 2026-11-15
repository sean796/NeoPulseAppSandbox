import { loadManagerSettingsFromCloud } from "@/lib/manager-cloud-settings-api";
import { applyManagerCloudSnapshotToLocalStorage } from "@/lib/manager-cloud-settings-snapshot";
import { hydrateRuntimeApiKeys } from "@/lib/api";
import { saveWordPressProperties } from "@/lib/manager-wordpress-properties-api";
import { applyGa4PropertyIdDefaults } from "@/lib/ga4-property-id-defaults";
import { applySemrushProjectDefaults } from "@/lib/semrush-project-id-defaults";
import { applyWpEngineHostingDefaults } from "@/lib/wp-engine-install-defaults";
import { wordPressSiteHostKey } from "@/lib/wordpress-site-host-key";
import {
  fetchClientSiteLogoUrl,
  resolveClientSiteOrigin,
} from "@/lib/integrations/client-site-logo";
import type { WordPressSite } from "./types";
import { WORDPRESS_SITES_STORAGE_KEY } from "./types";
import { getDeletedSitesTombstones, isSiteTombstoned } from "./storage-deleted-sites";
import {
  applyShutterSpotDisplayNameMigration,
  isStalePhoenixArizonaLocation,
  minimalSiteForLocalStorage,
  normalizeSiteEntry,
  stripInlineClientLogoFromSite,
} from "./storage-site-normalize";
import { fetchWordPressSitesMirror } from "./storage-server-sync";
import seedFile from "./default-properties-seed.json";

export {
  DELETED_WP_SITES_STORAGE_KEY,
  getDeletedSitesTombstones,
  recordDeletedSite,
  isSiteTombstoned,
} from "./storage-deleted-sites";
export type { DeletedSiteRecord } from "./storage-deleted-sites";
export {
  sortWordPressSitesByName,
  clientLogoUrlForLocalStorage,
  stripInlineClientLogoFromSite,
  slimSiteForLocalStorage,
  minimalSiteForLocalStorage,
} from "./storage-site-normalize";
export {
  syncWordPressSitesToServer,
  syncActiveWordPressSiteToServer,
  fetchWordPressSitesMirror,
} from "./storage-server-sync";
export type { WordPressSitesMirrorResult } from "./storage-server-sync";

/** Node worker override for server post creator harness (no browser localStorage). */
let serverHarnessSitesOverride: WordPressSite[] | null = null;
/** In-memory runtime store for connected WordPress sites (backed by server mirror). */
let memorySitesStore: WordPressSite[] | null = null;
/** True after the first server roster load attempt finishes (success or empty). */
let sitesServerHydrationDone = false;
/** Shared in-flight/completed hydration so boot does not flash an empty roster. */
let sitesServerHydrationPromise: Promise<WordPressSite[]> | null = null;

type SeedPasswordRow = { siteUrl?: string; appPassword?: string };

/** Passwords for rows already on the mirror. Does not add or reshape a property. */
function seedPasswordRows(): SeedPasswordRow[] {
  const raw = seedFile as { sites?: SeedPasswordRow[] } | SeedPasswordRow[];
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.sites)) return raw.sites;
  return [];
}

function seedPasswordByHost(): Map<string, string> {
  const byHost = new Map<string, string>();
  for (const site of seedPasswordRows()) {
    const host = wordPressSiteHostKey(site.siteUrl);
    const pass = site.appPassword?.trim();
    if (!host || !pass || byHost.has(host)) continue;
    byHost.set(host, pass);
  }
  return byHost;
}

const SEED_PASSWORD_BY_HOST = seedPasswordByHost();

function applySiteIntegrationDefaults(site: WordPressSite): WordPressSite {
  return applySemrushProjectDefaults(
    applyGa4PropertyIdDefaults(
      applyWpEngineHostingDefaults(applyShutterSpotDisplayNameMigration(normalizeSiteEntry(site))),
    ),
  );
}

/**
 * Vite-only first paint: main.tsx passes virtual:neo-pulse-sites-bootstrap.
 * Node workers (post creator / tsx) never import that virtual module.
 */
export function hydrateSitesBootstrap(sites: WordPressSite[] | null | undefined): void {
  if (memorySitesStore) return;
  if (!Array.isArray(sites) || sites.length === 0) return;
  const tombstones = getDeletedSitesTombstones();
  memorySitesStore = sites.filter((s) => !isSiteTombstoned(s, tombstones)).map(
    applySiteIntegrationDefaults,
  );
}

export function setServerHarnessSitesOverride(sites: WordPressSite[] | null): void {
  serverHarnessSitesOverride = sites;
}

export function hasSitesServerHydrated(): boolean {
  return sitesServerHydrationDone || Boolean(memorySitesStore && memorySitesStore.length > 0);
}

/** Deduped server roster load; safe to call from module boot and React effects. */
export function ensureSitesLoadedFromServer(): Promise<WordPressSite[]> {
  if (!sitesServerHydrationPromise) {
    sitesServerHydrationPromise = loadSitesFromServerAlways().finally(() => {
      sitesServerHydrationDone = true;
    });
  }
  return sitesServerHydrationPromise;
}

/**
 * Always load the Properties roster from the server mirror into memory.
 * A successful load replaces memory with the mirror only (no bundled seed).
 * A failed load leaves the painted roster in place.
 */
export async function loadSitesFromServerAlways(): Promise<WordPressSite[]> {
  purgeLegacyLocalStorageCaches();
  const tombstones = getDeletedSitesTombstones();
  const mirrorResult = await fetchWordPressSitesMirror();
  if (!mirrorResult.ok) {
    sitesServerHydrationDone = true;
    return getStoredSites();
  }

  const hostOf = (s: WordPressSite) => wordPressSiteHostKey(s.siteUrl) || s.id;
  const byHost = new Map<string, WordPressSite>();
  for (const s of mirrorResult.sites) {
    if (isSiteTombstoned(s, tombstones)) continue;
    byHost.set(hostOf(s), applySiteIntegrationDefaults(s));
  }

  // Prefer bootstrap/local memory credentials when mirror rows are secret-stripped.
  if (memorySitesStore?.length) {
    for (const local of memorySitesStore) {
      const host = hostOf(local);
      const cur = byHost.get(host);
      if (!cur) continue;
      if (!cur.appPassword?.trim() && local.appPassword?.trim()) {
        byHost.set(host, { ...cur, appPassword: local.appPassword });
      }
    }
  }
  for (const [host, cur] of byHost) {
    if (cur.appPassword?.trim()) continue;
    const pass = SEED_PASSWORD_BY_HOST.get(host);
    if (!pass) continue;
    byHost.set(host, { ...cur, appPassword: pass });
  }

  memorySitesStore = [...byHost.values()];
  sitesServerHydrationDone = true;
  return getStoredSites();
}

let legacyLocalStorageCachesPurged = false;

function purgeLegacyLocalStorageCaches(): void {
  if (legacyLocalStorageCachesPurged || typeof localStorage === "undefined") return;
  legacyLocalStorageCachesPurged = true;
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (
        k.startsWith("neo-pulse-site-prefetch:") ||
        k.startsWith("neo-pulse-overview-rows-local:") ||
        k.startsWith("neo-pulse-overview-active-row-body:") ||
        k === "kb_files"
      ) {
        toRemove.push(k);
      }
    }
    for (const k of toRemove) {
      localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

function tryPersistSitesJson(json: string): boolean {
  if (typeof localStorage === "undefined") return true;
  try {
    localStorage.setItem(WORDPRESS_SITES_STORAGE_KEY, json);
    return true;
  } catch {
    purgeLegacyLocalStorageCaches();
    try {
      localStorage.setItem(WORDPRESS_SITES_STORAGE_KEY, json);
      return true;
    } catch {
      return false;
    }
  }
}

export function getStoredSites(): WordPressSite[] {
  const tombstones = getDeletedSitesTombstones();
  if (serverHarnessSitesOverride?.length) {
    return serverHarnessSitesOverride
      .filter((s) => !isSiteTombstoned(s, tombstones))
      .map(normalizeSiteEntry);
  }
  if (memorySitesStore !== null) {
    return memorySitesStore
      .filter((s) => !isSiteTombstoned(s, tombstones))
      .map(normalizeSiteEntry);
  }
  if (typeof localStorage !== "undefined") {
    purgeLegacyLocalStorageCaches();
    try {
      const stored = localStorage.getItem(WORDPRESS_SITES_STORAGE_KEY);
      if (stored) {
        const sites = JSON.parse(stored) as WordPressSite[];
        const activeSites = sites.filter((s) => !isSiteTombstoned(s, tombstones));
        if (activeSites.length > 0) {
          const migrated = activeSites.map(normalizeSiteEntry);
          memorySitesStore = migrated;
          return migrated;
        }
      }
    } catch {
      /* ignore corrupt or legacy storage */
    }
  }

  // Wave 0: no bundled seed. A fresh profile with no server mirror gets an
  // empty, visible site list until the mirror loads.
  memorySitesStore = [];
  return [];
}

/** Persist the roster with one awaited server write. Returns false when the write fails. */
export async function saveSites(sites: WordPressSite[]): Promise<boolean> {
  const tombstones = getDeletedSitesTombstones();
  const filtered = sites.filter((s) => !isSiteTombstoned(s, tombstones));
  const persisted = filtered.map((s) => normalizeSiteEntry(stripInlineClientLogoFromSite(s)));
  memorySitesStore = persisted;

  const minimalJson = JSON.stringify(persisted.map(minimalSiteForLocalStorage));
  if (!tryPersistSitesJson(minimalJson)) {
    try {
      localStorage.removeItem(WORDPRESS_SITES_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  const result = await saveWordPressProperties(persisted);
  return result.ok;
}

function findMirrorSiteRow(local: WordPressSite, serverSites: WordPressSite[]): WordPressSite | undefined {
  const byId = serverSites.find((s) => s.id === local.id);
  if (byId) return byId;
  const host = wordPressSiteHostKey(local.siteUrl);
  if (host) {
    const byHost = serverSites.find((s) => wordPressSiteHostKey(s.siteUrl) === host);
    if (byHost) return byHost;
  }
  const nameKey = (local.name ?? "").trim().toLowerCase();
  if (!nameKey) return undefined;
  return serverSites.find((s) => (s.name ?? "").trim().toLowerCase() === nameKey);
}

const MIRROR_INTEGRATION_ID_FIELDS = [
  "gbpLocationId",
  "ga4PropertyId",
  "googleAdsCustomerId",
  "semrushSiteAuditProjectId",
  "semrushPositionTrackingProjectId",
  "semrushPositionTrackingCampaignId",
  "wpEngineInstall",
  "wpEngineAccountId",
  "primaryLocalKeyword",
] as const;

/** Merge server-mirrored integration IDs (GBP, GA4, Google Ads, Semrush, WP Engine) onto local sites when the browser copy is missing them. */
export async function mergeServerGbpLocationIdsIntoLocalSites(): Promise<boolean> {
  const mirrorResult = await fetchWordPressSitesMirror();
  if (!mirrorResult.ok || mirrorResult.sites.length === 0) return false;
  const serverSites = mirrorResult.sites;

  const local = getStoredSites();
  if (local.length === 0) return false;

  let changed = false;
  const merged = local.map((site) => {
    const row = findMirrorSiteRow(site, serverSites);
    if (!row) return site;
    let next = site;
    for (const field of MIRROR_INTEGRATION_ID_FIELDS) {
      const value = row[field]?.trim();
      if (value && !site[field]?.trim()) {
        next = { ...next, [field]: value };
        changed = true;
      }
    }
    const rowLocs = row.locations ?? row.napInfo?.locations ?? [];
    const localLocs = next.locations ?? next.napInfo?.locations ?? [];
    if (
      rowLocs.length > 0 &&
      (localLocs.length === 0 ||
        isStalePhoenixArizonaLocation(next) ||
        (localLocs.length < rowLocs.length && localLocs[0]?.city === rowLocs[0]?.city))
    ) {
      next = {
        ...next,
        locations: rowLocs,
        napInfo: row.napInfo ?? { ...(next.napInfo ?? { name: next.name }), locations: rowLocs },
      };
      changed = true;
    }
    const serverLogo = row.clientLogoUrl?.trim();
    if (serverLogo) {
      const localLogo = site.clientLogoUrl?.trim();
      const serverAt = row.clientLogoFetchedAt ?? 0;
      const localAt = site.clientLogoFetchedAt ?? 0;
      if (!localLogo || serverAt > localAt) {
        next = {
          ...next,
          clientLogoUrl: serverLogo,
          clientLogoSource: row.clientLogoSource,
          clientLogoFetchedAt: row.clientLogoFetchedAt,
        };
        changed = true;
      }
    }
    return next;
  });

  // NOTE: Never resurrect server sites that do not exist in local.
  // Pushing serverSite back into local was resurrecting deleted properties!

  if (!changed) return false;
  return saveSites(merged);
}

/** Homepage logo fetch for properties missing `clientLogoUrl` (same as Profile “Fetch from site”). */
export async function fetchAndPersistMissingClientLogos(
  sitesToScan: WordPressSite[] = getStoredSites(),
): Promise<boolean> {
  const targets = sitesToScan.filter(
    (s) => !s.clientLogoUrl?.trim() && Boolean(resolveClientSiteOrigin(s)),
  );
  if (targets.length === 0) return false;

  const byId = new Map(getStoredSites().map((s) => [s.id, s]));
  let changed = false;

  for (const site of targets) {
    try {
      const result = await fetchClientSiteLogoUrl(site);
      byId.set(site.id, {
        ...site,
        clientLogoUrl: result.logoUrl,
        clientLogoSource: result.source,
        clientLogoFetchedAt: Date.now(),
      });
      changed = true;
    } catch {
      continue;
    }
  }

  if (!changed) return false;
  return saveSites([...byId.values()]);
}

export function hasUsableLocalSites(sites: WordPressSite[]): boolean {
  return sites.some((s) => Boolean(s.siteUrl?.trim() && s.username?.trim()));
}

/** Restore properties from server mirror only when local storage has no usable sites. */
export async function restoreSitesFromServerMirrorIfEmpty(): Promise<WordPressSite[]> {
  const rawStored = typeof localStorage !== "undefined" ? localStorage.getItem(WORDPRESS_SITES_STORAGE_KEY) : null;
  if (rawStored) {
    try {
      const parsed = JSON.parse(rawStored) as WordPressSite[];
      if (hasUsableLocalSites(parsed)) {
        return getStoredSites();
      }
    } catch {
      /* ignore */
    }
  }

  const tombstones = getDeletedSitesTombstones();
  const mirror = await fetchWordPressSitesMirror();
  if (mirror.ok && mirror.sites.length > 0) {
    const filteredMirror = mirror.sites.filter((s) => !isSiteTombstoned(s, tombstones));
    if (filteredMirror.length > 0) {
      await saveSites(filteredMirror);
    }
  }

  return getStoredSites();
}

/** First visit on a new origin: pull server sites.json into localStorage when empty. */
export async function hydrateLocalSitesFromServerMirrorIfEmpty(): Promise<boolean> {
  const before = hasUsableLocalSites(getStoredSites());
  const restored = await restoreSitesFromServerMirrorIfEmpty();
  return restored.length > 0 && !before;
}

/** After sites hydrate, restore manager cloud snapshot when browser storage is fresh. Never overwrites properties. */
export async function hydrateManagerCloudSettingsIfEmpty(): Promise<boolean> {
  if (!hasUsableLocalSites(getStoredSites())) return false;
  try {
    if (localStorage.getItem(WORDPRESS_SITES_STORAGE_KEY) == null) return false;
  } catch {
    return false;
  }
  const { snapshot } = await loadManagerSettingsFromCloud();
  if (!snapshot) return false;
  hydrateRuntimeApiKeys(snapshot.keys);
  const keys = { ...snapshot.keys };
  delete keys[WORDPRESS_SITES_STORAGE_KEY];
  const result = applyManagerCloudSnapshotToLocalStorage({ ...snapshot, keys });
  return result.keyCount > 0 && !result.error;
}

let runtimeKeysHydration: Promise<void> | null = null;
let runtimeKeysHydrationScope = "";

function workspaceHydrationScope(teamId?: number | null): string {
  return teamId == null ? "manager" : `team:${teamId}`;
}

/** Hydrate in-memory API keys from workspace storage (same team scope as save). */
export function hydrateRuntimeApiKeysFromCloud(teamId?: number | null): Promise<void> {
  const scope = workspaceHydrationScope(teamId);
  if (runtimeKeysHydration && runtimeKeysHydrationScope === scope) {
    return runtimeKeysHydration;
  }
  runtimeKeysHydrationScope = scope;
  runtimeKeysHydration = (async () => {
    const { snapshot } = await loadManagerSettingsFromCloud(teamId);
    if (snapshot) hydrateRuntimeApiKeys(snapshot.keys);
    try {
      window.dispatchEvent(new CustomEvent("neo-pulse-runtime-keys-hydrated"));
    } catch {
      /* non-browser */
    }
  })().catch(() => {
    runtimeKeysHydration = null;
    runtimeKeysHydrationScope = "";
  });
  return runtimeKeysHydration;
}

/** Boot hook for new domains (e.g. neodigital.ca/app). */
export async function hydrateLocalAppStateFromServerIfEmpty(): Promise<{
  sitesHydrated: boolean;
  cloudHydrated: boolean;
}> {
  await restoreSitesFromServerMirrorIfEmpty();
  const sitesHydrated = getStoredSites().length > 0;
  const cloudHydrated = sitesHydrated ? await hydrateManagerCloudSettingsIfEmpty() : false;
  return { sitesHydrated, cloudHydrated };
}

/** GA4 Property ID field only (Google Ads customer ID is separate). */
export function inferGa4PropertyIdFromSiteFields(site: WordPressSite): string {
  return site.ga4PropertyId?.trim() ?? "";
}
