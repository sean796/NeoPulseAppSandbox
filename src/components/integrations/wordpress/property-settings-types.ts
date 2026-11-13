export type PropertySettingsSubSectionId =
  | "profile"
  | "access"
  | "integrations"
  | "editorial"
  | "provisioning"
  | "tests";

export const PROPERTY_SETTINGS_SUB_SECTIONS: { id: PropertySettingsSubSectionId; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "access", label: "Access" },
  { id: "integrations", label: "Integrations" },
  { id: "editorial", label: "Editorial" },
  { id: "provisioning", label: "Provisioning" },
  { id: "tests", label: "Tests" },
];
