import React from "react";
import { cn } from "@/lib/utils";

/**
 * Row metric loading graphic — same language as BulkSplashVisual
 * (zinc pulse bars + primary accent), sized for the posts+entity cluster.
 * No brand wordmark.
 */
export function PropertyMetricCountLoadingMark({
  className,
}: {
  className?: string;
  /** @deprecated ignored — parent sets size */
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "box-border flex h-full w-full min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-none border-0 bg-zinc-950 px-1.5 select-none",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label="Counting"
    >
      <style>{`
        @keyframes propertyMetricRowSplashBreathe {
          0%, 100% { opacity: 0.72; transform: scale(0.99); }
          50% { opacity: 1; transform: scale(1); }
        }
        @keyframes propertyMetricRowSplashBar {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 1; }
        }
      `}</style>
      <span
        className="flex w-full max-w-full flex-col gap-1"
        style={{ animation: "propertyMetricRowSplashBreathe 2.2s ease-in-out infinite" }}
        aria-hidden="true"
      >
        <span className="flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 shrink-0 rounded-sm bg-primary/50" />
          <span
            className="h-2.5 flex-1 rounded-sm bg-zinc-600"
            style={{ animation: "propertyMetricRowSplashBar 1.4s ease-in-out infinite" }}
          />
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 shrink-0 rounded-sm bg-zinc-700" />
          <span
            className="h-2.5 w-3/5 rounded-sm bg-zinc-700"
            style={{ animation: "propertyMetricRowSplashBar 1.4s ease-in-out 0.2s infinite" }}
          />
        </span>
      </span>
    </span>
  );
}
