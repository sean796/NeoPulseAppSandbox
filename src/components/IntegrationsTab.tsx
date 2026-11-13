import React, { useState, useCallback } from "react";
import { WordPressFeature } from "./integrations/WordPressFeature";
import { GSCFeature } from "./integrations/GSCFeature";
import { EntityGenerationFeature, type EntityGenerationFeatureRef } from "./integrations/entity-generation";
import { type WordPressSite, WORDPRESS_SITES_STORAGE_KEY } from "./integrations/types";
import { getStoredSites } from "./integrations/storage";
import type { ManagerSettingsClusterId } from "@/components/manager/manager-settings-cluster";

export type { WordPressSite } from "./integrations/types";

interface IntegrationsTabProps {
  /** When set, entity sitemap "Generate entities" opens the SAP generator tab with prefill instead of the modal flow. */
  onNavigateToSapGenerator?: (site: WordPressSite, sitemapUrl: string) => void;
  activeDashboardSection?: ManagerSettingsClusterId;
  onDashboardSectionChange?: (id: ManagerSettingsClusterId) => void;
  visibleDashboardSectionIds?: readonly ManagerSettingsClusterId[];
}

export const IntegrationsTab: React.FC<IntegrationsTabProps> = ({
  onNavigateToSapGenerator,
  activeDashboardSection,
  onDashboardSectionChange,
  visibleDashboardSectionIds,
}) => {
  const [entityHandler, setEntityHandler] = useState<{
    openDialog: (site: WordPressSite, sitemapUrl: string) => void;
    isGeneratingEntities: Record<string, boolean>;
  } | null>(null);

  const handleEntityRef = useCallback((ref: EntityGenerationFeatureRef) => {
    setEntityHandler({
      openDialog: ref.openDialog,
      isGeneratingEntities: ref.isGeneratingEntities,
    });
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-0 bg-transparent px-0 py-0 shadow-none ring-0 outline-none">
      <div className="shrink-0">
        <GSCFeature showConnectionCard={false} />
      </div>
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <WordPressFeature
          onEntityGeneration={
            onNavigateToSapGenerator
              ? onNavigateToSapGenerator
              : entityHandler
                ? (site, sitemapUrl) => entityHandler.openDialog(site, sitemapUrl)
                : undefined
          }
          isGeneratingEntities={entityHandler?.isGeneratingEntities ?? {}}
          activeDashboardSection={activeDashboardSection}
          onDashboardSectionChange={onDashboardSectionChange}
          visibleDashboardSectionIds={visibleDashboardSectionIds}
        />
      </div>
      {!onNavigateToSapGenerator ? (
        <div className="shrink-0">
          <EntityGenerationFeature onRef={handleEntityRef} />
        </div>
      ) : null}
    </div>
  );
};
