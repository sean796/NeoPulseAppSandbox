import { DashboardSectionPills } from "@/components/manager/dashboard/DashboardSectionPills";
import type { ManagerSettingsClusterId } from "@/components/manager/manager-settings-cluster";
import type { PropertySettingsSubSectionId } from "./property-settings-types";
import type { WordPressSiteAdminSectionId } from "./WordPressSiteAdminLayout";
import { PROPERTIES_STUDIO_HEADER_CLASS } from "./wordpress-properties-surfaces";
import { SavePropertyButton } from "./SavePropertyButton";

export type PropertiesStudioHeaderProps = {
  activeSection?: ManagerSettingsClusterId;
  onSectionChange?: (id: ManagerSettingsClusterId) => void;
  visibleSectionIds?: readonly ManagerSettingsClusterId[];
  /** Property section tabs (Overview, Sitemaps, …) — same row as Properties dropdown. */
  profileSectionId?: WordPressSiteAdminSectionId;
  onProfileSectionChange?: (id: WordPressSiteAdminSectionId) => void;
  settingsSubSectionId?: PropertySettingsSubSectionId;
  onSettingsSubSectionChange?: (id: PropertySettingsSubSectionId) => void;
  onSaveProperty?: () => void;
  showPropertyNav?: boolean;
};

/** Slim Studio header: Properties dropdown + property section menu on one h-11 row. */
export function PropertiesStudioHeader({
  activeSection,
  onSectionChange,
  visibleSectionIds,
  onSaveProperty,
  showPropertyNav = false,
}: PropertiesStudioHeaderProps) {
  const showSave = showPropertyNav && Boolean(onSaveProperty);

  return (
    <header className={PROPERTIES_STUDIO_HEADER_CLASS} aria-label="Properties header">
      {activeSection && onSectionChange ? (
        <DashboardSectionPills
          activeSection={activeSection}
          onSectionChange={onSectionChange}
          sectionOrder={visibleSectionIds}
        />
      ) : null}
      <div className="min-w-0 flex-1" aria-hidden />
      {showSave && onSaveProperty ? <SavePropertyButton className="h-8" onClick={onSaveProperty} /> : null}
    </header>
  );
}
