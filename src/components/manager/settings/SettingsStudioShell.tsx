import type { ReactNode } from "react";
import type { ManagerSettingsItemId } from "@/components/manager/manager-settings-cluster";
import { SettingsStudioDock } from "./SettingsStudioDock";
import {
  SETTINGS_STUDIO_SHELL_OUTER_CLASS,
  SETTINGS_STUDIO_MAIN_CLASS,
  SETTINGS_STUDIO_PANE_INSET_CLASS,
  SETTINGS_STUDIO_STACK_CLASS,
} from "./settings-studio-surfaces";
import { cn } from "@/lib/utils";

export type SettingsStudioShellProps = {
  items: readonly ManagerSettingsItemId[];
  activeItem: ManagerSettingsItemId;
  onSelect: (id: ManagerSettingsItemId) => void;
  /** When true, children fill the pane (Pulse Host / Agent Library / Skills Library / Changelog). */
  fillPane?: boolean;
  children: ReactNode;
};

/**
 * Settings studio: dock plus page body. Page title lives in the dock, not a second bar.
 */
export function SettingsStudioShell({
  items,
  activeItem,
  onSelect,
  fillPane = false,
  children,
}: SettingsStudioShellProps) {
  return (
    <div className={cn(SETTINGS_STUDIO_SHELL_OUTER_CLASS, "flex h-full min-h-0 flex-1 flex-col overflow-hidden")}>
      <div className="flex h-full min-h-0 flex-1 flex-row overflow-hidden">
        <SettingsStudioDock items={items} activeItem={activeItem} onSelect={onSelect} />
        <div className={SETTINGS_STUDIO_MAIN_CLASS}>
          <div className={SETTINGS_STUDIO_PANE_INSET_CLASS}>
            {fillPane ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-black">{children}</div>
            ) : (
              <div className={cn(SETTINGS_STUDIO_STACK_CLASS, "min-h-0 flex-1")}>{children}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
