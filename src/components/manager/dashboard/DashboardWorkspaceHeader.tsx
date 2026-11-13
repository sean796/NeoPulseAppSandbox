import { LayoutDashboard } from "lucide-react";
import { UnifiedWorkspaceChrome } from "@/components/shared/UnifiedWorkspaceChrome";
import { DashboardSectionPills } from "@/components/manager/dashboard/DashboardSectionPills";
import type { ManagerSettingsClusterId } from "@/components/manager/manager-settings-cluster";

export type DashboardWorkspaceHeaderProps = {
  activeSection: ManagerSettingsClusterId;
  onSectionChange: (id: ManagerSettingsClusterId) => void;
  visibleSectionIds?: readonly ManagerSettingsClusterId[];
};

export function DashboardWorkspaceHeader({
  activeSection,
  onSectionChange,
  visibleSectionIds,
}: DashboardWorkspaceHeaderProps) {
  return (
    <UnifiedWorkspaceChrome
      icon={LayoutDashboard}
      title="Dashboard"
      titleRowEnd={
        <DashboardSectionPills
          activeSection={activeSection}
          onSectionChange={onSectionChange}
          sectionOrder={visibleSectionIds}
        />
      }
      toolbar={<div className="flex min-w-0 flex-1" />}
      workspaceBusy={false}
      progressBand="empty"
    />
  );
}
