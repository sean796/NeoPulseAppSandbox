import { createContext, useContext } from "react";

export type DetailsDockValue = {
  target: HTMLElement | null;
  setTarget: (el: HTMLElement | null) => void;
  /** Number of mounted workspaces that publish Details content. */
  count: number;
  register: () => () => void;
  /** SEO studio left dock, or the right sidebar Details tab, is showing Details. */
  open: boolean;
  /** Content Optimizer left dock sets this while its Details tab is open. */
  setStudioOpen: (open: boolean) => void;
};

export const DetailsDockContext = createContext<DetailsDockValue | null>(null);

export function useDetailsDock(): DetailsDockValue | null {
  return useContext(DetailsDockContext);
}

/** True while the sidebar is open on the Details tab. */
export function useDetailsDockOpen(): boolean {
  return useDetailsDock()?.open ?? false;
}
