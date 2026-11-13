import type { ReactNode } from "react";
import type { ManagerSettingsItemId } from "@/components/manager/manager-settings-cluster";
import { DASHBOARD_SECTION_LABELS } from "@/components/manager/dashboard/dashboard-section-labels";
import { SettingsStudioDock } from "./SettingsStudioDock";
import {
  SETTINGS_STUDIO_SHELL_OUTER_CLASS,
  SETTINGS_STUDIO_MAIN_CLASS,
  SETTINGS_STUDIO_PANE_INSET_CLASS,
  SETTINGS_STUDIO_STACK_CLASS,
  SETTINGS_STUDIO_IDENTITY_CLASS,
  SETTINGS_STUDIO_IDENTITY_NAME_CLASS,
  SETTINGS_STUDIO_IDENTITY_PILLS_CLASS,
} from "./settings-studio-surfaces";
import { cn } from "@/lib/utils";

export type SettingsStudioShellProps = {
  items: readonly ManagerSettingsItemId[];
  activeItem: ManagerSettingsItemId;
  onSelect: (id: ManagerSettingsItemId) => void;
  /** Primary actions in the identity strip (e.g. API Keys Save). */
  identityActions?: ReactNode;
  /** When true, children fill the pane (Pulse Host / Agent Library / Changelog). */
  fillPane?: boolean;
  children: ReactNode;
};

/**
 * Settings studio: Properties page template (shell + dock + identity + overview stack).
 */
export function SettingsStudioShell({
  items,
  activeItem,
  onSelect,
  identityActions,
  fillPane = false,
  children,
}: SettingsStudioShellProps) {
  const title = DASHBOARD_SECTION_LABELS[activeItem];

  return (
    <div className={cn(SETTINGS_STUDIO_SHELL_OUTER_CLASS, "flex h-full min-h-0 flex-1 flex-col overflow-hidden")}>
      <div className="flex h-full min-h-0 flex-1 flex-row overflow-hidden">
        <SettingsStudioDock items={items} activeItem={activeItem} onSelect={onSelect} />
        <div className={SETTINGS_STUDIO_MAIN_CLASS}>
          <div className={SETTINGS_STUDIO_PANE_INSET_CLASS}>
            <div
              className={cn(
                SETTINGS_STUDIO_IDENTITY_CLASS,
                "h-[3.5rem] max-h-[3.5rem] min-h-[3.5rem] overflow-hidden",
              )}
            >
              <h1 className={SETTINGS_STUDIO_IDENTITY_NAME_CLASS}>{title}</h1>
              <div className={SETTINGS_STUDIO_IDENTITY_PILLS_CLASS}>{identityActions}</div>
            </div>
            {fillPane ? (
              <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden bg-black">
                {children}
              </div>
            ) : (
              <div className={cn(SETTINGS_STUDIO_STACK_CLASS, "mt-3 min-h-0 flex-1")}>{children}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
