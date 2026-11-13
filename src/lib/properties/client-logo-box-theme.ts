/** Shared Properties + report cover logo frame colors (succinct black/white only). */
export type ClientLogoBoxTheme = "black" | "white";

export const CLIENT_LOGO_BOX_BLACK = "#000000";
export const CLIENT_LOGO_BOX_WHITE = "#ffffff";

export function clientLogoBoxFill(theme: ClientLogoBoxTheme): string {
  return theme === "white" ? CLIENT_LOGO_BOX_WHITE : CLIENT_LOGO_BOX_BLACK;
}

export function clientLogoBoxFallbackText(theme: ClientLogoBoxTheme): string {
  return theme === "white" ? CLIENT_LOGO_BOX_BLACK : CLIENT_LOGO_BOX_WHITE;
}

/** Frame stroke: light on black, dark on white (same contrast idea as Properties border). */
export function clientLogoBoxStroke(theme: ClientLogoBoxTheme): string {
  return theme === "white" ? CLIENT_LOGO_BOX_BLACK : "rgba(255,255,255,0.15)";
}
