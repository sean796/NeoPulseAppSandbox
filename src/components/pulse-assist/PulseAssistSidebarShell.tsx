import { useEffect, useRef, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, CircleHelp, Download, Sparkles, Trash2, X } from "lucide-react";
import { useAgentRunsContext } from "@/contexts/use-agent-runs-context";
import { useTaskManagerOptional } from "@/contexts/task-manager-context";
import { cn } from "@/lib/utils";
import { usePulseAssistSidebarResize } from "@/hooks/use-pulse-assist-sidebar-resize";
import { NEO_PULSE_ASSIST_LABEL } from "./PulseAssistBrandTitle";
import { PulseAssistLauncherBrand } from "./PulseAssistLauncherBrand";
import { TaskManagerLauncherBrand } from "@/components/task-manager/TaskManagerLauncherBrand";
import { PulseAssistSidebarResizeHandle } from "./PulseAssistSidebarResizeHandle";
import { PulseAssistClock } from "./PulseAssistClock";
import { PulseAssistHeaderActionsProvider, usePulseAssistHeaderActions } from "./pulse-assist-header-actions";
import { WorkspacePill } from "@/components/shared/WorkspacePill";
import type { PulseAssistLayout } from "./PulseAssistRoot";
import { type SidebarPanel } from "@/lib/pulse-assist/storage";
import "./pulse-assist-theme.css";
import { Button } from "@/ui";

type PulseAssistSidebarShellProps = {
  layout?: PulseAssistLayout;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  panel: SidebarPanel;
  onPanelChange: (panel: SidebarPanel) => void;
  children: ReactNode;
};

