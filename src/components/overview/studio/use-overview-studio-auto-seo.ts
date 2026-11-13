import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import type { OverviewTabController } from "@/hooks/overview/use-overview-tab-controller";
import type { BulkDetailsDownloadable } from "@/components/shared/bulk-details-tile-sections-helpers";
import type { BulkGeneratorDetailsPanelProps } from "@/components/keyword-research/bulk/BulkGeneratorDetailsPanel";
import type { StudioEditorModeId } from "@/components/keyword-research/bulk/studio-editor-modes";

export const STUDIO_ACTION_STATES = ["Ideas", "Curating", "Generate", "Generating", "Approve", "Publish", "Publishing"] as const;

export interface BulkGeneratorStudioAction {
  stage: "ideas" | "generate" | "approve" | "publish";
  running: boolean;
  canRun: boolean;
  /** Ignored for `publish`; the canvas publishes the active row itself. */
  onRun: () => void;
}

export interface OverviewVisualDocCanvasProps {
  ctrl: OverviewTabController;
  row: OverviewRow | null;
  rowIndex: number;
  bulkWorkspaceBusy: boolean;
  bulkMicroSnapshot?: MetaBulkMicroSnapshot | null;
  batchBulkState?: BulkOptimizationState;
  optimizingRowUrl?: string | null;
  onInFlightAutoSeoUrlChange?: (url: string | null) => void;
  onOpenRevisions?: () => void;
  bulkGeneratorStudioActions?: BulkGeneratorStudioAction;
  /** Newest prompt log for the active bulk row (all model calls), shown as a header download. */
  promptLogFile?: BulkDetailsDownloadable | null;
  bulkGeneratorDetailsPanel?: BulkGeneratorDetailsPanelProps;
  customDrawerContent?: ReactNode;
  bulkGeneratedFilesPanelId?: string;
  bulkGeneratorBand2Toolbar?: ReactNode;
  studioBody?: ReactNode;
  studioEditorMode?: StudioEditorModeId;
  onStudioEditorModeChange?: (mode: StudioEditorModeId) => void;
  /** CSV title + URL slug agents in flight (hide raw keyword paths in header). */
  bulkTitleUrlOptimizing?: boolean;
  /** AI status line for the bulk generation splash (replaces LOADING when set). */
  bulkSplashStatusText?: string;
  /** Placeholder graphic kind paired with the bulk generation status line. */
  bulkSplashStatusVisual?: import("@/lib/bulk/bulk-splash-status-agent").BulkSplashVisualKind;
  /** Show the splash over the compose (studioBody) area, used while generating blog ideas. */
  composeSplashVisible?: boolean;
  /** AI status line for the compose-area splash. */
  composeSplashStatusText?: string;
  /** Placeholder graphic kind paired with the compose-area status line. */
  composeSplashStatusVisual?: import("@/lib/bulk/bulk-splash-status-agent").BulkSplashVisualKind;
}

type Args = {
  c: OverviewTabController;
  row: OverviewRow | null;
  bodyHtml: string;
  onInFlightAutoSeoUrlChange?: (url: string | null) => void;
  isViewedRowOptimizing: boolean;
};

export function useOverviewStudioAutoSeo({
  c,
  row,
  bodyHtml,
  onInFlightAutoSeoUrlChange,
  isViewedRowOptimizing,
}: Args) {
  const [fullAutoRunning, setFullAutoRunning] = useState(false);
  const [passageStatus, setPassageStatus] = useState<{
    label: string;
    current: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    if (!isViewedRowOptimizing) {
      setPassageStatus(null);
    }
  }, [row?.url, isViewedRowOptimizing]);

  const handleAutoSeo = useCallback(() => {
    void c.handleOptimizeAll();
  }, [c]);

  return { handleAutoSeo, fullAutoRunning, passageStatus, setPassageStatus };
}
