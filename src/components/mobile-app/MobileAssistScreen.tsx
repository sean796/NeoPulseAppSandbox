import { useEffect } from "react";
import { PulseAssistChatPanel } from "@/components/pulse-assist/PulseAssistChatPanel";
import { useAgentRunsContext } from "@/contexts/use-agent-runs-context";
import { MobileAssistInventoryWarm } from "./MobileAssistInventoryWarm";

export function MobileAssistScreen() {
  const { setSidebarPanel } = useAgentRunsContext();

  useEffect(() => {
    setSidebarPanel("assist");
  }, [setSidebarPanel]);

  return (
    <div className="mobile-screen mobile-screen--assist flex h-full min-h-0 flex-col overflow-hidden">
      <MobileAssistInventoryWarm />
      <PulseAssistChatPanel sidebarOpen />
    </div>
  );
}
