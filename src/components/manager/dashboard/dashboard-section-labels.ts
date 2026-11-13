import type {
  ManagerSettingsClusterId,
  ManagerSettingsItemId,
} from "@/components/manager/manager-settings-cluster";

/** Full Dashboard cluster order (Properties + Settings dock). */
export const DASHBOARD_SECTION_ORDER: readonly ManagerSettingsClusterId[] = [
  "properties",
  "api-keys",
  "master-rules",
  "ai-generation",
  "decision-tree",
  "google",
  "pulse-host",
  "agent-library",
  "changelog",
] as const;

/** Settings studio left dock (excludes Properties). */
export const SETTINGS_DOCK_ORDER: readonly ManagerSettingsItemId[] = [
  "api-keys",
  "master-rules",
  "ai-generation",
  "decision-tree",
  "google",
  "pulse-host",
  "agent-library",
  "changelog",
] as const;

export const DASHBOARD_SECTION_LABELS: Record<ManagerSettingsClusterId, string> = {
  properties: "Properties",
  "api-keys": "API Keys",
  "master-rules": "Master Rules",
  "ai-generation": "AI & Models",
  "decision-tree": "Decision Tree",
  google: "Google Services",
  "pulse-host": "Pulse Host",
  "agent-library": "Agent Library",
  changelog: "Changelog",
};
