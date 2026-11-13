import type { StudioEditorModeId } from "@/components/keyword-research/bulk/studio-editor-modes";

export type BulkComposeSplashVisibilityInput = {
  showModeComposeScreen: boolean;
  studioEditorMode: StudioEditorModeId;
  isGeneratingChecklist: boolean;
  hasGeneratedChecklist: boolean;
  filesByRowEmpty: boolean;
  importParsing: boolean;
  csvLoading: boolean;
  csvEnrichingTitlesUrls: boolean;
  /** Import Studio: a CSV or draft file is already loaded (rows ready to Generate). */
  hasImportFile: boolean;
};

/**
 * Compose overlay visibility.
 * Blog Ideas: while ideas generate, and after ideas are ready until row files exist.
 * Import: while parse/enrich, and after file is ready until row files exist (same hold).
 */
export function bulkComposeSplashVisible(input: BulkComposeSplashVisibilityInput): boolean {
  if (!input.showModeComposeScreen) return false;
  if (input.studioEditorMode === "prompt") {
    return (
      input.isGeneratingChecklist ||
      (input.hasGeneratedChecklist && input.filesByRowEmpty)
    );
  }
  if (input.studioEditorMode === "blog-import") {
    const loadBusy =
      input.importParsing || input.csvLoading || input.csvEnrichingTitlesUrls;
    return loadBusy || (input.hasImportFile && input.filesByRowEmpty);
  }
  return false;
}

export function importStudioLoadSplashStep(input: {
  importParsing: boolean;
  csvLoading: boolean;
  csvEnrichingTitlesUrls: boolean;
  hasImportFile?: boolean;
}): string {
  if (input.csvEnrichingTitlesUrls) return "Optimizing titles & URLs";
  if (input.csvLoading) return "Reading CSV";
  if (input.importParsing) return "Parsing draft articles";
  if (input.hasImportFile) return "Waiting for approval";
  return "";
}
