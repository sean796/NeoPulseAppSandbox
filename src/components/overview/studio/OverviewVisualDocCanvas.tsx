import { useEffect, useMemo, useRef } from "react";
import { FileText, Play, RefreshCw, Sparkles, Upload } from "lucide-react";
import { useAgentRunsContext } from "@/contexts/use-agent-runs-context";
import { OverviewDocSectionBlocks } from "@/components/overview/studio/OverviewDocSectionBlock";
import { buildElementorPageHtml } from "@/lib/elementor-page-content/elementor-page-html";
import { overviewStudioRowFromWarmInventory } from "@/lib/overview/overview-studio-row-inventory-merge";
import { isOverviewRowOptimizationActive } from "@/components/overview/overview-tab/overview-bulk-run-helpers";
import { metaDisplayTitle, bulkStudioRowPathLabel, bulkStudioRowPublicUrl, overviewRowUrlPathLabel, overviewTitlePrimarySegment } from "@/lib/overview/overview-tab-display";
import { overviewStudioUrlBoxLabel } from "@/lib/overview/overview-studio-url-box-label";
import { setStudioDocMetaInspectorBridge } from "@/lib/overview/studio-doc-meta-bridge";
import { writeSidebarOpen, writeSidebarPanel } from "@/lib/pulse-assist/storage";
import { useOverviewSiteWarmDetails } from "@/hooks/overview/use-overview-site-warm-details";
import { ContentOptimizerSplashOverlay } from "@/components/overview/studio/ContentOptimizerSplashOverlay";
import { OverviewStudioGeneratedFilesBand } from "@/components/overview/studio/OverviewStudioGeneratedFilesBand";
import { UniversalStudioHeader } from "@/components/overview/studio/UniversalStudioHeader";
import { OverviewStudioDetailsDrawerContent } from "@/components/overview/studio/OverviewStudioDetailsDrawerContent";
import { useOverviewStudioDrawerSteps } from "@/components/overview/studio/use-overview-studio-drawer-steps";
import { useOverviewStudioAutoSeo, STUDIO_ACTION_STATES, type OverviewVisualDocCanvasProps } from "@/components/overview/studio/use-overview-studio-auto-seo";
import type { BulkSplashVisualKind } from "@/lib/bulk/bulk-splash-status-agent";
import type { RowStatus } from "@/components/overview/overview-meta-row-types";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import { cn } from "@/lib/utils";
import { ActionButton, Button, Tooltip, TooltipContent, TooltipTrigger } from "@/ui";

function splashFromBatchStep(
  step: string | undefined,
  rowStatus: RowStatus | undefined,
): { text: string; visual: BulkSplashVisualKind } {
  const s = step?.trim() ?? "";
  if (s === "Uploading to WordPress" || s === "Publishing to WordPress" || rowStatus === "uploading") {
    return { text: "Uploading to WordPress", visual: "publish" };
  }
  if (s === "Reading Data" || s === "SERP Research Brief") {
    return { text: s || "Reading Data", visual: "research" };
  }
  if (s === "Optimizing content" || rowStatus === "optimizing" || s) {
    return { text: s || "Optimizing content", visual: "writing" };
  }
  return { text: "Optimizing content", visual: "writing" };
}

