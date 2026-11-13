import React from "react";
import { FileText, MapPin, Sparkles } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui";
import { cn } from "@/lib/utils";
import type { WordPressSite } from "../types";
import type { OptimizationActivityTileStats, QuarterEditorialTileStats } from "@/lib/wordpress-api/types";
import type { WordPressPropertyRowDisplay } from "@/lib/wordpress-properties-row-display";
import { isEntitySitemapDisabled } from "@/lib/entity-endpoint-extractor";
import { siteHasWpCredentials } from "./wordpress-site-list-stats";
import { editorialQuotasForSite } from "@/lib/editorial-content-package";
import {
  PROPERTY_METRIC_COUNT_SLOT_CLASS,
  formatQuarterCountCell,
  formatScheduledVsQuota,
  nextEditorialPeriodTooltipText,
  propertyMetricCellClass,
  propertyMetricCellWidths,
  propertyMetricsLoadingClusterClass,
  quarterPairTotalForStrip,
  quarterStripTooltip,
} from "./wordpress-site-list-metrics";
import {
  PROPERTIES_DOCK_COUNT_CLASS,
} from "./wordpress-properties-surfaces";
import { PropertyMetricCountLoadingMark } from "./PropertyMetricCountLoadingMark";

/** Same box as the two dock count slots before refresh. text-xs line = 1.5rem. Never shrink the row. */
const DOCK_COUNTS_SLOT_CLASS =
  "inline-flex h-6 min-h-6 max-h-6 w-[6rem] min-w-[6rem] max-w-[6rem] shrink-0 items-center justify-start overflow-hidden";

/**
 * Square zinc two-bar SVG loader. Dock forces opacity:1, so breathe + gloss use transform.
 * Slot stays h-6 × 6rem.
 */
function DockRowCountMark() {
  const uid = React.useId().replace(/:/g, "");
  const fillId = `dockCountBarFill-${uid}`;
  const glossId = `dockCountBarGloss-${uid}`;
  const clipTopId = `dockCountBarClipTop-${uid}`;
  const clipBotId = `dockCountBarClipBot-${uid}`;

  return (
    <span
      className="inline-flex h-6 max-h-6 w-[6rem] max-w-[6rem] items-center justify-start overflow-hidden"
      aria-hidden
    >
      <style>{`
        @keyframes dock-count-bar-breathe {
          0%, 100% { transform: scaleY(0.55); }
          50% { transform: scaleY(1); }
        }
        @keyframes dock-count-bar-flash {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(220%); }
        }
      `}</style>
      <svg
        viewBox="0 0 96 24"
        width="96"
        height="24"
        className="block h-6 w-[6rem] shrink-0 overflow-visible"
        role="presentation"
      >
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#71717a" />
            <stop offset="45%" stopColor="#3f3f46" />
            <stop offset="100%" stopColor="#27272a" />
          </linearGradient>
          <linearGradient id={glossId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.28)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <clipPath id={clipTopId}>
            <rect x="0" y="3" width="58" height="7" rx="0" ry="0" />
          </clipPath>
          <clipPath id={clipBotId}>
            <rect x="0" y="14" width="96" height="7" rx="0" ry="0" />
          </clipPath>
        </defs>
        <g
          style={{
            transformOrigin: "29px 6.5px",
            animation: "dock-count-bar-breathe 2.4s ease-in-out infinite",
          }}
        >
          <rect x="0" y="3" width="58" height="7" rx="0" ry="0" fill={`url(#${fillId})`} />
          <g clipPath={`url(#${clipTopId})`}>
            <rect
              x="0"
              y="3"
              width="28"
              height="7"
              fill={`url(#${glossId})`}
              style={{ animation: "dock-count-bar-flash 3.6s ease-in-out infinite" }}
            />
          </g>
        </g>
        <g
          style={{
            transformOrigin: "48px 17.5px",
            animation: "dock-count-bar-breathe 2.4s ease-in-out 0.2s infinite",
          }}
        >
          <rect x="0" y="14" width="96" height="7" rx="0" ry="0" fill={`url(#${fillId})`} />
          <g clipPath={`url(#${clipBotId})`}>
            <rect
              x="0"
              y="14"
              width="36"
              height="7"
              fill={`url(#${glossId})`}
              style={{ animation: "dock-count-bar-flash 3.6s ease-in-out 0.35s infinite" }}
            />
          </g>
        </g>
      </svg>
    </span>
  );
}

