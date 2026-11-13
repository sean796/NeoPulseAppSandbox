import type { ReactNode } from "react";
import type { ManagerSettingsClusterId } from "@/components/manager/manager-settings-cluster";

export type ManagerDashboardSection = {
  id: ManagerSettingsClusterId;
  content: ReactNode;
};

export type ManagerDashboardShellProps = {
  activeSection: ManagerSettingsClusterId;
  onSectionChange: (id: ManagerSettingsClusterId) => void;
  sections: ManagerDashboardSection[];
  visibleSectionIds?: readonly ManagerSettingsClusterId[];
};

/**
 * Legacy shell kept for callers. Settings studio now lives in ManagerSettingsContent.
 * Properties / Settings panes are mounted directly; this only returns the active section body.
 */
export function ManagerDashboardShell({
  activeSection,
  sections,
}: ManagerDashboardShellProps) {
  const activeContent = sections.find((section) => section.id === activeSection)?.content;
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-background font-sans text-base">
      {activeContent}
    </div>
  );
}