export function OverviewVisualDocCanvas({
  ctrl: c,
  row,
  rowIndex,
  bulkWorkspaceBusy,
  bulkMicroSnapshot,
  batchBulkState,
  optimizingRowUrl,
  onInFlightAutoSeoUrlChange,
  onOpenRevisions,
  bulkGeneratorStudioActions,
  promptLogFile = null,
  bulkGeneratorDetailsPanel,
  customDrawerContent,
  bulkGeneratedFilesPanelId = "bulk-generator-generated-files-panel",
  bulkGeneratorBand2Toolbar,
  studioBody,
  studioEditorMode,
  onStudioEditorModeChange,
  bulkTitleUrlOptimizing = false,
  bulkSplashStatusText,
  bulkSplashStatusVisual,
  composeSplashVisible = false,
  composeSplashStatusText,
  composeSplashStatusVisual,
}: OverviewVisualDocCanvasProps) {
  const isBulkGeneratorStudio = Boolean(bulkGeneratorStudioActions || studioEditorMode);
  const siteWarm = useOverviewSiteWarmDetails(c.site ?? undefined);
  const hasRow = Boolean(row && rowIndex >= 0);
  const showStudioEmptyPrompt = !c.site?.id;
  const { setSidebarOpen, setSidebarPanel } = useAgentRunsContext();
  const studioRow = useMemo(() => {
    if (!row || !c.site) return row ?? null;
    return overviewStudioRowFromWarmInventory(row, c.site, c.sitemapSource);
  }, [row, c.site, c.sitemapSource]);

  const isElementorRow = Boolean(
    !isBulkGeneratorStudio &&
      studioRow &&
      (c.sitemapSource === "pages" ||
        studioRow.contentFormat === "elementor" ||
        Boolean(studioRow.elementorDataJson?.trim())),
  );

  // One path: studio body is the row's post HTML. Pages may render Elementor JSON.
  const bodyHtml = useMemo(() => {
    if (!studioRow) return "";
    const liveHtml = studioRow.postContentOptimized?.trim() || studioRow.postContent?.trim() || "";
    if (isElementorRow && studioRow.elementorDataJson?.trim() && !liveHtml) {
      return buildElementorPageHtml(studioRow.elementorDataJson);
    }
    return liveHtml;
  }, [studioRow, isElementorRow]);

  const siteId = c.site?.id ?? "";
  const batchKey = siteId ? `${siteId}-batch` : "";
  const activeBatchState =
    batchBulkState ?? (batchKey ? c.opt.bulkOptimizationState[batchKey] : undefined);
  const singleProgress = siteId ? c.opt.optimizationProgress[siteId] : undefined;
  const batchProgress = batchKey ? c.opt.optimizationProgress[batchKey] : undefined;
  const isViewedRowOptimizing = Boolean(
    row && isOverviewRowOptimizationActive(row.url, optimizingRowUrl),
  );
  const busy = isViewedRowOptimizing;

  const { site, handleScrapeRow } = c;
  const syncedUrlRef = useRef("");
  // Open a row with no saved body → one Sync. List stays cached until Refresh.
  useEffect(() => {
    if (isBulkGeneratorStudio) return;
    if (!site || !row?.url?.trim() || rowIndex < 0) return;
    if (row.status === "scraping") return;
    if ((row.postContentOptimized || row.postContent || "").trim()) return;
    const urlKey = normalizePageUrlKey(row.url);
    if (!urlKey || syncedUrlRef.current === urlKey) return;
    syncedUrlRef.current = urlKey;
    void handleScrapeRow(rowIndex);
  }, [isBulkGeneratorStudio, site, row?.url, row?.status, row?.postContent, row?.postContentOptimized, rowIndex, handleScrapeRow]);

  const { handleAutoSeo, fullAutoRunning, passageStatus, setPassageStatus } =
    useOverviewStudioAutoSeo({
      c,
      row,
      bodyHtml,
      onInFlightAutoSeoUrlChange,
      isViewedRowOptimizing,
    });

  const { drawerStepRows, effectiveSnapshot, activeOptimizingSectionTitle } =
    useOverviewStudioDrawerSteps({
      c,
      row,
      isBulkGeneratorStudio,
      activeBatchState,
      busy,
      isViewedRowOptimizing,
      bulkMicroSnapshot,
      passageStatus,
      fullAutoRunning,
      studioRow,
      isElementorRow,
      bodyHtml,
      siteId,
    });


  const bandBusy =
    isBulkGeneratorStudio ? bulkWorkspaceBusy || busy || bulkTitleUrlOptimizing : busy;

  // Keep splash up for the whole Auto SEO path, including WordPress upload.
  // Never exclude "uploading" or the overlay cuts to content then pops back.
  // Scraping/Sync must not cover the open post with a splash.
  const rowPipelineActive = Boolean(
    row?.status &&
      row.status !== "idle" &&
      row.status !== "error" &&
      row.status !== "scraping",
  );
  const batchStepHoldSplash = Boolean(
    activeBatchState?.currentStep?.trim() &&
      isViewedRowOptimizing &&
      row?.status !== "error",
  );

  const optimizerSplashActive =
    !isBulkGeneratorStudio &&
    !studioBody &&
    hasRow &&
    row?.status !== "error" &&
    (busy || fullAutoRunning || rowPipelineActive || batchStepHoldSplash);

  const rawTitleForSplash = hasRow && row ? metaDisplayTitle(row, c.wpTitlesByUrl) : "";

  const bulkContentSplashVisible =
    !studioBody &&
    hasRow &&
    row?.status !== "error" &&
    (isBulkGeneratorStudio
      ? bulkWorkspaceBusy || busy || rowPipelineActive || batchStepHoldSplash
      : optimizerSplashActive);

  const optimizerSplash = splashFromBatchStep(activeBatchState?.currentStep, row?.status);
  const effectiveSplashStatusText = isBulkGeneratorStudio
    ? bulkSplashStatusText
    : optimizerSplash.text;
  const effectiveSplashStatusVisual = isBulkGeneratorStudio
    ? bulkSplashStatusVisual
    : optimizerSplash.visual;

  // Sync the active row's SERP & Meta inspector into the existing right-hand Pulse Engine sidebar
  useEffect(() => {
    if (!row || rowIndex < 0) {
      setStudioDocMetaInspectorBridge(null);
      return;
    }
    setStudioDocMetaInspectorBridge({
      row,
      rowIndex,
      busy,
      onUpdateRow: c.updateRow,
      onAiKeyword: c.handleAiKeywordRow,
      onAiUrl: c.handleAiUrlRow,
      onAiTitle: c.handleAiTitleRow,
      onAiMeta: c.handleAiMetaRow,
      onAiAllMeta: c.handleAiAllMetaRow,
      onResearchRow: c.handleDataForSeoResearch,
      onSetDateToday: c.handleSetDateToday,
      onCommitDateModifier: c.commitRowDateModifier,
    });
  }, [
    row,
    rowIndex,
    busy,
    c.updateRow,
    c.handleAiKeywordRow,
    c.handleAiUrlRow,
    c.handleAiTitleRow,
    c.handleAiMetaRow,
    c.handleAiAllMetaRow,
    c.handleDataForSeoResearch,
    c.handleSetDateToday,
    c.commitRowDateModifier,
  ]);

  useEffect(() => {
    return () => {
      setStudioDocMetaInspectorBridge(null);
    };
  }, []);

  const openMastraSidebar = () => {
    setSidebarPanel("seo");
    writeSidebarPanel("seo");
    setSidebarOpen(true);
    writeSidebarOpen(true);
  };

  const rawTitle = hasRow && row ? metaDisplayTitle(row, c.wpTitlesByUrl) : "";
  const displayTitle =
    hasRow && row
      ? overviewTitlePrimarySegment(rawTitle) ||
        (isBulkGeneratorStudio ? bulkStudioRowPathLabel(row) : overviewRowUrlPathLabel(row.url)) ||
        row.url
      : isBulkGeneratorStudio
        ? "Blog batch studio"
        : "Visual document studio";

  const drawerBody = (
    <OverviewStudioDetailsDrawerContent
      customDrawerContent={customDrawerContent}
      bulkGeneratorDetailsPanel={bulkGeneratorDetailsPanel}
      hasSite={Boolean(c.site)}
      siteWarm={siteWarm}
      drawerStepRows={drawerStepRows}
    />
  );

  const autoSeoCount = c.selectedCount > 0 ? c.selectedCount : c.displayRows.length;
  const autoSeoLabel = `Auto SEO (${autoSeoCount})`;
  const publishLabel = row?.status === "uploading" ? "Publishing..." : "Publish";
  const syncLabel = "Sync";

  const studioTitleActions = !isBulkGeneratorStudio ? (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="tool"
            icon={RefreshCw}
            type="button"
            disabled={busy || !hasRow}
            onClick={() => void c.handleScrapeRow(rowIndex)}
            aria-label={syncLabel}
            reserved={!hasRow}
          />
        </TooltipTrigger>
        <TooltipContent>{syncLabel}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="run"
            icon={Sparkles}
            type="button"
            disabled={busy || c.displayRows.length === 0}
            onClick={handleAutoSeo}
            aria-label={autoSeoLabel}
            reserved={c.displayRows.length === 0}
          />
        </TooltipTrigger>
        <TooltipContent>{autoSeoLabel}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="tool"
            icon={Upload}
            type="button"
            disabled={busy || !hasRow || !row || row?.status === "uploading"}
            onClick={() => {
              if (!row) return;
              void c.handleUpdateWordPressForRow(row, { rowIndex });
            }}
            aria-label={publishLabel}
            reserved={!hasRow}
          />
        </TooltipTrigger>
        <TooltipContent>{publishLabel}</TooltipContent>
      </Tooltip>
    </>
  ) : null;

  const studioActionButtons = bulkGeneratorStudioActions ? (
    (() => {
      const a = bulkGeneratorStudioActions;
      const publishing = a.stage === "publish" && row?.status === "uploading";
      const running = a.running || publishing;
      const label =
        a.stage === "publish"
          ? publishing
            ? "Publishing"
            : "Publish"
          : running
            ? a.stage === "ideas"
              ? "Curating"
              : "Generating"
            : a.stage === "approve"
              ? "Approve"
              : a.stage === "ideas"
                ? "Ideas"
                : "Generate";

      return (
        <ActionButton
          states={STUDIO_ACTION_STATES}
          state={label}
          icon={Play}
          disabled={
            running || (a.stage === "publish" ? !hasRow || !row : busy || !a.canRun)
          }
          onClick={() => {
            if (a.stage === "publish") {
              if (!row) return;
              void c.handleUpdateWordPressForRow(row, { rowIndex });
              return;
            }
            a.onRun();
          }}
        />
      );
    })()
  ) : null;

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-black font-sans text-base text-white">
      {/* Universal Stacked Studio Header: Row 1 (Studio Mode + External URL Link Out + Drawer Toggle), Row 2 (Filters + Actions), Details Drawer */}
      <UniversalStudioHeader
        studioEditorMode={studioEditorMode}
        onStudioEditorModeChange={onStudioEditorModeChange}
        bulkWorkspaceBusy={bulkWorkspaceBusy}
        activeUrl={row?.url ?? null}
        publicUrl={(() => {
          if (!row) return c.site?.siteUrl ?? null;
          const path = overviewStudioUrlBoxLabel({
            pathLabel: bulkStudioRowPathLabel(row) || overviewRowUrlPathLabel(row.url) || row.url,
            sitemapSource: c.sitemapSource,
          });
          const base = c.site?.siteUrl?.trim();
          if (base && path.startsWith("/")) {
            try {
              const withProto = /^https?:\/\//i.test(base) ? base : `https://${base}`;
              return `${new URL(withProto).origin.replace(/\/$/, "")}${path}`;
            } catch {
              /* fall through */
            }
          }
          return bulkStudioRowPublicUrl(row, c.site?.siteUrl);
        })()}
        titleUrlOptimizing={bulkTitleUrlOptimizing}
        urlDisplayLabel={
          bulkTitleUrlOptimizing
            ? null
            : overviewStudioUrlBoxLabel({
                pathLabel: row
                  ? bulkStudioRowPathLabel(row) || overviewRowUrlPathLabel(row.url) || row.url
                  : "/",
                sitemapSource: c.sitemapSource,
              })
        }
        siteUrl={c.site?.siteUrl ?? null}
        promptLogFile={promptLogFile}
        titleActions={studioTitleActions}
        filters={isBulkGeneratorStudio ? bulkGeneratorBand2Toolbar : undefined}
        actions={studioActionButtons || undefined}
        busy={bandBusy}
        drawerContent={drawerBody}
        detailsPanelId={
          isBulkGeneratorStudio ? bulkGeneratedFilesPanelId : "opt-generated-files-panel"
        }
      />

      {studioBody ? (
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {studioBody}
          <ContentOptimizerSplashOverlay
            visible={composeSplashVisible}
            statusText={composeSplashStatusText}
            statusVisual={composeSplashStatusVisual}
          />
        </div>
      ) : !hasRow || !row ? (
        showStudioEmptyPrompt ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden bg-black p-8 text-center text-base text-muted-foreground">
            <FileText className="h-8 w-8 shrink-0 text-primary" aria-hidden />
            <p className="max-w-md text-white">
              {isBulkGeneratorStudio
                ? "Select a row from the left list to open it in the studio editor."
                : "Select an article from the Left Sitemap Dock to open it in the Visual Document Studio."}
            </p>
          </div>
        ) : c.overviewSitemapLoadBusy || c.displayRows.length === 0 ? (
          <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
            <ContentOptimizerSplashOverlay
              visible
              statusText={
                c.overviewSitemapLoadBusy ? "Refreshing post list" : "Loading post list"
              }
              statusVisual="writing"
              ariaLabel="Loading Visual Document Studio"
            />
          </div>
        ) : (
          <div className="min-h-0 flex-1 bg-black" aria-hidden />
        )
      ) : (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-black">
        <ContentOptimizerSplashOverlay
          visible={bulkContentSplashVisible}
          statusText={effectiveSplashStatusText}
          statusVisual={effectiveSplashStatusVisual}
        />
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-black px-4 py-6 sm:px-8",
            bulkContentSplashVisible && "invisible pointer-events-none",
          )}
        >
          <div className="mx-auto flex w-full max-w-4xl flex-col bg-black px-6 py-7 sm:px-10 sm:py-9">
            <OverviewDocSectionBlocks
              row={studioRow ?? row}
              rowIndex={rowIndex}
              sitemapSource={c.sitemapSource}
              siteId={c.site?.id}
              siteUrl={c.site?.siteUrl}
              businessName={c.site?.name}
              isElementorRow={isElementorRow}
              bodyHtml={bodyHtml}
              busy={busy}
              onUpdateRow={c.updateRow}
              onAiAnswer={c.handleAiAnswerRow}
              onAiOverview={c.handleAiOverviewRow}
              onAiHeaders={c.handleAiHeadersRow}
              onAiLinks={c.handleAiLinksRow}
              onAiWikipediaLink={c.handleAiWikipediaLinkRow}
              onAiScenario={c.handleAiScenarioRow}
              onAiInContentImage={c.handleAiInContentImageRow}
              onAiFaqAll={c.handleAiFaqRowAll}
              onAiFaqQuestion={c.handleAiFaqQuestion}
              onAiFaqAnswer={c.handleAiFaqAnswer}
              onPassageStatusChange={setPassageStatus}
              activeOptimizingSectionTitle={activeOptimizingSectionTitle}
            />
          </div>
        </div>
      </div>
      )}
    </div>
  );
}