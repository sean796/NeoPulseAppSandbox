import { describe, expect, it } from "vitest";
import { resolveUpstreamGridCsvUrlFromOutputs } from "@/lib/entity-page-creator/resolve-upstream-grid-csv";
import type { AgentRunStepOutputSnapshot } from "@/lib/agent-runs/step-output-types";

describe("resolveUpstreamGridCsvUrlFromOutputs", () => {
  const outputs: AgentRunStepOutputSnapshot[] = [
    {
      variableKey: "workflow_output",
      scope: "run",
      fileRefs: [{ name: "gsc-report-mom.md", url: "https://example.com/report.md", mime: "text/markdown" }],
    },
    {
      variableKey: "step_ld1",
      scope: "run",
      fileRefs: [{ name: "grid-export.csv", url: "https://example.com/grid.csv", mime: "text/csv" }],
    },
  ];

  it("falls back to any run output when ragInputKeys do not match", () => {
    expect(resolveUpstreamGridCsvUrlFromOutputs(outputs, ["missing_key"])).toBe(
      "https://example.com/grid.csv",
    );
  });
});
