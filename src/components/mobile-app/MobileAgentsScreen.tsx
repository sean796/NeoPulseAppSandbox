import { useEffect } from "react";
import { AgentRunsPanel } from "@/components/agent-runs/AgentRunsPanel";
import { useAgentRunsContext } from "@/contexts/use-agent-runs-context";

export function MobileAgentsScreen({
  pushRunId = null,
  onPushRunHandled,
}: {
  pushRunId?: number | null;
  onPushRunHandled?: () => void;
}) {
  const { setSidebarPanel, selectRun } = useAgentRunsContext();

  useEffect(() => {
    setSidebarPanel("tasks");
  }, [setSidebarPanel]);

  useEffect(() => {
    if (!pushRunId) return;
    selectRun(pushRunId);
    onPushRunHandled?.();
  }, [onPushRunHandled, pushRunId, selectRun]);

  return (
    <div className="mobile-screen mobile-screen--agents flex h-full min-h-0 flex-col overflow-hidden">
      <AgentRunsPanel />
    </div>
  );
}
