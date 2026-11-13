import type { ManagerSettingsClusterId } from "@/components/manager/manager-settings-cluster";
import type { PropertySettingsSubSectionId } from "./property-settings-types";
import type { WordPressSiteAdminSectionId } from "./WordPressSiteAdminLayout";

export type PropertiesStudioHeaderProps = {
  activeSection?: ManagerSettingsClusterId;
  onSectionChange?: (id: ManagerSettingsClusterId) => void;
  visibleSectionIds?: readonly ManagerSettingsClusterId[];
  profileSectionId?: WordPressSiteAdminSectionId;
  onProfileSectionChange?: (id: WordPressSiteAdminSectionId) => void;
  settingsSubSectionId?: PropertySettingsSubSectionId;
  onSettingsSubSectionChange?: (id: PropertySettingsSubSectionId) => void;
  onSaveProperty?: () => void;
  showPropertyNav?: boolean;
  editing?: boolean;
  onToggleEditing?: () => void;
};

/**
 * Property studio no longer mounts a top Properties / Edit / Save row.
 * Edit + Save live next to the package badge on the identity strip.
 */
export function PropertiesStudioHeader(_props: PropertiesStudioHeaderProps) {
  return null;
}
