/** Shared pill styling for UnifiedWorkspaceChrome section tabs. */
export const WORKSPACE_PILL_SHAPE =
  "inline-flex items-center justify-center px-3 text-base font-normal transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const WORKSPACE_PILL_BASE = `${WORKSPACE_PILL_SHAPE} rounded-md`;

export const WORKSPACE_PILL_SQUARE_BASE = `${WORKSPACE_PILL_SHAPE} rounded-none`;

/** Visible grey well on black chrome so inactive tabs read as clickable buttons. */
export const WORKSPACE_PILL_INACTIVE =
  "bg-zinc-900 text-foreground hover:bg-zinc-800 hover:text-foreground";

/** Muted grey selected state (tabs, footer links, mega-menu rows). */
export const WORKSPACE_PILL_ACTIVE =
  "bg-zinc-600 text-white hover:bg-zinc-600 hover:text-white";

/** Forge Task Builder active pill: same muted grey fill. */
export const WORKSPACE_PILL_ACTIVE_FORGE = WORKSPACE_PILL_ACTIVE;

export const WORKSPACE_PILL_INACTIVE_FORGE =
  "bg-black text-muted-foreground hover:bg-black hover:text-white";

/** ToggleGroupItem: same inactive/active mapping when a toggle group is required. */
export const WORKSPACE_PILL_TOGGLE_ITEM = [
  WORKSPACE_PILL_BASE,
  "h-8 min-w-[4.5rem] border-0 shadow-none ring-offset-0",
  WORKSPACE_PILL_INACTIVE,
  "data-[state=on]:bg-zinc-600 data-[state=on]:text-white data-[state=on]:hover:bg-zinc-600 data-[state=on]:hover:text-white",
].join(" ");
