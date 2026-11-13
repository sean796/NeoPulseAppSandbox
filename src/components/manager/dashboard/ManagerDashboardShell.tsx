import type { ReactNode } from "react";
import { DashboardWorkspaceHeader } from "@/components/manager/dashboard/DashboardWorkspaceHeader";
import { CONTENT_OPTIMIZER_BODY_INSET_CLASS } from "@/components/overview/overview-tab/overview-tab-content-constants";
import {
  SEO_WORKSPACE_BODY_SCROLL_CLASS,
  SEO_WORKSPACE_HEADER_CLASS,
  SEO_WORKSPACE_SHELL_CLASS,
} from "@/components/seo/seo-workspace-layout";
import type { ManagerSettingsClusterId } from "@/components/manager/manager-settings-cluster";
import { cn } from "@/lib/utils";

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

export function ManagerDashboardShell({
  activeSection,
  onSectionChange,
  sections,
  visibleSectionIds,
}: ManagerDashboardShellProps) {
  const activeContent = sections.find((section) => section.id === activeSection)?.content;

  if (activeSection === "properties") {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-background font-sans text-base">
        {activeContent}
      </div>
    );
  }

  return (
    <div className={cn(SEO_WORKSPACE_SHELL_CLASS, "font-sans text-base")}>
      <div className={SEO_WORKSPACE_HEADER_CLASS}>
        <DashboardWorkspaceHeader
          activeSection={activeSection}
          onSectionChange={onSectionChange}
          visibleSectionIds={visibleSectionIds}
        />
      </div>
      <div
        className={cn(
          activeSection === "properties"
            ? SEO_WORKSPACE_BODY_FILL_CLASS
            : SEO_WORKSPACE_BODY_SCROLL_CLASS,
          CONTENT_OPTIMIZER_BODY_INSET_CLASS,
        )}
      >
        {activeContent}
      </div>
    </div>
  );
}
