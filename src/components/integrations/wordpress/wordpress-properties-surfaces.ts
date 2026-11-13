import { cn } from "@/lib/utils";
import type { WordPressPropertyRowDisplay } from "@/lib/wordpress-properties-row-display";

/** Square controls across Properties (list rows, toolbar, expanded panels). */
export const PROPERTIES_SQUARE_CONTROLS_CLASS =
  "[&_button]:rounded-none [&_input]:rounded-none [&_[role=checkbox]]:rounded-none [&_[role=combobox]]:rounded-none";

/** Outer chrome for Properties list: flush under unified dashboard header (toolbar band). */
export const PROPERTIES_SHELL = cn(
  "bg-zinc-950 px-0 pb-0 pt-0 shadow-none ring-0 outline-none",
  PROPERTIES_SQUARE_CONTROLS_CLASS,
);

/** Vertical stack for property rows (no panel border). */
export const PROPERTIES_LIST_STACK = "flex flex-col gap-0";

/** Scrollport for the properties list (always shows the primary scrollbar track). */
export const PROPERTIES_LIST_SCROLL_CLASS = cn(
  "properties-dock-list neo-pulse-properties-list-scroll neo-pulse-manager-tab-scroll",
  "flex h-0 min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-auto overflow-y-scroll overscroll-y-contain text-white",
);

/**
 * Collapsed property row shell (stripe applied via propertiesRowStripeClass).
 */
/** Shared row height shell (real rows + filler stripes). */
export const PROPERTIES_ROW_OUTER_BASE = cn(
  "flex min-h-[4.5rem] w-full min-w-0 items-stretch gap-3 rounded-none border-0 px-2 py-2 shadow-none transition-colors sm:gap-4 sm:px-3",
);

/** Soft dock/list row surfaces (Linear-style hover, no heavy chrome). */
export function propertiesRowStripeClass(
  index: number,
  rowSelected = false,
  canHover = true,
): string {
  return cn(
    !rowSelected && "bg-transparent",
    !rowSelected && canHover && "hover:bg-white/5",
    rowSelected && "bg-white/5 hover:bg-white/5",
  );
}

/** Collapsed row outer classes with optional compact density (visual only). */
export function propertiesRowOuterClass(
  display: WordPressPropertyRowDisplay,
  index: number,
  rowSelected = false,
  canHover = true,
): string {
  return cn(
    PROPERTIES_ROW_OUTER_BASE,
    propertiesRowStripeClass(index, rowSelected, canHover),
    display === "compact" &&
      "min-h-[3.25rem] gap-2 py-1 sm:min-h-[3.5rem] sm:gap-3 sm:px-2.5",
  );
}

/** Empty / no-results states (flat, readable on dark). */
export const PROPERTIES_EMPTY = cn(
  "rounded-none border-0 bg-ui-field/50 py-10 text-center text-foreground/85 shadow-none sm:py-12",
);

/** Studio left dock for the property list (+10% over Changelog 21rem). */
export const PROPERTIES_DOCK_CLASS =
  "properties-dock relative flex h-full min-h-0 w-[23.1rem] shrink-0 flex-col overflow-hidden bg-zinc-950 text-white";

/** Slim Studio header on the right pane (one fixed-height row). */
export const PROPERTIES_STUDIO_HEADER_CLASS =
  "relative z-30 flex h-11 w-full min-w-0 shrink-0 items-center gap-2 overflow-x-auto bg-zinc-950 px-3";

/** Property section links inline in the Studio header (same row as Properties dropdown). */
export const PROPERTIES_SECTION_NAV_CLASS =
  "flex h-11 min-w-0 flex-1 items-center gap-1 overflow-x-auto";

export const PROPERTIES_SECTION_NAV_BTN_CLASS = cn(
  "properties-section-nav-btn h-8 shrink-0 rounded-lg border-0 bg-transparent px-3 text-base font-medium text-white shadow-none",
  "hover:bg-white/5 hover:text-white",
  "data-[active=true]:bg-white/5 data-[active=true]:text-white",
  "data-[active=true]:shadow-[inset_0_-2px_0] data-[active=true]:shadow-primary",
);