function MobileAssistCircle({ onOpen }: { onOpen: () => void }): ReactElement | null {
  if (typeof document === "undefined") return null;
  return createPortal(
    <button
      type="button"
      className="pulse-assist-mobile-circle"
      onClick={onOpen}
      aria-label={`Open ${NEO_PULSE_ASSIST_LABEL}`}
      aria-controls="neo-pulse-sidebar-panel"
      style={{
        position: "fixed",
        right: "16px",
        bottom: "24px",
        zIndex: 2147483000,
        width: "56px",
        height: "56px",
        margin: 0,
        padding: 0,
        border: "none",
        borderRadius: "50%",
        background: "#000",
        color: "#4ade80",
        boxShadow: "0 4px 24px rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Sparkles className="pulse-assist-mobile-circle__icon" aria-hidden width={26} height={26} />
    </button>,
    document.body,
  );
}

function ShortcutLaunchers({
  docked,
  onOpenTasks,
  onOpenAssist,
  tasksHasRunning = false,
  tasksShowDone = false,
}: {
  docked: boolean;
  onOpenTasks: () => void;
  onOpenAssist: () => void;
  tasksHasRunning?: boolean;
  tasksShowDone?: boolean;
}): ReactElement {
  const launcherClass = cn("pulse-assist-launcher", docked && "pulse-assist-launcher--docked");

  const tasksButton = (
    <button type="button"
      onClick={onOpenTasks}
      className={launcherClass}
      aria-label="Open Task Manager"
      aria-expanded={false}
      aria-controls="neo-pulse-sidebar-panel"
    >
      <TaskManagerLauncherBrand hasRunning={tasksHasRunning} showDone={tasksShowDone} />
    </button>
  );

  const assistButton = (
    <button type="button"
      onClick={onOpenAssist}
      className={launcherClass}
      aria-label={`Open ${NEO_PULSE_ASSIST_LABEL}`}
      aria-expanded={false}
      aria-controls="neo-pulse-sidebar-panel"
    >
      <PulseAssistLauncherBrand />
    </button>
  );

  if (docked) {
    return (
      <aside className="pulse-assist-shortcut-rail" aria-label="Sidebar shortcuts">
        {tasksButton}
        {assistButton}
      </aside>
    );
  }

  return (
    <>
      {tasksButton}
      {assistButton}
    </>
  );
}

export function PulseAssistSidebarShell({
  layout = "overlay",
  open,
  onOpenChange,
  panel,
  onPanelChange,
  children,
}: PulseAssistSidebarShellProps): ReactElement {
  const panelRef = useRef<HTMLDivElement>(null);
  const { width, isResizing, isMobile, handleProps } = usePulseAssistSidebarResize(open);
  const panelLabel =
    panel === "tasks" ? "Task Manager" : NEO_PULSE_ASSIST_LABEL;
  const { clearHistory } = useAgentRunsContext();
  const taskManager = useTaskManagerOptional();
  const tasksHasRunning = Boolean(taskManager?.hasRunning);
  const tasksShowDone = Boolean(!tasksHasRunning && taskManager?.latestTerminal?.status === "done");
  const clearingTasks = useRef(false);
  const docked = layout === "docked";
  const useDockedChrome = docked && !isMobile;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onOpenChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (useDockedChrome) return;
    document.documentElement.classList.toggle("pulse-assist-scroll-lock", open);
    document.body.classList.toggle("pulse-assist-scroll-lock", open);
    return () => {
      document.documentElement.classList.remove("pulse-assist-scroll-lock");
      document.body.classList.remove("pulse-assist-scroll-lock");
    };
  }, [open, useDockedChrome]);

  useEffect(() => {
    document.documentElement.style.setProperty("--neo-pulse-assist-panel-width", "0px");
    return () => {
      document.documentElement.style.setProperty("--neo-pulse-assist-panel-width", "0px");
    };
  }, []);

  const openPanel = (next: SidebarPanel) => {
    onPanelChange(next);
    onOpenChange(true);
  };

  return (
    <PulseAssistHeaderActionsProvider>
    <div
      className={cn(
        "fai-sidebar-root fai-sidebar-root--right pulse-assist-root",
        useDockedChrome && "pulse-assist-root--docked",
        open && "fai-sidebar-root--open pulse-assist-root--open",
        isResizing && "pulse-assist-root--resizing",
      )}
      style={{ "--fai-sidebar-width": `${width}px` } as CSSProperties}
      aria-hidden={useDockedChrome ? false : !open}
    >
      {!open ? <MobileAssistCircle onOpen={() => openPanel("assist")} /> : null}
      {!open && !isMobile ? (
        <ShortcutLaunchers
          docked={useDockedChrome}
          onOpenTasks={() => openPanel("tasks")}
          onOpenAssist={() => openPanel("assist")}
          tasksHasRunning={tasksHasRunning}
          tasksShowDone={tasksShowDone}
        />
      ) : null}

      <Button
        pressed={Boolean(open)}
        variant="quiet"
        onClick={() => onOpenChange(false)}
        aria-label="Close sidebar"
        tabIndex={open ? 0 : -1}
      />

      <div
        id="neo-pulse-sidebar-panel"
        ref={panelRef}
        className={cn("fai-sidebar-panel pulse-assist-panel", open && "fai-sidebar-panel--open")}
        role="dialog"
        aria-modal="true"
        aria-label={panelLabel}
      >
        {open && !isMobile ? <PulseAssistSidebarResizeHandle {...handleProps} /> : null}
        {open ? (
          <div
            className="pulse-assist-panel-tablist flex h-8 w-full min-w-0 shrink-0 flex-nowrap items-center gap-1 overflow-hidden bg-black px-1"
            role="tablist"
            aria-label="Sidebar panel"
          >
            {!isMobile ? (
              <Button
                size="icon"
                icon={ChevronRight}
                variant="tool"
                onClick={() => onOpenChange(false)}
                aria-label="Close sidebar and minimize to dock"
                title="Minimize to dock"
              />
            ) : null}
            <WorkspacePill
              label="Assist"
              active={panel === "assist"}
              square
              className="h-8 w-auto min-w-0 flex-1 px-2"
              onClick={() => onPanelChange("assist")}
            />
            <WorkspacePill
              label="Tasks"
              active={panel === "tasks"}
              square
              className="h-8 w-auto min-w-0 flex-1 px-2"
              onClick={() => onPanelChange("tasks")}
            />
            <SidebarIconCluster
              panel={panel}
              isMobile={isMobile}
              onClose={() => onOpenChange(false)}
              onClearTasks={() => {
                if (clearingTasks.current) return;
                clearingTasks.current = true;
                taskManager?.clearAllTasks();
                void clearHistory().finally(() => {
                  clearingTasks.current = false;
                });
              }}
            />
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {open ? children : null}
        </div>
      </div>
    </div>
    </PulseAssistHeaderActionsProvider>
  );
}

/** Clock, help, download, and clear. Same four slots on Assist and Tasks. */
function SidebarIconCluster({
  panel,
  isMobile,
  onClose,
  onClearTasks,
}: {
  panel: SidebarPanel;
  isMobile: boolean;
  onClose: () => void;
  onClearTasks: () => void;
}): ReactElement {
  const actions = usePulseAssistHeaderActions();

  return (
    <div className="flex h-8 shrink-0 items-center gap-1">
      <PulseAssistClock className="shrink-0" />
      <Button
        size="icon"
        icon={CircleHelp}
        variant="tool"
        aria-label="Create a ticket"
        title="Create a ticket"
        onClick={() => actions?.get().createTicket()}
      />
      <Button
        size="icon"
        icon={Download}
        variant="tool"
        aria-label="Download debug log"
        title="Download debug log"
        onClick={() => actions?.get().downloadDebug()}
      />
      <Button
        size="icon"
        icon={Trash2}
        variant="tool"
        aria-label={panel === "tasks" ? "Clear all" : "Clear chat history"}
        title={panel === "tasks" ? "Clear all" : "Clear chat history"}
        onClick={() => {
          if (panel === "tasks") {
            onClearTasks();
            return;
          }
          actions?.get().clearChat();
        }}
      />
      {isMobile ? (
        <Button
          size="icon"
          icon={X}
          variant="tool"
          onClick={onClose}
          aria-label="Close sidebar"
        />
      ) : null}
    </div>
  );
}
