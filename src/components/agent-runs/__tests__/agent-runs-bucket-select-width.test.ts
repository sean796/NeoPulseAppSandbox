import { describe, expect, it } from "vitest";
import {
  AGENT_RUNS_PICKER_CONTROL_WIDTH_VAR,
  agentRunsBucketSelectSlotProps,
  agentRunsBucketSelectWidthStyle,
  agentRunsPickerControlWidthRem,
  agentRunsPickerRowStyle,
} from "@/components/agent-runs/agent-runs-bucket-select-width";
import {
  taskKindSelectSlotProps,
  taskPickerRowStyle,
} from "@/components/task-manager/task-kind-select-width";

describe("agent-runs picker shared width", () => {
  it("exports one rem width for client + kind/bucket", () => {
    const rem = agentRunsPickerControlWidthRem();
    expect(rem).toMatch(/^\d+(\.\d+)?rem$/);
    expect(agentRunsBucketSelectWidthStyle().width).toBe(rem);
    expect(agentRunsBucketSelectSlotProps().style.width).toBe(rem);
  });

  it("sets the CSS var on the picker row style", () => {
    const row = agentRunsPickerRowStyle() as Record<string, string>;
    expect(row[AGENT_RUNS_PICKER_CONTROL_WIDTH_VAR]).toBe(agentRunsPickerControlWidthRem());
  });

  it("Tasks aliases match Agents slot and row styles", () => {
    expect(taskKindSelectSlotProps()).toEqual(agentRunsBucketSelectSlotProps());
    expect(taskPickerRowStyle()).toEqual(agentRunsPickerRowStyle());
  });
});
