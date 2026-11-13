import React, { useLayoutEffect, useRef, useState } from "react";
import { Checkbox } from "@/ui";
import { cn } from "@/lib/utils";
import { CompactWordPressTile } from "./CompactWordPressTile";
import { SiteDisplayNameDialog } from "@/components/manager/SiteDisplayNameDialog";
import type { WordPressSite } from "../types";
import type { OptimizationActivityTileStats, QuarterEditorialTileStats } from "@/lib/wordpress-api/types";
import { OPTIMIZATION_TILE_COUNTS_ENABLED } from "@/lib/wordpress-optimization-tile-counts";
import type { WordPressPropertyRowDisplay } from "@/lib/wordpress-properties-row-display";
import {
  PROPERTIES_DOCK_ACTIVE_ROW_CLASS,
  PROPERTIES_DOCK_COLUMN_HEADER_CLASS,
  PROPERTIES_DOCK_COLUMN_HEADER_LABEL_CLASS,
  PROPERTIES_DOCK_COLUMN_HEADER_METRIC_CLASS,
  PROPERTIES_DOCK_FILLER_ROW_CLASS,
  PROPERTIES_DOCK_ROW_CLASS,
  PROPERTIES_EMPTY,
  PROPERTIES_LIST_SCROLL_CLASS,
  PROPERTIES_LIST_STACK,
  propertiesDockRowStripeClass,
  propertiesRowOuterClass,
} from "./wordpress-properties-surfaces";
import {
  optimizationStatsForSite,
  quarterStatsForSite,
} from "./wordpress-site-list-stats";
import {
  PROPERTY_METRICS_CLUSTER_CLASS,
  propertyMetricCellClass,
  propertyMetricCellWidths,
} from "./wordpress-site-list-metrics";
import {
  OptimizationActivityStrip,
  QuarterEditorialCountsStrip,
} from "./WordPressSiteListMetrics";

export { OptimizationActivityStrip, QuarterEditorialCountsStrip } from "./WordPressSiteListMetrics";

interface WordPressSiteListProps {
  sites: WordPressSite[];
  filteredSites: WordPressSite[];
  editorialPackageFilter?: "all" | "standard" | "lite" | "unassigned";
  siteSearchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenProfile: (site: WordPressSite) => void;
  isTesting: string | null;
  isDetecting: string | null;
  isFetchingScheduled: string | null;
  isScrapingSitemap: Record<string, boolean>;
  isIndexingSitemap: Record<string, boolean>;
  isGeneratingEntities?: Record<string, boolean>;
  isExtractingNAPAndGraph: Record<string, boolean>;
  isLoadingCalendar: Record<string, boolean>;
  onTest: (site: WordPressSite) => void;
  onToggleEnabled: (site: WordPressSite) => void;
  onConnectSite: (site: WordPressSite) => void;
  onDetect: (site: WordPressSite) => void;
  onEdit: (site: WordPressSite) => void;
  onDelete: (siteId: string) => void;
  onScrapeChildSitemap: (site: WordPressSite, url: string) => void;
  onIndexSitemap: (site: WordPressSite, url: string) => void;
  onEntityGeneration?: (site: WordPressSite, sitemapUrl: string) => void;
  onSetEntitySitemap: (site: WordPressSite, sitemapUrl: string) => void;
  onSetCompetitorEntitySitemap: (site: WordPressSite, sitemapUrl: string) => void;
  onToggleChildSitemapDisabled: (site: WordPressSite, childSitemapUrl: string) => void;
  onAppendManualChildSitemap: (site: WordPressSite, url: string) => void;
  onLoadCalendarPosts: (site: WordPressSite, sitemapUrl: string) => void;
  onExtractNAPAndGraph: (site: WordPressSite) => void;
  getScrapingKey: (siteId: string, sitemapUrl: string) => string;
  selectedSiteIds?: Set<string>;
  onSelectAll?: (selected: boolean) => void;
  onSiteSelectedChange?: (siteId: string, selected: boolean) => void;
  onDeleteSelected?: () => void;
  onPatchSite?: (siteId: string, patch: Partial<WordPressSite>) => void;
  quarterStatsBySite?: Record<string, QuarterEditorialTileStats>;
  optimizationStatsBySite?: Record<string, OptimizationActivityTileStats>;
  /** True while Refresh (all months) is in flight — splash until every site settles. */
  countsBatchPending?: boolean;
  editorialSelectedMonthKey?: string;
  editorialMonthOptions?: Array<{ key: string; label: string }>;
  onEditorialMonthChange?: (monthKey: string) => void;
  /** Visual density for property rows only (local preference). */
  propertyRowDisplay?: WordPressPropertyRowDisplay;
  /** Studio dock layout: condensed two-line rows in a narrow left pane. */
  layout?: "full" | "dock";
  /** Site currently shown in the right pane (dock highlight). */
  activeSiteId?: string;
}