export const PROPERTIES_SECTION_NAV_DIVIDER_CLASS =
  "mx-1 h-5 w-px shrink-0 bg-white/10";

/**
 * Spotify-style section frame: square, borderless, muted zinc on black page.
 * Spacing between frames comes from stack/grid gaps, not borders.
 */
export const PROPERTIES_OVERVIEW_WELL_CLASS = cn(
  "flex w-full min-w-0 flex-col rounded-none border-0 bg-zinc-900 shadow-none",
);

export const PROPERTIES_OVERVIEW_STACK_CLASS =
  "properties-overview flex h-full min-h-0 w-full flex-col gap-3 overflow-y-auto bg-black p-3 text-white";

/** Identity strip: name + URL + soft status pills. */
export const PROPERTIES_OVERVIEW_IDENTITY_CLASS = cn(
  PROPERTIES_OVERVIEW_WELL_CLASS,
  "min-h-14 shrink-0 flex-row flex-wrap items-center gap-3 px-4 py-3",
);

export const PROPERTIES_OVERVIEW_IDENTITY_NAME_CLASS =
  "text-xl font-semibold tracking-tight !text-white break-words";

export const PROPERTIES_OVERVIEW_IDENTITY_URL_CLASS =
  "min-w-0 truncate text-base font-medium !text-white";

/** One fixed package badge slot (zero CLS). */
export const PROPERTIES_OVERVIEW_IDENTITY_PILLS_CLASS =
  "ml-auto flex h-8 w-[8.75rem] min-w-[8.75rem] max-w-[8.75rem] shrink-0 flex-nowrap items-center justify-end";

/** Shared chip chrome; widths are fixed per slot below (zero CLS across clients). */
const PROPERTIES_OVERVIEW_CHIP_BASE =
  "inline-flex h-8 shrink-0 items-center justify-center gap-2 overflow-hidden rounded-none px-2 text-base font-medium !text-white [&>span:last-child]:min-w-0 [&>span:last-child]:truncate";

/** Package slot: Standard / Lite / No editorial (one package badge per client). */
export const PROPERTIES_OVERVIEW_CHIP_EDITORIAL_SLOT =
  "w-[8.75rem] min-w-[8.75rem] max-w-[8.75rem]";

export const PROPERTIES_OVERVIEW_CHIP_CLASS = cn(
  PROPERTIES_OVERVIEW_CHIP_BASE,
  "border-0 bg-emerald-500/10",
);

export const PROPERTIES_OVERVIEW_CHIP_MUTED_CLASS = cn(
  PROPERTIES_OVERVIEW_CHIP_BASE,
  "border-0 bg-zinc-500/10",
);

export const PROPERTIES_OVERVIEW_CHIP_WARN_CLASS = cn(
  PROPERTIES_OVERVIEW_CHIP_BASE,
  "border-0 bg-amber-500/10",
);

export const PROPERTIES_OVERVIEW_CHIP_LITE_CLASS = cn(
  PROPERTIES_OVERVIEW_CHIP_BASE,
  "border-0 bg-sky-500/10",
);

export const PROPERTIES_OVERVIEW_CHIP_DOT_OK_CLASS = "h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400";
export const PROPERTIES_OVERVIEW_CHIP_DOT_WARN_CLASS = "h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400";
export const PROPERTIES_OVERVIEW_CHIP_DOT_MUTED_CLASS = "h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400";
export const PROPERTIES_OVERVIEW_CHIP_DOT_LITE_CLASS = "h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400";

/** Shared key-value pill row (darker well inside muted section frame). */
export const PROPERTIES_OVERVIEW_PILL_ROW_CLASS = cn(
  "flex h-11 w-full min-w-0 items-center justify-between gap-3 rounded-none border-0 bg-black px-3",
);

export const PROPERTIES_OVERVIEW_PILL_LABEL_CLASS =
  "shrink-0 pt-0.5 text-xs font-semibold uppercase tracking-wider text-white";

