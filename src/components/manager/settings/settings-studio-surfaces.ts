/**
 * Settings studio tokens = Properties page template (no parallel design system).
 * Re-export Properties surfaces so Settings stays a consumer of one chrome language.
 */
export {
  PROPERTIES_SHELL as SETTINGS_STUDIO_SHELL_OUTER_CLASS,
  PROPERTIES_DOCK_CLASS as SETTINGS_STUDIO_DOCK_CLASS,
  PROPERTIES_LIST_SCROLL_CLASS as SETTINGS_STUDIO_DOCK_LIST_CLASS,
  PROPERTIES_DOCK_ROW_CLASS as SETTINGS_STUDIO_DOCK_ROW_CLASS,
  PROPERTIES_DOCK_ACTIVE_ROW_CLASS as SETTINGS_STUDIO_DOCK_ACTIVE_ROW_CLASS,
  propertiesDockRowStripeClass as settingsDockRowStripeClass,
  PROPERTIES_OVERVIEW_STACK_CLASS as SETTINGS_STUDIO_STACK_CLASS,
  PROPERTIES_OVERVIEW_IDENTITY_CLASS as SETTINGS_STUDIO_IDENTITY_CLASS,
  PROPERTIES_OVERVIEW_IDENTITY_NAME_CLASS as SETTINGS_STUDIO_IDENTITY_NAME_CLASS,
  PROPERTIES_OVERVIEW_IDENTITY_PILLS_CLASS as SETTINGS_STUDIO_IDENTITY_PILLS_CLASS,
  PROPERTIES_OVERVIEW_PANEL_CLASS as SETTINGS_STUDIO_PANEL_CLASS,
  PROPERTIES_OVERVIEW_PANEL_TITLE_CLASS as SETTINGS_STUDIO_PANEL_TITLE_CLASS,
  PROPERTIES_OVERVIEW_CTA_CLASS as SETTINGS_STUDIO_CTA_CLASS,
} from "@/components/integrations/wordpress/wordpress-properties-surfaces";

/** Fixed dock head row (matches Properties toolbar band height; no clip). */
export const SETTINGS_STUDIO_DOCK_HEAD_CLASS =
  "neo-pulse-properties-dock-head flex h-11 w-full shrink-0 items-center border-b border-white/10 bg-zinc-950 px-3 text-base font-semibold text-white";

/** Right column behind overview stack (Properties main column). */
export const SETTINGS_STUDIO_MAIN_CLASS =
  "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-zinc-950";

/** Profile-style inset before the black overview stack. */
export const SETTINGS_STUDIO_PANE_INSET_CLASS =
  "flex min-h-0 w-full flex-1 flex-col overflow-hidden px-3 pt-3 font-sans text-base md:px-5 md:pt-4";
