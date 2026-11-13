import { Pencil } from "lucide-react";
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
  /** Single edit control for the whole property screen. */
  editing?: boolean;
  onToggleEditing?: () => void;
};

/** Slim Studio header: Properties dropdown + top-right Edit pencil (+ Save). */
export function PropertiesStudioHeader({
  activeSection,
  onSectionChange,
  visibleSectionIds,
  onSaveProperty,
  showPropertyNav = false,
  editing = false,
  onToggleEditing,
}: PropertiesStudioHeaderProps) {
  const showSave = showPropertyNav && Boolean(onSaveProperty);
  const showEdit = showPropertyNav && Boolean(onToggleEditing);

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
      <div className="flex h-8 shrink-0 items-center gap-1.5">
        {showEdit && onToggleEditing ? (
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-none border-0 bg-transparent text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={editing ? "Done editing property" : "Edit property"}
            aria-pressed={editing}
            onClick={onToggleEditing}
          >
            <Pencil className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
        {showSave && onSaveProperty ? <SavePropertyButton className="h-8" onClick={onSaveProperty} /> : null}
      </div>
    </header>
  );
}