export const WordPressSiteList: React.FC<WordPressSiteListProps> = ({
  sites,
  filteredSites,
  editorialPackageFilter = "all",
  siteSearchQuery,
  onSearchChange,
  onOpenProfile,
  isTesting,
  isDetecting,
  isFetchingScheduled,
  isScrapingSitemap,
  isIndexingSitemap,
  isGeneratingEntities = {},
  isExtractingNAPAndGraph,
  isLoadingCalendar,
  onTest,
  onToggleEnabled,
  onConnectSite,
  onDetect,
  onEdit,
  onDelete,
  onScrapeChildSitemap,
  onIndexSitemap,
  onEntityGeneration,
  onSetEntitySitemap,
  onSetCompetitorEntitySitemap,
  onToggleChildSitemapDisabled,
  onAppendManualChildSitemap,
  onLoadCalendarPosts,
  onExtractNAPAndGraph,
  getScrapingKey,
  selectedSiteIds,
  onSelectAll,
  onSiteSelectedChange,
  onDeleteSelected,
  onPatchSite,
  quarterStatsBySite,
  optimizationStatsBySite,
  countsBatchPending = false,
  editorialSelectedMonthKey,
  editorialMonthOptions,
  onEditorialMonthChange,
  propertyRowDisplay = "compact",
  layout = "full",
  activeSiteId,
}) => {
  const isDock = layout === "dock";
  const [canonicalRenameSite, setCanonicalRenameSite] = useState<WordPressSite | null>(null);
  const dockScrollRef = useRef<HTMLDivElement | null>(null);
  const dockStackRef = useRef<HTMLDivElement | null>(null);
  const [dockFillerCount, setDockFillerCount] = useState(0);

  useLayoutEffect(() => {
    if (!isDock) {
      setDockFillerCount(0);
      return;
    }
    const scrollEl = dockScrollRef.current;
    const stackEl = dockStackRef.current;
    if (!scrollEl || !stackEl) return;

    const measure = () => {
      const rowSample =
        stackEl.querySelector<HTMLElement>("[data-dock-real-row='1']") ??
        stackEl.querySelector<HTMLElement>("[data-dock-filler-row='1']");
      const rowHeight = rowSample?.getBoundingClientRect().height || 40;
      const realCount = filteredSites.length;
      const realHeight = realCount * rowHeight;
      const available = scrollEl.clientHeight;
      const next = Math.max(0, Math.floor((available - realHeight) / rowHeight));
      setDockFillerCount((prev) => (prev === next ? prev : next));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scrollEl);
    return () => ro.disconnect();
  }, [isDock, filteredSites.length, siteSearchQuery, editorialPackageFilter]);

  const renderPropertyRowTrailingControls = (site: WordPressSite, dockActive = false) => {
    const stop = (e: React.SyntheticEvent) => e.stopPropagation();
    if (isDock) {
      return (
        <div className="flex min-w-0 shrink-0 items-center" onClick={stop} onPointerDown={stop}>
          <QuarterEditorialCountsStrip
            site={site}
            stats={quarterStatsForSite(
              site,
              quarterStatsBySite,
              editorialSelectedMonthKey ?? "",
            )}
            rowDisplay={propertyRowDisplay}
            countsBatchPending={countsBatchPending}
            variant="dock"
            dockActive={dockActive}
          />
        </div>
      );
    }
    const compact = propertyRowDisplay === "compact";
    const mw = propertyMetricCellWidths(propertyRowDisplay);
    const metricCell = propertyMetricCellClass(compact);
    return (
    <div className="flex min-w-0 shrink-0 items-stretch">
      <div
        className={cn(PROPERTY_METRICS_CLUSTER_CLASS, "shrink-0")}
        onClick={stop}
        onPointerDown={stop}
      >
        {OPTIMIZATION_TILE_COUNTS_ENABLED ? (
          <div className={cn(metricCell, mw.opt)}>
            <OptimizationActivityStrip
              site={site}
              stats={optimizationStatsForSite(site, optimizationStatsBySite)}
              rowDisplay={propertyRowDisplay}
            />
          </div>
        ) : null}
        <QuarterEditorialCountsStrip
          site={site}
          stats={quarterStatsForSite(
            site,
            quarterStatsBySite,
            editorialSelectedMonthKey ?? "",
          )}
          rowDisplay={propertyRowDisplay}
          countsBatchPending={countsBatchPending}
        />
      </div>
    </div>
    );
  };

  if (sites.length === 0) {
    return (
      <div className="mt-0 flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <div className={PROPERTIES_EMPTY}>
          <p className="text-lg text-foreground">No WordPress sites connected</p>
          <p className="mt-2 text-base text-foreground">
            Click &quot;Add Site&quot; to connect your first WordPress site
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-0 flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <SiteDisplayNameDialog
        variant="canonical"
        open={Boolean(canonicalRenameSite)}
        site={canonicalRenameSite}
        onOpenChange={(open) => {
          if (!open) setCanonicalRenameSite(null);
        }}
        onSave={(siteId, name) => {
          const trimmed = name.trim();
          if (!trimmed || !onPatchSite) return;
          onPatchSite(siteId, { name: trimmed });
        }}
      />
      {filteredSites.length === 0 ? (
        <div className={cn(PROPERTIES_EMPTY, "shrink-0 py-8 sm:py-10")}>
          <p className="text-base text-foreground">
            {siteSearchQuery.trim()
              ? `No sites found matching "${siteSearchQuery.trim()}".`
              : editorialPackageFilter !== "all"
                ? `No properties in the ${editorialPackageFilter === "unassigned" ? "Unassigned" : editorialPackageFilter === "lite" ? "Lite" : "Standard"} editorial tier.`
                : "No properties to show."}
          </p>
        </div>
      ) : (
        <>
        {isDock ? (
          <div
            className={PROPERTIES_DOCK_COLUMN_HEADER_CLASS}
            style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
          >
            <span
              className={cn(PROPERTIES_DOCK_COLUMN_HEADER_LABEL_CLASS, "min-w-0 flex-1")}
              style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
            >
              Name
            </span>
            <span className="inline-flex shrink-0 items-center gap-2">
              <span
                className={PROPERTIES_DOCK_COLUMN_HEADER_METRIC_CLASS}
                style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
              >
                Entities
              </span>
              <span
                className={PROPERTIES_DOCK_COLUMN_HEADER_METRIC_CLASS}
                style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
              >
                Posts
              </span>
            </span>
          </div>
        ) : null}
        <div
          ref={isDock ? dockScrollRef : undefined}
          className={PROPERTIES_LIST_SCROLL_CLASS}
        >
        <div ref={isDock ? dockStackRef : undefined} className={PROPERTIES_LIST_STACK}>
          {filteredSites.map((site, index) => {
            const rowSelected = selectedSiteIds?.has(site.id) ?? false;
            const isActive = isDock && activeSiteId === site.id;

            const checkbox =
              !isDock && onSiteSelectedChange ? (
                <div
                  className="flex shrink-0 items-center justify-center pl-0.5"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    checked={rowSelected}
                    onCheckedChange={(c) => onSiteSelectedChange(site.id, c === true)}
                    className="border-border/60 data-[state=checked]:border-border data-[state=checked]:bg-ui-field-hover data-[state=checked]:text-muted-foreground"
                    aria-label={`Select ${site.name}`}
                  />
                </div>
              ) : null;

            const tile = (
              <CompactWordPressTile
                variant="listRow"
                site={site}
                isTesting={isTesting === site.id}
                isExpanded={false}
                onToggle={() => onOpenProfile(site)}
                onTest={() => onTest(site)}
                onToggleEnabled={isDock ? undefined : () => onToggleEnabled(site)}
                propertyRowDisplay={propertyRowDisplay}
                listRowBlackActionChrome
                dock={isDock}
                dockActive={isActive}
                onOpenProfile={() => onOpenProfile(site)}
                onDelete={isDock ? undefined : () => onDelete(site.id)}
                onApplyDisplayNameFromGmb={
                  isDock || !onPatchSite
                    ? undefined
                    : (name) => onPatchSite(site.id, { name })
                }
                onEditCanonicalName={
                  isDock || !onPatchSite
                    ? undefined
                    : () => setCanonicalRenameSite(site)
                }
              />
            );

            const metrics = (
              <div
                className={cn(
                  "flex min-w-0 items-center",
                  "shrink-0",
                  !isDock && (propertyRowDisplay === "compact" ? "gap-2 sm:gap-2" : "gap-3 sm:gap-4"),
                )}
              >
                {renderPropertyRowTrailingControls(site, isActive)}
              </div>
            );

            return (
              <div key={site.id} className="min-w-0 w-full" data-dock-real-row={isDock ? "1" : undefined}>
                <div
                  className={cn(
                    isDock
                      ? cn(
                          PROPERTIES_DOCK_ROW_CLASS,
                          !isActive && propertiesDockRowStripeClass(index),
                          isActive && PROPERTIES_DOCK_ACTIVE_ROW_CLASS,
                        )
                      : propertiesRowOuterClass(
                          propertyRowDisplay,
                          index,
                          rowSelected,
                          true,
                        ),
                  )}
                  style={
                    isDock
                      ? { color: "#ffffff", WebkitTextFillColor: "#ffffff" }
                      : undefined
                  }
                  onClick={isDock ? () => onOpenProfile(site) : undefined}
                >
                  {checkbox}
                  <div className="flex min-h-0 min-w-0 flex-1 items-center border-0 bg-transparent px-0 py-0">
                    {tile}
                  </div>
                  {metrics}
                </div>
              </div>
            );
          })}
          {isDock
            ? Array.from({ length: dockFillerCount }, (_, i) => {
                const stripeIndex = filteredSites.length + i;
                return (
                  <div
                    key={`dock-filler-${stripeIndex}`}
                    data-dock-filler-row="1"
                    className={cn(
                      PROPERTIES_DOCK_FILLER_ROW_CLASS,
                      propertiesDockRowStripeClass(stripeIndex),
                    )}
                    aria-hidden
                  />
                );
              })
            : null}
        </div>
        </div>
        </>
      )}
    </div>
  );
};
