import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Cloud,
  GitBranch,
  Key,
  ScrollText,
  Server,
  Sparkles,
} from "lucide-react";
import type { ManagerSettingsItemId } from "@/components/manager/manager-settings-cluster";
import { DASHBOARD_SECTION_LABELS } from "@/components/manager/dashboard/dashboard-section-labels";
import {
  SETTINGS_STUDIO_DOCK_CLASS,
  SETTINGS_STUDIO_DOCK_HEAD_CLASS,
  SETTINGS_STUDIO_DOCK_LIST_CLASS,
  SETTINGS_STUDIO_DOCK_ROW_CLASS,
  SETTINGS_STUDIO_DOCK_ACTIVE_ROW_CLASS,
  settingsDockRowStripeClass,
} from "./settings-studio-surfaces";
import { cn } from "@/lib/utils";

const SETTINGS_DOCK_ICONS: Record<ManagerSettingsItemId, LucideIcon> = {
  "api-keys": Key,
  "master-rules": ScrollText,
  "ai-generation": Sparkles,
  "decision-tree": GitBranch,
  google: Cloud,
  "pulse-host": Server,
  "agent-library": Bot,
  changelog: ScrollText,
};

export type SettingsStudioDockProps = {
  items: readonly ManagerSettingsItemId[];
  activeItem: ManagerSettingsItemId;
  onSelect: (id: ManagerSettingsItemId) => void;
};

export function SettingsStudioDock({ items, activeItem, onSelect }: SettingsStudioDockProps) {
  return (
    <aside
      className={SETTINGS_STUDIO_DOCK_CLASS}
      aria-label="Settings"
      style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
    >
      <div className={SETTINGS_STUDIO_DOCK_HEAD_CLASS}>Settings</div>
      <nav className={SETTINGS_STUDIO_DOCK_LIST_CLASS} aria-label="Settings sections">
        {items.map((id, index) => {
          const Icon = SETTINGS_DOCK_ICONS[id];
          const active = id === activeItem;
          return (
            <button
              key={id}
              type="button"
              className={cn(
                SETTINGS_STUDIO_DOCK_ROW_CLASS,
                !active && settingsDockRowStripeClass(index),
                active && SETTINGS_STUDIO_DOCK_ACTIVE_ROW_CLASS,
              )}
              aria-current={active ? "page" : undefined}
              onClick={() => onSelect(id)}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-left text-base font-medium">
                {DASHBOARD_SECTION_LABELS[id]}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
