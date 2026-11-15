import { describe, expect, it, vi, beforeEach } from "vitest";
import { resolveUpstreamGridCsvFromWorkflow } from "@/lib/entity-page-creator/resolve-upstream-grid-csv";
import type { AgentRunStepOutputSnapshot } from "@/lib/agent-runs/step-output-types";

vi.mock("@/lib/agent-runs-api", () => ({
  fetchAgentRunCsvContent: vi.fn(),
}));

import { fetchAgentRunCsvContent } from "@/lib/agent-runs-api";

const outputs: AgentRunStepOutputSnapshot[] = [
  {
    variableKey: "local_dominator_export_1",
    scope: "run",
    agentRunId: 899,
    fileRefs: [
      {
        name: "grid.csv",
        url: "https://neopulse.local/wp-content/uploads/neo-pulse/agent-runs/899/grid.csv",
        mime: "text/csv",
      },
    ],
  },
];

describe("resolveUpstreamGridCsvFromWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads grid CSV through agent run deliverables API, not a public URL", async () => {
    vi.mocked(fetchAgentRunCsvContent).mockResolvedValue("Business Name,Rank\nTest,1");

    const text = await resolveUpstreamGridCsvFromWorkflow({
      teamId: 1,
      outputs,
      ragInputKeys: ["local_dominator_export_1"],
    });

    expect(text).toContain("Business Name");
    expect(fetchAgentRunCsvContent).toHaveBeenCalledWith(1, 899);
  });
});