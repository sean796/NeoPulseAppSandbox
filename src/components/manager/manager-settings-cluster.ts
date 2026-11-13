/** Persisted active section inside the manager Dashboard tab (Properties + Settings dock). */
export const MANAGER_SETTINGS_CLUSTER_KEY = "neo-pulse-manager-settings-cluster";

/** Last Settings dock item (used when opening Settings mode from the mega menu). */
export const MANAGER_SETTINGS_ITEM_KEY = "neo-pulse-manager-settings-item";

export type ManagerSettingsClusterId =
  | "properties"
  | "api-keys"
  | "master-rules"
  | "ai-generation"
  | "decision-tree"
  | "google"
  | "pulse-host"
  | "agent-library"
  | "changelog";

/** Settings studio dock items (everything except Properties). */
export type ManagerSettingsItemId = Exclude<ManagerSettingsClusterId, "properties">;

const CLUSTER_IDS: readonly ManagerSettingsClusterId[] = [
  "properties",
  "api-keys",
  "master-rules",
  "ai-generation",
  "decision-tree",
  "google",
  "pulse-host",
  "agent-library",
  "changelog",
];

const SETTINGS_ITEM_IDS: readonly ManagerSettingsItemId[] = [
  "api-keys",
  "master-rules",
  "ai-generation",
  "decision-tree",
  "google",
  "pulse-host",
  "agent-library",
  "changelog",
];

export function isManagerSettingsClusterId(value: string): value is ManagerSettingsClusterId {
  return (CLUSTER_IDS as readonly string[]).includes(value);
}

export function isManagerSettingsItemId(value: string): value is ManagerSettingsItemId {
  return (SETTINGS_ITEM_IDS as readonly string[]).includes(value);
}

export function readStoredManagerSettingsCluster(): ManagerSettingsClusterId {
  try {
    const t = localStorage.getItem(MANAGER_SETTINGS_CLUSTER_KEY);
    if (t && isManagerSettingsClusterId(t)) return t;
  } catch {
    /* ignore */
  }
  return "properties";
}

export function writeStoredManagerSettingsCluster(section: ManagerSettingsClusterId): void {
  try {
    localStorage.setItem(MANAGER_SETTINGS_CLUSTER_KEY, section);
    if (section !== "properties") {
      localStorage.setItem(MANAGER_SETTINGS_ITEM_KEY, section);
    }
  } catch {
    /* ignore */
  }
}

/** Last settings dock item, or API Keys when never set / invalid. */
export function readStoredManagerSettingsItem(): ManagerSettingsItemId {
  try {
    const t = localStorage.getItem(MANAGER_SETTINGS_ITEM_KEY);
    if (t && isManagerSettingsItemId(t)) return t;
    const cluster = localStorage.getItem(MANAGER_SETTINGS_CLUSTER_KEY);
    if (cluster && isManagerSettingsItemId(cluster)) return cluster;
  } catch {
    /* ignore */
  }
  return "api-keys";
}
