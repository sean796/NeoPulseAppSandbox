import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";

export type PulseAssistHeaderActions = {
  createTicket: () => void;
  downloadDebug: () => void;
  clearChat: () => void;
};

const noop = () => {};

const EMPTY_ACTIONS: PulseAssistHeaderActions = {
  createTicket: noop,
  downloadDebug: noop,
  clearChat: noop,
};

type PulseAssistHeaderActionsApi = {
  get: () => PulseAssistHeaderActions;
  set: (actions: PulseAssistHeaderActions) => void;
};

const PulseAssistHeaderActionsContext = createContext<PulseAssistHeaderActionsApi | null>(null);

/** Shell owns the icon buttons. The chat panel registers what they do. */
export function PulseAssistHeaderActionsProvider({ children }: { children: ReactNode }) {
  const ref = useRef<PulseAssistHeaderActions>(EMPTY_ACTIONS);
  const api = useMemo<PulseAssistHeaderActionsApi>(
    () => ({
      get: () => ref.current,
      set: (actions) => {
        ref.current = actions;
      },
    }),
    [],
  );
  return (
    <PulseAssistHeaderActionsContext.Provider value={api}>
      {children}
    </PulseAssistHeaderActionsContext.Provider>
  );
}

/** Null when the chat panel is not inside the sidebar shell (mobile assist keeps its own icons). */
export function usePulseAssistHeaderActions(): PulseAssistHeaderActionsApi | null {
  return useContext(PulseAssistHeaderActionsContext);
}