export function QuarterEditorialCountsStrip({
  site,
  stats,
  rowDisplay = "compact",
  countsBatchPending = false,
  variant = "default",
  dockActive = false,
}: {
  site: WordPressSite;
  stats: QuarterEditorialTileStats | undefined;
  rowDisplay?: WordPressPropertyRowDisplay;
  /** Parent batch flag — keep splash until every site finishes, then fade together. */
  countsBatchPending?: boolean;
  /** Dock palette: plain trailing counts, no black frames. */
  variant?: "default" | "dock";
  dockActive?: boolean;
}) {
  if (!siteHasWpCredentials(site) || !stats) return null;

  const editorialQuotas = editorialQuotasForSite(site);

  const hasManualEndpoint = Boolean(site.manualEndpoint?.trim());
  const sitemapDisabled = isEntitySitemapDisabled(site) && !hasManualEndpoint;
  const entityCountsPending =
    (stats.loading || countsBatchPending) &&
    stats.entityConfigured &&
    !stats.entityCountsAvailable;
  const showEntityCount =
    !sitemapDisabled && stats.entityConfigured && (stats.entityCountsAvailable || entityCountsPending);

  const countsLoading = stats.loading || countsBatchPending;
  const postsTotal = quarterPairTotalForStrip(stats.postsLive, stats.postsScheduled, countsLoading);
  const entitiesTotal = showEntityCount
    ? quarterPairTotalForStrip(stats.entityLive, stats.entityScheduled, countsLoading)
    : null;
  const compact = rowDisplay === "compact";
  const mw = propertyMetricCellWidths(rowDisplay);
  const metricCell = propertyMetricCellClass(compact);
  const iconClass = cn("shrink-0 text-primary", compact ? "h-4 w-4" : "h-5 w-5");
  const countClass = cn(
    PROPERTY_METRIC_COUNT_SLOT_CLASS,
    "shrink-0 font-medium tracking-tight text-foreground tabular-nums",
    compact ? "text-lg leading-none" : "text-xl leading-none",
  );
  const postsMetricLabel = editorialQuotas
    ? formatScheduledVsQuota(postsTotal, editorialQuotas.blogsPerMonth, false)
    : formatQuarterCountCell(postsTotal, false);
  const entityMetricLabel =
    editorialQuotas && showEntityCount
      ? formatScheduledVsQuota(entitiesTotal, editorialQuotas.sapsPerMonth, false)
      : formatQuarterCountCell(entitiesTotal, false);

  const stripSummaryTitle = stats.errorTitle
    ? `${stats.errorTitle}. ${quarterStripTooltip(stats, countsLoading)}`
    : quarterStripTooltip(stats, countsLoading);

  const postsTooltipIso = stats.countsPeriodEndExclusiveIso?.trim();
  const postsTooltip = postsTooltipIso ? nextEditorialPeriodTooltipText(postsTooltipIso) : "";

  const stop = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  if (variant === "dock") {
    const countClass = PROPERTIES_DOCK_COUNT_CLASS;
    const white = {
      color: "#ffffff",
      WebkitTextFillColor: "#ffffff",
      opacity: 1,
      filter: "none",
    } as const;
    if (countsLoading) {
      return (
        <span
          className={cn(DOCK_COUNTS_SLOT_CLASS, "!text-white")}
          title={stripSummaryTitle}
          onClick={stop}
          onPointerDown={stop}
          aria-label="Counting editorial posts"
          style={white}
        >
          <DockRowCountMark />
        </span>
      );
    }
    return (
      <span
        className={cn(DOCK_COUNTS_SLOT_CLASS, "dock-count-fade justify-start gap-2 !text-white")}
        title={stripSummaryTitle}
        onClick={stop}
        onPointerDown={stop}
        style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
      >
        <span
          className={countClass}
          style={white}
          aria-label={showEntityCount ? "Entities count" : "Entities count unavailable"}
          title={showEntityCount ? "Entities" : "Entities not configured"}
        >
          {showEntityCount ? entityMetricLabel : "—"}
        </span>
        <span className={countClass} style={white} aria-label="Posts count" title="Posts">
          {postsMetricLabel}
        </span>
      </span>
    );
  }

  // One square covering both count label slots (same width as posts + entity cells).
  if (countsLoading) {
    return (
      <div
        className={cn(
          propertyMetricsLoadingClusterClass(rowDisplay),
          "inline-flex shrink-0 items-center justify-center !rounded-none !bg-[#000] border-0 p-0 shadow-none",
        )}
        title={stripSummaryTitle}
        onClick={stop}
        onPointerDown={stop}
        aria-label="Counting editorial posts"
      >
        <PropertyMetricCountLoadingMark />
      </div>
    );
  }

  const postsMetricInner = (
    <span
      className={cn(
        "flex w-full min-w-0 items-center justify-end gap-1 text-foreground",
        postsTooltip && "cursor-default",
      )}
      aria-label={
        editorialQuotas
          ? `Blog posts published and scheduled this month: ${postsMetricLabel}`
          : `Posts in period: ${postsMetricLabel}`
      }
    >
      <FileText className={iconClass} aria-hidden />
      <span className={countClass}>{postsMetricLabel}</span>
    </span>
  );

  const postsFramed = (
    <div
      className={cn(metricCell, mw.posts, "flex items-center justify-end text-foreground")}
      title={stripSummaryTitle}
      onClick={stop}
      onPointerDown={stop}
    >
      {postsTooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{postsMetricInner}</TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-base">
            {postsTooltip}
          </TooltipContent>
        </Tooltip>
      ) : (
        postsMetricInner
      )}
    </div>
  );

  const entityDisabledTitle = sitemapDisabled
    ? "Entity sitemap is disabled in the dashboard. Re-enable it in the Sitemap menu to track this count."
    : "Entity counts not configured for this property";

  const entityFramed = showEntityCount ? (
    <div
      className={cn(metricCell, mw.ent, "flex items-center justify-end text-foreground")}
      title={stripSummaryTitle}
      onClick={stop}
      onPointerDown={stop}
      aria-label={
        editorialQuotas
          ? `SAP posts published and scheduled this month: ${entityMetricLabel}`
          : `Entities in period: ${entityMetricLabel}`
      }
    >
      <span className="inline-flex min-w-0 items-center justify-end gap-1">
        <MapPin className={iconClass} aria-hidden />
        <span className={countClass}>{entityMetricLabel}</span>
      </span>
    </div>
  ) : (
    <div
      className={cn(
        metricCell,
        mw.ent,
        "flex items-center justify-end text-muted-foreground/60 pointer-events-none select-none",
      )}
      title={entityDisabledTitle}
      aria-label={sitemapDisabled ? "Entity sitemap disabled (N/A)" : "Entity counts not configured (N/A)"}
    >
      <span
        className={cn(
          countClass,
          "font-medium text-muted-foreground/70",
          compact ? "text-sm leading-none" : "text-base leading-none",
        )}
      >
        N/A
      </span>
    </div>
  );

  return (
    <span className="inline-flex shrink-0 items-stretch animate-in fade-in duration-300">
      {postsFramed}
      {entityFramed}
    </span>
  );
}

