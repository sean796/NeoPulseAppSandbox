/** Shared layout classes for SEO mega-menu workspace tabs. */
export const SEO_WORKSPACE_SHELL_CLASS =
  "flex h-full min-h-0 w-full min-w-0 flex-1 flex-col gap-3 overflow-hidden pt-3 px-3 pb-4 md:px-5 md:pt-4";

/** Lato + 1rem floor for SEO workspace tabs (see typography-min-1rem rule). */
export const SEO_WORKSPACE_TYPO_CLASS =
  "font-sans text-base [&_input]:font-sans [&_input]:text-base [&_textarea]:font-sans [&_textarea]:text-base [&_button]:font-sans [&_button]:text-base [&_label]:font-sans [&_label]:text-base [&_pre]:font-sans [&_pre]:text-base";

/** Inner flex column when the outer shell already provides padding. */
export const SEO_WORKSPACE_INNER_CLASS =
  "flex h-full min-h-0 w-full min-w-0 flex-1 flex-col gap-3 overflow-hidden";

export const SEO_WORKSPACE_HEADER_CLASS = "relative z-30 shrink-0";

export const SEO_WORKSPACE_BODY_SCROLL_CLASS =
  "neo-pulse-manager-tab-scroll h-0 min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain";

/** Dashboard Properties: list owns scroll; body stays fixed height (visible scrollbar on list). */
export const SEO_WORKSPACE_BODY_FILL_CLASS =
  "flex h-0 min-h-0 flex-1 flex-col overflow-hidden";