export const PROPERTIES_OVERVIEW_PILL_VALUE_CLASS =
  "min-w-0 whitespace-pre-line break-words text-right text-xs font-medium text-white";

export const PROPERTIES_OVERVIEW_PILL_EMPTY_CLASS =
  "min-w-0 whitespace-normal break-words text-right text-xs font-medium text-white";

export const PROPERTIES_OVERVIEW_PILL_NOTE_CLASS =
  "inline-flex shrink-0 items-center gap-1.5 whitespace-normal break-words rounded-none border border-white/5 bg-white/5 px-2 py-0.5 text-xs font-medium text-white";

/** Independent KPI cards (pill metric inside well). */
export const PROPERTIES_OVERVIEW_KPI_ROW_CLASS =
  "grid w-full shrink-0 grid-cols-2 gap-3";

export const PROPERTIES_OVERVIEW_KPI_TILE_CLASS = cn(
  PROPERTIES_OVERVIEW_WELL_CLASS,
  "min-h-0 justify-center gap-2 overflow-visible p-3",
);

export const PROPERTIES_OVERVIEW_KPI_LABEL_CLASS = PROPERTIES_OVERVIEW_PILL_LABEL_CLASS;

export const PROPERTIES_OVERVIEW_KPI_VALUE_CLASS =
  "min-w-0 whitespace-normal break-words text-right text-xl font-semibold tracking-tight text-white";

export const PROPERTIES_OVERVIEW_KPI_NOTE_CLASS =
  "flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1.5 text-xs font-medium text-white";

/** Two-column Profile + Integrations band. */
export const PROPERTIES_OVERVIEW_DUAL_CLASS = "grid min-h-0 shrink grid-cols-2 gap-3";

export const PROPERTIES_OVERVIEW_PANEL_CLASS = cn(
  PROPERTIES_OVERVIEW_WELL_CLASS,
  "min-w-0 gap-2 overflow-hidden p-3",
);

export const PROPERTIES_OVERVIEW_PANEL_TITLE_CLASS =
  "pb-1 text-base font-semibold text-white";

export const PROPERTIES_OVERVIEW_PROFILE_ROW_CLASS = PROPERTIES_OVERVIEW_PILL_ROW_CLASS;

export const PROPERTIES_OVERVIEW_PROFILE_LABEL_CLASS = PROPERTIES_OVERVIEW_PILL_LABEL_CLASS;

export const PROPERTIES_OVERVIEW_PROFILE_VALUE_CLASS = PROPERTIES_OVERVIEW_PILL_VALUE_CLASS;

export const PROPERTIES_OVERVIEW_PROFILE_EMPTY_CLASS = PROPERTIES_OVERVIEW_PILL_EMPTY_CLASS;

