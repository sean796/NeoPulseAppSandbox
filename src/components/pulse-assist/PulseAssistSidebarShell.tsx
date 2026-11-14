import { useEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, FileDown, Search, Sparkles, X } from "lucide-react";
import { useAgentRunsContext } from "@/contexts/use-agent-runs-context";
import { useTaskManagerOptional } from "@/contexts/task-manager-context";
import { cn } from "@/lib/utils";
import { usePulseAssistSidebarResize } from "@/hooks/use-pulse-assist-sidebar-resize";
import { NEO_PULSE_ASSIST_LABEL } from "./PulseAssistBrandTitle";
import { RUNNING_AGENTS_LABEL } from "@/components/agent-runs/AgentRunsBrandTitle";
import { PulseAssistLauncherBrand } from "./PulseAssistLauncherBrand";
import { AgentRunsLauncherBrand } from "@/components/agent-runs/AgentRunsLauncherBrand";
import { TaskManagerLauncherBrand } from "@/components/task-manager/TaskManagerLauncherBrand";
import { PulseAssistSidebarResizeHandle } from "./PulseAssistSidebarResizeHandle";
import { PulseAssistClock } from "./PulseAssistClock";
import { WorkspacePill } from "@/components/shared/WorkspacePill";
import type { PulseAssistLayout } from "./PulseAssistRoot";
import {
  DEFAULT_SEO_SIDEBAR_WIDTH,
  type SidebarPanel,
} from "@/lib/pulse-assist/storage";
import "./pulse-assist-theme.css";
import { Button } from "@/ui";

export const SEO_INSPECTOR_LABEL = "Page SEO";

function SeoLauncherBrand({ className }: { className?: string }): ReactElement {
  return (
    <span className={cn("pulse-assist-launcher-brand", className)}>
      <Search className="pulse-assist-launcher-brand__spark" aria-hidden />
      <span className="pulse-assist-launcher-brand__label">SEO</span>
    </span>
  );
}

function DetailsLauncherBrand({ className }: { className?: string }): ReactElement {
  return (
    <span className={cn("pulse-assist-launcher-brand", className)}>
      <FileDown className="pulse-assist-launcher-brand__spark" aria-hidden />
      <span className="pulse-assist-launcher-brand__label">Details</span>
    </span>
  );
}

