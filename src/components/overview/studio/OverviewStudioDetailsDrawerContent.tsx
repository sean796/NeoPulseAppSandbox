import type { ReactNode } from "react";
import { Download } from "lucide-react";
import { CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS, CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS, contentOptimizerRowStripeClass } from "@/components/overview/overview-tab/overview-tab-content-constants";
import type { BulkDetailsDownloadable } from "@/components/shared/bulk-details-tile-sections-helpers";
import type { BulkGeneratorDetailsPanelProps } from "@/components/keyword-research/bulk/BulkGeneratorDetailsPanel";
import { BulkGeneratorDetailsDrawer } from "@/components/keyword-research/bulk/BulkGeneratorDetailsDrawer";
import { BulkSitemapInventoryRunDetail } from "@/components/keyword-research/bulk/BulkSitemapInventoryRunDetail";
import { WordBlacklistRunDetail } from "@/components/keyword-research/bulk/WordBlacklistRunDetail";
import { HumanizerRunDetail } from "@/components/keyword-research/bulk/HumanizerRunDetail";
import { GoogleSeoRulesRunDetail } from "@/components/keyword-research/bulk/GoogleSeoRulesRunDetail";
import { WindowTreatmentsRunDetail } from "@/components/keyword-research/bulk/WindowTreatmentsRunDetail";
import { siteUsesWindowTreatmentsSkill } from "@/lib/window-treatments-vertical/site-uses-window-treatments-skill";
import type { useOverviewSiteWarmDetails } from "@/hooks/overview/use-overview-site-warm-details";
import type { StudioDrawerStepRow } from "@/components/overview/studio/use-overview-studio-drawer-steps";
import type { WordPressSite } from "@/components/integrations/types";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_CSV_DOWNLOADED } from "@/lib/notify-messages";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

function triggerBlobDownload(file: BulkDetailsDownloadable) {
  const blob = new Blob([file.content], { type: file.mimeType || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type Props = {
  customDrawerContent?: ReactNode;
  bulkGeneratorDetailsPanel?: BulkGeneratorDetailsPanelProps;
  hasSite: boolean;
  site?: WordPressSite | null;
  siteWarm: ReturnType<typeof useOverviewSiteWarmDetails>;
  drawerStepRows: StudioDrawerStepRow[];
};

export function OverviewStudioDetailsDrawerContent({
  customDrawerContent,
  bulkGeneratorDetailsPanel,
  hasSite,
  site,
  siteWarm,
  drawerStepRows,
}: Props) {
  const scrollToSection = (anchorId?: string) => {
    if (!anchorId) return;
    const el = document.getElementById(anchorId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return customDrawerContent ? (

    customDrawerContent
  ) : bulkGeneratorDetailsPanel ? (
    <BulkGeneratorDetailsDrawer {...bulkGeneratorDetailsPanel} />
  ) : (
    <div className="flex flex-col">
      {hasSite ? (
        <>
          <div className={contentOptimizerRowStripeClass(0)}>
            <WordBlacklistRunDetail />
          </div>
          <div className={contentOptimizerRowStripeClass(1)}>
            <HumanizerRunDetail />
          </div>
          <div className={contentOptimizerRowStripeClass(2)}>
            <GoogleSeoRulesRunDetail />
          </div>
          {siteUsesWindowTreatmentsSkill(site) ? (
            <div className={contentOptimizerRowStripeClass(3)}>
              <WindowTreatmentsRunDetail />
            </div>
          ) : null}
          <div className={contentOptimizerRowStripeClass(siteUsesWindowTreatmentsSkill(site) ? 4 : 3)}>
            <BulkSitemapInventoryRunDetail
              links={siteWarm.sitemapInventoryLinks}
              gscHostedLink={siteWarm.gscHostedLink}
              inventoryRows={siteWarm.inventoryRows}
              pinned
            />
          </div>
        </>
      ) : null}
      <ul className="flex flex-col divide-y divide-white/5">
      {drawerStepRows.map((step, idx) => {
        const canDownload = Boolean(step.downloadFile);
        return (
          <li
            key={step.id}
            className={cn(
              "flex min-h-9 w-full items-center gap-3 px-4 py-1.5 text-base",
              contentOptimizerRowStripeClass(idx, {
                isActiveOptimize: step.isActive,
              }),
            )}
          >
            <span
              className={cn(
                "w-6 shrink-0 tabular-nums",
                step.isActive
                  ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS
                  : "text-muted-foreground",
              )}
            >
              {idx + 1}
            </span>

            {step.anchorId ? (
              <Button
                pressed={Boolean(step.isActive)}
                variant="quiet"
                onClick={() => scrollToSection(step.anchorId)}
              >
                {step.title}
              </Button>
            ) : (
              <span
                className={cn(
                  "min-w-0 flex-1 break-words",
                  step.isActive
                    ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS
                    : step.isDone
                      ? "text-white"
                      : "text-muted-foreground",
                )}
              >
                {step.title}
              </span>
            )}

            <Button
              variant="quiet"
              type="button"
              disabled={!canDownload}
              onClick={() => {
                if (!step.downloadFile) return;
                triggerBlobDownload(step.downloadFile);
                notify.success(NOTIFY_CSV_DOWNLOADED);
              }}
            >
              <Download className="mr-1 h-3 w-3" />
              File
            </Button>
          </li>
        );
      })}
      </ul>
    </div>
  );
}