export const PROPERTIES_OVERVIEW_CTA_CLASS = cn(
  "!rounded-none h-8 shrink-0 border-0 bg-primary px-3 text-base font-medium text-black shadow-none",
  "hover:bg-primary/90",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[#12141a]",
);

/** Integrations dense definition list. */
export const PROPERTIES_OVERVIEW_DL_CLASS = "flex w-full flex-col gap-1";

export const PROPERTIES_OVERVIEW_DL_ROW_CLASS = PROPERTIES_OVERVIEW_PILL_ROW_CLASS;

export const PROPERTIES_OVERVIEW_DL_LABEL_CLASS = PROPERTIES_OVERVIEW_PILL_LABEL_CLASS;

export const PROPERTIES_OVERVIEW_DL_VALUE_CLASS = PROPERTIES_OVERVIEW_PILL_VALUE_CLASS;

/** Diagnostics 4-column compact action toolbar. */
export const PROPERTIES_DIAGNOSTICS_STRIP_CLASS = "grid grid-cols-4 gap-2";

export const PROPERTIES_DIAGNOSTICS_SECTION_CLASS = cn(
  PROPERTIES_OVERVIEW_WELL_CLASS,
  "shrink-0 gap-2 overflow-hidden p-3",
);

export const PROPERTIES_DIAGNOSTICS_TOOL_CLASS = cn(
  "!rounded-none inline-flex h-11 w-full min-w-0 items-center gap-2 border-0 bg-zinc-900 px-3 text-left text-base font-medium text-white shadow-none",
  "hover:bg-white/10 hover:text-white",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-[#12141a]",
  "disabled:cursor-not-allowed disabled:!opacity-100 disabled:text-white disabled:hover:bg-white/5",
);

export const PROPERTIES_DIAGNOSTICS_ICON_CLASS =
  "flex h-4 w-4 shrink-0 items-center justify-center !text-white [&>svg]:h-4 [&>svg]:w-4";

/** Shared dock row height (real sites + empty fillers). */
export const PROPERTIES_DOCK_ROW_HEIGHT_CLASS = "h-10 min-h-10 max-h-10";

/** Command-palette dock row (compact, no card chrome). Left border reserved for zero CLS. */
export const PROPERTIES_DOCK_ROW_CLASS = cn(
  "group flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-none border-l-2 border-l-transparent px-2 py-1.5 shadow-none",
  PROPERTIES_DOCK_ROW_HEIGHT_CLASS,
  "text-white !text-white [&_*]:!text-white [&_svg]:!text-white",
  "transition-colors hover:bg-white/5",
);

/** Empty stripe-only filler under real dock sites (no content, not interactive). */
export const PROPERTIES_DOCK_FILLER_ROW_CLASS = cn(
  "pointer-events-none w-full min-w-0 select-none border-l-2 border-l-transparent px-2",
  PROPERTIES_DOCK_ROW_HEIGHT_CLASS,
);

/** Alternating grayscale dock stripes (inactive rows). */
export function propertiesDockRowStripeClass(index: number): string {
  return index % 2 === 0 ? "bg-transparent" : "bg-white/[0.03]";
}

/** Active property highlight in the dock (lime bg + left accent only; text stays white). */
export const PROPERTIES_DOCK_ACTIVE_ROW_CLASS =
  "border-l-lime-400 bg-lime-400/10 text-white hover:bg-lime-400/10 hover:text-white [&_*]:!text-white";

export const PROPERTIES_DOCK_ICON_CLASS =
  "text-white transition-colors hover:text-white";

/** Far-right dock status counts (no black frames). Always white idle + active. */
export const PROPERTIES_DOCK_COUNT_CLASS =
  "inline-block min-w-[2.75rem] text-right text-xs font-bold tabular-nums !text-white";

export const PROPERTIES_DOCK_COUNT_ACTIVE_CLASS = PROPERTIES_DOCK_COUNT_CLASS;

/** Column header above the dock site list (white uppercase + bottom rule). */
export const PROPERTIES_DOCK_COLUMN_HEADER_CLASS = cn(
  "relative z-10 flex w-full min-w-0 shrink-0 items-center gap-2 border-b border-white/10 bg-zinc-950 px-2 py-1 text-white",
);

export const PROPERTIES_DOCK_COLUMN_HEADER_LABEL_CLASS =
  "text-xs font-semibold uppercase tracking-wider text-white";

/** Metric column titles (same width as count slots). */
export const PROPERTIES_DOCK_COLUMN_HEADER_METRIC_CLASS =
  "inline-block min-w-[2.75rem] text-right text-xs font-semibold uppercase tracking-wider text-white";

/** Solid color marker (legacy bar / list-row dot). */
export function propertiesEditorialTierChipClass(
  tier: "standard" | "lite" | null | undefined,
): string {
  if (tier === "standard") return "bg-primary";
  if (tier === "lite") return "bg-sky-400";
  return "bg-zinc-600";
}

/** Dock property name: always white (idle + active). */
export function propertiesDockNameClass(_selected?: boolean): string {
  return "font-bold !text-white";
}

/** @deprecated Prefer propertiesDockNameClass(selected). Kept for non-dock list chrome. */
export function propertiesEditorialTierNameClass(
  tier: "standard" | "lite" | null | undefined,
): string {
  if (tier === "standard") return "text-primary";
  if (tier === "lite") return "text-sky-300";
  return "text-foreground";
}
