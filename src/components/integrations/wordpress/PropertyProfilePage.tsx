import React from "react";
import type { WordPressSite } from "../types";
import { PropertyOverviewSection } from "./PropertyOverviewSection";
import { SitemapSection } from "./SitemapSection";
import type { PropertySettingsSubSectionId } from "./property-settings-types";
import type { WordPressSiteAdminSectionId } from "./WordPressSiteAdminLayout";

export type PropertyProfilePageProps = {
  site: WordPressSite;
  activeSectionId: WordPressSiteAdminSectionId;
  onActiveSectionChange: (id: WordPressSiteAdminSectionId) => void;
  settingsSubSectionId: PropertySettingsSubSectionId;
  onSettingsSubSectionChange: (id: PropertySettingsSubSectionId) => void;
  siteSettingsPanel: React.ReactNode;
  isTesting: boolean;
  isDetecting: boolean;
  isFetchingScheduled: boolean;
  isScrapingSitemap: Record<string, boolean>;
  isGeneratingEntities?: Record<string, boolean>;
  isIndexingSitemap?: Record<string, boolean>;
  isLoadingCalendar?: Record<string, boolean>;
  isExtractingNAPAndGraph?: boolean;
  onTest: () => void;
  onDetect: () => void;
  onScrapeChildSitemap: (childSitemapUrl: string) => void;
  onEntityGeneration?: (sitemapUrl: string) => void;
  onSetEntitySitemap?: (sitemapUrl: string) => void;
  onSetCompetitorEntitySitemap?: (sitemapUrl: string) => void;
  onToggleChildSitemapDisabled?: (childSitemapUrl: string) => void;
  onAppendManualChildSitemap?: (url: string) => void;
  onAddCustomSitemapTagLabel?: (label: string) => void;
  onToggleChildSystemRole?: (
    childSitemapUrl: string,
    role: import("@/lib/sitemap-child-tags").SitemapSystemRole,
  ) => void;
  onToggleChildCustomTag?: (childSitemapUrl: string, label: string) => void;
  onIndexSitemap?: (sitemapUrl: string) => void;
  onLoadCalendarPosts?: (sitemapUrl: string) => void;
  onExtractNAPAndGraph?: () => void;
  getScrapingKey: (siteId: string, sitemapUrl: string) => string;
  onPatchSite?: (siteId: string, patch: Partial<WordPressSite>) => void;
  onSaveProperty?: () => void;
  onOpenSettingsProfile?: () => void;
};

export function PropertyProfilePage({
  site,
  siteSettingsPanel,
  isTesting,
  isDetecting,
  isScrapingSitemap,
  isGeneratingEntities = {},
  isIndexingSitemap = {},
  isLoadingCalendar = {},
  isExtractingNAPAndGraph = false,
  onTest,
  onDetect,
  onScrapeChildSitemap,
  onEntityGeneration,
  onSetEntitySitemap,
  onSetCompetitorEntitySitemap,
  onToggleChildSitemapDisabled,
  onAppendManualChildSitemap,
  onAddCustomSitemapTagLabel,
  onToggleChildSystemRole,
  onToggleChildCustomTag,
  onIndexSitemap,
  onLoadCalendarPosts,
  onExtractNAPAndGraph,
  getScrapingKey,
  onPatchSite,
}: PropertyProfilePageProps): React.ReactElement {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pt-3 font-sans text-base md:px-5 md:pt-4">
      <PropertyOverviewSection
        site={site}
        isTesting={isTesting}
        isDetecting={isDetecting}
        isExtractingNAPAndGraph={isExtractingNAPAndGraph}
        onTest={onTest}
        onDetect={onDetect}
        onExtractNAPAndGraph={onExtractNAPAndGraph}
        onPatchSite={onPatchSite}
        settingsPanel={siteSettingsPanel}
        sitemapPanel={
          <SitemapSection
            site={site}
            layout="modalFlat"
            isScrapingSitemap={isScrapingSitemap}
            isGeneratingEntities={isGeneratingEntities}
            isIndexingSitemap={isIndexingSitemap}
            isLoadingCalendar={isLoadingCalendar}
            getScrapingKey={getScrapingKey}
            onScrapeChildSitemap={onScrapeChildSitemap}
            onEntityGeneration={onEntityGeneration}
            onSetEntitySitemap={onSetEntitySitemap}
            onSetCompetitorEntitySitemap={onSetCompetitorEntitySitemap}
            onToggleChildSitemapDisabled={onToggleChildSitemapDisabled}
            onIndexSitemap={onIndexSitemap}
            onLoadCalendarPosts={onLoadCalendarPosts}
            onRefreshSitemaps={onDetect}
            isRefreshingSitemaps={isDetecting}
            onAppendManualChildSitemap={onAppendManualChildSitemap}
            onAddCustomSitemapTagLabel={onAddCustomSitemapTagLabel}
            onToggleChildSystemRole={onToggleChildSystemRole}
            onToggleChildCustomTag={onToggleChildCustomTag}
          />
        }
      />
    </div>
  );
}