type PulseAssistSidebarShellProps = {
  layout?: PulseAssistLayout;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  panel: SidebarPanel;
  onPanelChange: (panel: SidebarPanel) => void;
  showSeo?: boolean;
  showDetails?: boolean;
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
  showSeo = true,
  showDetails = false,
  onOpenSeo,
  onOpenDetails,
  onOpenTasks,
  onOpenAgents,
  onOpenAssist,
  tasksHasRunning = false,
  tasksShowDone = false,
}: {
  docked: boolean;
  showSeo?: boolean;
  showDetails?: boolean;
  onOpenSeo: () => void;
  onOpenDetails: () => void;
  onOpenTasks: () => void;
  onOpenAgents: () => void;
  onOpenAssist: () => void;
  tasksHasRunning?: boolean;
  tasksShowDone?: boolean;
}): ReactElement {
  const launcherClass = cn("pulse-assist-launcher", docked && "pulse-assist-launcher--docked");

  const seoButton = (
    <button type="button"
      onClick={onOpenSeo}
      className={launcherClass}
      aria-label={`Open ${SEO_INSPECTOR_LABEL}`}
      aria-expanded={false}
      aria-controls="neo-pulse-sidebar-panel"
    >
      <SeoLauncherBrand />
    </button>
  );

  const detailsButton = (
    <button type="button"
      onClick={onOpenDetails}
      className={launcherClass}
      aria-label="Open Details"
      aria-expanded={false}
      aria-controls="neo-pulse-sidebar-panel"
    >
      <DetailsLauncherBrand />
    </button>
  );

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

  const agentsButton = (
    <button type="button"
      onClick={onOpenAgents}
      className={launcherClass}
      aria-label={`Open ${RUNNING_AGENTS_LABEL}`}
      aria-expanded={false}
      aria-controls="neo-pulse-sidebar-panel"
    >
      <AgentRunsLauncherBrand />
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
        {showSeo ? seoButton : null}
        {showDetails ? detailsButton : null}
        {tasksButton}
        {agentsButton}
        {assistButton}
      </aside>
    );
  }

  return (
    <>
      {showSeo ? seoButton : null}
      {showDetails ? detailsButton : null}
      {tasksButton}
      {agentsButton}
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
  showSeo = true,
  showDetails = false,
  children,
}: PulseAssistSidebarShellProps): ReactElement {
  const panelRef = useRef<HTMLDivElement>(null);
  const { width, isResizing, isMobile, ensureWidthAtLeast, handleProps } =
    usePulseAssistSidebarResize(open);
  const panelLabel =
    panel === "tasks"
      ? "Task Manager"
      : panel === "agents"
        ? RUNNING_AGENTS_LABEL
        : panel === "seo"
          ? SEO_INSPECTOR_LABEL
          : panel === "details"
            ? "Details"
            : NEO_PULSE_ASSIST_LABEL;
  const { clearHistory, cancelActiveRuns } = useAgentRunsContext();
  const taskManager = useTaskManagerOptional();
  const tasksHasRunning = Boolean(taskManager?.hasRunning);
  const tasksShowDone = Boolean(!tasksHasRunning && taskManager?.latestTerminal?.status === "done");
  const [clearingHistory, setClearingHistory] = useState(false);
  const [cancellingRuns, setCancellingRuns] = useState(false);
  const [clearingTasks, setClearingTasks] = useState(false);
  const [cancellingTasks, setCancellingTasks] = useState(false);
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

  useEffect(() => {
    if (panel === "seo" && open && !isMobile) {
      ensureWidthAtLeast(DEFAULT_SEO_SIDEBAR_WIDTH);
    }
  }, [panel, open, isMobile, ensureWidthAtLeast]);

  const openPanel = (next: SidebarPanel) => {
    onPanelChange(next);
    onOpenChange(true);
  };

  return (
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
          showSeo={showSeo}
          showDetails={showDetails}
          onOpenSeo={() => openPanel("seo")}
          onOpenDetails={() => openPanel("details")}
          onOpenTasks={() => openPanel("tasks")}
          onOpenAgents={() => openPanel("agents")}
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
        {open && !isMobile ? (
          <Button
            size="icon"
            icon={ChevronRight}
            variant="tool"
            onClick={() => onOpenChange(false)}
            aria-label="Close sidebar and minimize to dock"
            title="Minimize to dock"
          />
        ) : null}
        {open && !isMobile ? <PulseAssistSidebarResizeHandle {...handleProps} /> : null}
        {open ? (
          <div
            className="pulse-assist-panel-tablist flex min-h-[2.75rem] min-w-0 shrink-0 items-center gap-1 bg-black px-3 py-2"
            role="tablist"
            aria-label="Sidebar panel"
          >
            <WorkspacePill
              label="Assist"
              active={panel === "assist"}
              square
              onClick={() => onPanelChange("assist")}
            />
            <WorkspacePill
              label="Tasks"
              active={panel === "tasks"}
              square
              onClick={() => onPanelChange("tasks")}
            />
            <WorkspacePill
              label="Agents"
              active={panel === "agents"}
              square
              onClick={() => onPanelChange("agents")}
            />
            {/* Always mounted pill chrome: zero CLS; disabled when unavailable. */}
            <WorkspacePill
              label="Details"
              active={panel === "details"}
              square
              disabled={!showDetails}
              onClick={() => {
                if (!showDetails) return;
                onPanelChange("details");
              }}
            />
            <WorkspacePill
              label="SEO"
              active={panel === "seo"}
              square
              disabled={!showSeo}
              onClick={() => {
                if (!showSeo) return;
                onPanelChange("seo");
              }}
            />
            {isMobile ? (
              <Button
                size="icon"
                icon={X}
                variant="tool"
                onClick={() => onOpenChange(false)}
                aria-label="Close sidebar"
              />
            ) : null}
            <PulseAssistClock />
            {/* Equal action wells + same gap-1 as tabs (no ml-auto void). */}
            <span className="inline-flex h-8 w-[5.75rem] shrink-0 [&>button]:w-full">
              <Button
                variant="tool"
                type="button"
                reserved={panel !== "tasks" && panel !== "agents"}
                disabled={
                  panel === "tasks"
                    ? cancellingTasks || clearingTasks || !tasksHasRunning
                    : cancellingRuns || clearingHistory
                }
                onClick={() => {
                  if (panel === "tasks") {
                    setCancellingTasks(true);
                    taskManager?.cancelRunningTasks();
                    void cancelActiveRuns().finally(() => setCancellingTasks(false));
                    return;
                  }
                  if (panel !== "agents") return;
                  setCancellingRuns(true);
                  void cancelActiveRuns().finally(() => setCancellingRuns(false));
                }}
              >
                {panel === "tasks"
                  ? cancellingTasks
                    ? "Cancel…"
                    : "Cancel"
                  : cancellingRuns
                    ? "Cancel…"
                    : "Cancel"}
              </Button>
            </span>
            <span className="inline-flex h-8 w-[5.75rem] shrink-0 [&>button]:w-full">
              <Button
                variant="tool"
                type="button"
                reserved={panel !== "tasks" && panel !== "agents"}
                disabled={
                  panel === "tasks"
                    ? clearingTasks || cancellingTasks || !taskManager?.tasks.length
                    : clearingHistory || cancellingRuns
                }
                onClick={() => {
                  if (panel === "tasks") {
                    setClearingTasks(true);
                    taskManager?.clearAllTasks();
                    void clearHistory().finally(() => setClearingTasks(false));
                    return;
                  }
                  if (panel !== "agents") return;
                  setClearingHistory(true);
                  void clearHistory().finally(() => setClearingHistory(false));
                }}
              >
                {panel === "tasks"
                  ? clearingTasks
                    ? "Clear…"
                    : "Clear all"
                  : clearingHistory
                    ? "Clear…"
                    : "Clear all"}
              </Button>
            </span>
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {open ? children : null}
        </div>
      </div>
    </div>
  );
}
