import { useEffect } from "react";
import { useAgentRunsContext } from "@/contexts/use-agent-runs-context";
import { TaskManagerPanel } from "@/components/task-manager/TaskManagerPanel";
import { cn } from "@/lib/utils";
import { PulseAssistChatPanel } from "./PulseAssistChatPanel";
import { PulseAssistSidebarShell } from "./PulseAssistSidebarShell";
import { writeSidebarOpen, writeSidebarPanel } from "@/lib/pulse-assist/storage";

export type PulseAssistLayout = "overlay" | "docked";

export type PulseAssistRootProps = {
  layout?: PulseAssistLayout;
};

export function PulseAssistRoot({ layout = "overlay" }: PulseAssistRootProps) {
  const { sidebarOpen, setSidebarOpen, sidebarPanel, setSidebarPanel } = useAgentRunsContext();

  const setOpen = (next: boolean) => {
    setSidebarOpen(next);
    writeSidebarOpen(next);
  };

  const setPanel = (next: typeof sidebarPanel) => {
    setSidebarPanel(next);
    writeSidebarPanel(next);
  };

  useEffect(() => {
    if (sidebarPanel === "seo" || sidebarPanel === "details") {
      setSidebarPanel("assist");
      writeSidebarPanel("assist");
    }
  }, [sidebarPanel, setSidebarPanel]);

  return (
    <PulseAssistSidebarShell
      layout={layout}
      open={sidebarOpen}
      onOpenChange={setOpen}
      panel={sidebarPanel}
      onPanelChange={setPanel}
    >
      <div className={cn("min-h-0 flex-1 overflow-hidden", sidebarPanel === "tasks" ? "flex flex-col" : "hidden")}>
        <TaskManagerPanel />
      </div>
      <div className={cn("min-h-0 flex-1 overflow-hidden", sidebarPanel === "tasks" ? "hidden" : "flex flex-col")}>
        <PulseAssistChatPanel sidebarOpen={sidebarOpen} />
      </div>
    </PulseAssistSidebarShell>
  );
}
