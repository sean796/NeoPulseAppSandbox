import type { CSSProperties } from "react";
import {
  agentRunsBucketSelectSlotProps,
  agentRunsPickerRowStyle,
} from "@/components/agent-runs/agent-runs-bucket-select-width";

/**
 * Tasks kind select uses the exact same fixed slot as Agents bucket select
 * so switching Tasks ↔ Agents never shifts the filter row.
 */
export function taskKindSelectSlotProps(): { className: string; style: CSSProperties } {
  return agentRunsBucketSelectSlotProps();
}

/** Same CSS var row style Agents uses for shared client + kind widths. */
export function taskPickerRowStyle(): CSSProperties {
  return agentRunsPickerRowStyle();
}
