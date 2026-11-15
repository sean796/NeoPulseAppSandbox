import { describe, expect, it } from "vitest";
import { progressDeliverableCommitSignature } from "@/lib/agent-runs/run-browser-automation-client-harness";
describe("progressDeliverableCommitSignature", () => {
  it("uses filename and content length for streaming csv updates", () => {
    const first = progressDeliverableCommitSignature(
      { filename: "site-audit-example.com.csv", kind: "csv", rowIndex: 1 },
      120,
    );
    const second = progressDeliverableCommitSignature(
      { filename: "site-audit-example.com.csv", kind: "csv", rowIndex: 2 },
      240,
    );
    const duplicate = progressDeliverableCommitSignature(
      { filename: "site-audit-example.com.csv", kind: "csv", rowIndex: 3 },
      240,
    );

    expect(first).toBe("site-audit-example.com.csv:120");
    expect(second).toBe("site-audit-example.com.csv:240");
    expect(second).not.toBe(first);
    expect(duplicate).toBe(second);
  });

  it("includes rowIndex for non-streaming deliverables", () => {
    expect(
      progressDeliverableCommitSignature(
        { filename: "capture.jpg", kind: "image", rowIndex: 4 },
        9000,
      ),
    ).toBe("capture.jpg:9000:4");
  });
});