/** Inner flex for metrics placed inside each black metric cell frame. */
const OPT_ACTIVITY_STRIP_CLASS =
  "flex h-full w-full min-w-0 items-center justify-center gap-1.5 tabular-nums text-semantic-analysis-foreground";

export function OptimizationActivityStrip({
  site,
  stats,
  rowDisplay = "compact",
}: {
  site: WordPressSite;
  stats: OptimizationActivityTileStats | undefined;
  rowDisplay?: WordPressPropertyRowDisplay;
}) {
  if (!stats) return null;
  const compact = rowDisplay === "compact";
  const usedForLabel =
    stats.loading && stats.totalOptimized === null
      ? 0
      : stats.totalOptimized ?? 0;
  const label = `${usedForLabel}/${stats.cap}`;
  const remainingForTitle = stats.remaining ?? 0;
  const title = stats.errorTitle
    ? stats.errorTitle
    : `Optimizations this period (${stats.quarterLabel}): published posts and entity CPT (when configured) whose ACF date_modifier falls in this window and is not the same UTC calendar day as the publish date. Remaining: ${remainingForTitle}.`;

  return (
    <div
      className={cn(OPT_ACTIVITY_STRIP_CLASS)}
      title={title}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={title}
    >
      <Sparkles className={cn("shrink-0 text-semantic-analysis-foreground", compact ? "h-4 w-4" : "h-5 w-5")} aria-hidden />
      <span
        className={cn(
          PROPERTY_METRIC_COUNT_SLOT_CLASS,
          "shrink-0 font-light tracking-tight text-semantic-analysis-foreground",
          compact ? "text-lg leading-none" : "text-xl leading-none",
        )}
      >
        {label}
      </span>
    </div>
  );
}
