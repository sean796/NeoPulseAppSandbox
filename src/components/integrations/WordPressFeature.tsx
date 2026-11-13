import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { PROPERTIES_SHELL } from "./wordpress/wordpress-properties-surfaces";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { WordPressSiteList } from "./wordpress/WordPressSiteList";
import { WordPressDialogs } from "./wordpress/WordPressDialogs";
import { SitePropertyEditPanel } from "./wordpress/SitePropertyEditPanel";
import { PropertyProfilePage } from "./wordpress/PropertyProfilePage";
import { BulkImportClientsDialog } from "./wordpress/BulkImportClientsDialog";
import { useQuarterEditorialCounts } from "@/hooks/use-quarter-editorial-counts";
import { useOptimizationActivityCounts } from "@/hooks/use-optimization-activity-counts";
import type { WordPressSite } from "./types";
import {
  fetchAndPersistMissingClientLogos,
  getStoredSites,
  mergeServerGbpLocationIdsIntoLocalSites,
} from "./storage";
import { cn } from "@/lib/utils";
import { useWordPressOptimization } from "@/contexts/wordpress-optimization-context";
import {
  PropertiesDockFooterActions,
  PropertiesWorkspaceToolbar,
} from "@/components/manager/dashboard/PropertiesWorkspaceToolbar";
import { AddClientDockPanel } from "./wordpress/AddClientDockPanel";
import { PROPERTIES_DOCK_CLASS, PROPERTIES_EMPTY } from "./wordpress/wordpress-properties-surfaces";
import { useWordPressFeatureForm } from "./use-wordpress-feature-form";
import { useWordPressFeatureActions } from "./use-wordpress-feature-actions";
import type { ManagerSettingsClusterId } from "@/components/manager/manager-settings-cluster";
import {
  findSiteByDashboardSlug,
  propertyDashboardPath,
  propertySlugFromDashboardPath,
} from "@/lib/properties/property-dashboard-slug";

interface WordPressFeatureProps {
  onEntityGeneration?: (site: WordPressSite, sitemapUrl: string) => void;
  isGeneratingEntities?: Record<string, boolean>;
  activeDashboardSection?: ManagerSettingsClusterId;
  onDashboardSectionChange?: (id: ManagerSettingsClusterId) => void;
  visibleDashboardSectionIds?: readonly ManagerSettingsClusterId[];
}

export const WordPressFeature: React.FC<WordPressFeatureProps> = ({
  onEntityGeneration,
  isGeneratingEntities = {},
  activeDashboardSection,
  onDashboardSectionChange,
  visibleDashboardSectionIds,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const propertySlug = propertySlugFromDashboardPath(location.pathname);

  // Site management hook
  const {
    sites,
    setSites,
    isTesting,
    isDetecting,
    isFetchingScheduled,
    isScrapingSitemap,
    isIndexingSitemap,
    isCheckingFuture,
    isLoadingCalendar,
    handleAddSite: handleAddSiteInit,
    handleEditSite: handleEditSiteInit,
    handleDeleteSite,
    handleDeleteSitesBulk,
    handleToggleEnabled,
    handleConnectSite,
    handleSaveSite,
    handleSaveSitesBulk,
    handleTestConnection,
    handleDetectSitemaps,
    handleFetchScheduledPosts,
    handleScrapeChildSitemap,
    handleIndexSitemap,
    handleCheckFuturePosts,
    handleLoadCalendarPosts,
    handleSetEntitySitemap,
    handleSetCompetitorEntitySitemap,
    handleAddCustomSitemapTagLabel,
    handleToggleChildSystemRole,
    handleToggleChildCustomTag,
    handleToggleChildSitemapDisabled,
    getScrapingKey,
    handlePatchSite,
    handleAppendManualChildSitemap,
    reloadSitesFromStorage,
  } = useWordPressSites();

  const { user } = useAuth();

  const clientLogosBootstrappedRef = useRef(false);
  useEffect(() => {
    if (clientLogosBootstrappedRef.current) return;
    clientLogosBootstrappedRef.current = true;
    void (async () => {
      await mergeServerGbpLocationIdsIntoLocalSites();
      reloadSitesFromStorage();
      const updated = await fetchAndPersistMissingClientLogos(getStoredSites());
      if (updated) {
        reloadSitesFromStorage();
      }
    })();
  }, [reloadSitesFromStorage]);

  const {
    bySiteId: quarterStatsBySite,
    refreshAllQuarterCounts,
    isRefreshingAllQuarterCounts,
    countsBatchPending,
    selectedMonthKey: editorialSelectedMonthKey,
    setSelectedMonthKey: setEditorialSelectedMonthKey,
    monthOptions: editorialMonthOptions,
  } = useQuarterEditorialCounts(sites);

  const {
    bySiteId: optimizationStatsBySite,
    refreshAllOptimizationCounts,
    isRefreshingAllOptimizationCounts,
  } = useOptimizationActivityCounts(sites);

  const credentialedSites = useMemo(
    () =>
      sites.filter(
        (s) => Boolean(s.siteUrl?.trim() && s.username?.trim() && s.appPassword?.trim()),
      ),
    [sites],
  );
  const credentialedSiteCount = credentialedSites.length;

  /** Editorial counts finished for every credentialed property (and no batch refresh in flight). */
  const quarterStatsAllLoaded = useMemo(
    () =>
      !countsBatchPending &&
      credentialedSites.length > 0 &&
      credentialedSites.every((s) => {
        const q = quarterStatsBySite[s.id];
        return Boolean(q && !q.loading);
      }),
    [credentialedSites, quarterStatsBySite, countsBatchPending],
  );

  const quarterStatsFingerprint = useMemo(
    () =>
      credentialedSites
        .map((s) => {
          const q = quarterStatsBySite[s.id];
          if (!q || q.loading) return `${s.id}:L`;
          return [
            s.id,
            q.postsLive ?? "x",
            q.postsScheduled ?? "x",
            q.entityLive ?? "x",
            q.entityScheduled ?? "x",
            q.countsPeriodAfterIso ?? "",
            q.countsPeriodEndExclusiveIso ?? "",
          ].join("|");
        })
        .join(";"),
    [credentialedSites, quarterStatsBySite],
  );


  const { registerIntegrationSites } = useWordPressOptimization();

  useEffect(() => {
    registerIntegrationSites(sites);
  }, [sites, registerIntegrationSites]);

  const [bulkImportDialogOpen, setBulkImportDialogOpen] = useState(false);
  const [propertyEditing, setPropertyEditing] = useState(false);
  const [editorialPackageFilter, setEditorialPackageFilter] = useState<
    "all" | "standard" | "lite" | "unassigned"
  >("all");
  const [siteSearchQuery, setSiteSearchQuery] = useState<string>('');

  const {
    isDialogOpen, setIsDialogOpen, editingSite,
    addClientPanelOpen, addClientStatus, addClientImporting,
    formName, formSiteUrl, formProductionSiteUrl, formUsername, formAppPassword,
    formGa4PropertyId, formGoogleAdsCustomerId, formGbpLocationId, formSemrushSiteAuditProjectId, formSemrushPositionTrackingProjectId,
    formSemrushPositionTrackingCampaignId, formEditorialCountsPeriodStartYmd, formOptimizationPackage, formEditorialContentPackage, formEditorialPublishTimeLocal,
    formBenchmarkCustomTag, formPrimaryLocalKeyword, formClientLogoUrl, formClientLogoBoxTheme,
    formProfileTags, formServiceCity, formServiceState, formServiceCountry,
    setFormName, setFormSiteUrl, setFormProductionSiteUrl, setFormUsername, setFormAppPassword,
    setFormGa4PropertyId, setFormGoogleAdsCustomerId, setFormGbpLocationId, setFormSemrushSiteAuditProjectId, setFormSemrushPositionTrackingProjectId,
    setFormSemrushPositionTrackingCampaignId, setFormEditorialCountsPeriodStartYmd, setFormOptimizationPackage, setFormEditorialContentPackage, setFormEditorialPublishTimeLocal,
    setFormBenchmarkCustomTag, setFormPrimaryLocalKeyword, setFormClientLogoUrl, setFormClientLogoBoxTheme,
    setFormProfileTags, setFormServiceCity, setFormServiceState, setFormServiceCountry,
    profileSite, profileSiteId, profileSectionId,
    setProfileSectionId, settingsSubSectionId, setSettingsSubSectionId,
    filteredSites, tierFilteredSites, openProfile, handleAddSite, handleCancelAddClient,
    handleAiImportClient, handleEditSite, handleSaveSiteClick,
  } = useWordPressFeatureForm({
    sites,
    editorialPackageFilter,
    siteSearchQuery,
    handleAddSiteInit,
    handleEditSiteInit,
    handleSaveSite,
    handleDeleteSitesBulk,
    reloadSitesFromStorage,
  });

  const {
    isExtractingNAPAndGraph,
    handleExportAllSitesCsv,
    handleExtractNAPAndLinkGraph,
  } = useWordPressFeatureActions({
    user,
    sites,
    filteredSites,
    credentialedSiteCount,
    quarterStatsAllLoaded,
    quarterStatsFingerprint,
    handlePatchSite,
  });

  const profileSettingsPanel = profileSite ? (
    <SitePropertyEditPanel
      site={profileSite}
      editingSite={editingSite}
      layout="modalFlat"
      settingsSubSectionId={settingsSubSectionId}
      onSettingsSubSectionChange={setSettingsSubSectionId}
      hideSave
      onDeleteProperty={() => handleDeleteSite(profileSite.id)}
      onTogglePropertyEnabled={() => handleToggleEnabled(profileSite)}
      formName={formName}
      formSiteUrl={formSiteUrl}
      formProductionSiteUrl={formProductionSiteUrl}
      formUsername={formUsername}
      formAppPassword={formAppPassword}
      formGa4PropertyId={formGa4PropertyId}
      formGoogleAdsCustomerId={formGoogleAdsCustomerId}
      formGbpLocationId={formGbpLocationId}
      formSemrushSiteAuditProjectId={formSemrushSiteAuditProjectId}
      formSemrushPositionTrackingProjectId={formSemrushPositionTrackingProjectId}
      formSemrushPositionTrackingCampaignId={formSemrushPositionTrackingCampaignId}
      formEditorialCountsPeriodStartYmd={formEditorialCountsPeriodStartYmd}
      formOptimizationPackage={formOptimizationPackage}
      formEditorialContentPackage={formEditorialContentPackage}
      formEditorialPublishTimeLocal={formEditorialPublishTimeLocal}
      formBenchmarkCustomTag={formBenchmarkCustomTag}
      formPrimaryLocalKeyword={formPrimaryLocalKeyword}
      formClientLogoUrl={formClientLogoUrl}
      formClientLogoBoxTheme={formClientLogoBoxTheme}
      formProfileTags={formProfileTags}
      formServiceCity={formServiceCity}
      formServiceState={formServiceState}
      formServiceCountry={formServiceCountry}
      onFormNameChange={setFormName}
      onFormSiteUrlChange={setFormSiteUrl}
      onFormProductionSiteUrlChange={setFormProductionSiteUrl}
      onFormUsernameChange={setFormUsername}
      onFormAppPasswordChange={setFormAppPassword}
      onFormGa4PropertyIdChange={setFormGa4PropertyId}
      onFormGoogleAdsCustomerIdChange={setFormGoogleAdsCustomerId}
      onFormGbpLocationIdChange={setFormGbpLocationId}
      onFormSemrushSiteAuditProjectIdChange={setFormSemrushSiteAuditProjectId}
      onFormSemrushPositionTrackingProjectIdChange={setFormSemrushPositionTrackingProjectId}
      onFormSemrushPositionTrackingCampaignIdChange={setFormSemrushPositionTrackingCampaignId}
      onFormEditorialCountsPeriodStartYmdChange={setFormEditorialCountsPeriodStartYmd}
      onFormOptimizationPackageChange={setFormOptimizationPackage}
      onFormEditorialContentPackageChange={setFormEditorialContentPackage}
      onFormEditorialPublishTimeLocalChange={setFormEditorialPublishTimeLocal}
      onFormBenchmarkCustomTagChange={setFormBenchmarkCustomTag}
      onFormPrimaryLocalKeywordChange={setFormPrimaryLocalKeyword}
      onFormClientLogoUrlChange={setFormClientLogoUrl}
      onFormClientLogoBoxThemeChange={setFormClientLogoBoxTheme}
      onFormProfileTagsChange={setFormProfileTags}
      onFormServiceCityChange={setFormServiceCity}
      onFormServiceStateChange={setFormServiceState}
      onFormServiceCountryChange={setFormServiceCountry}
      serviceAreaSite={profileSite}
      onPatchSite={handlePatchSite}
      patchSiteId={profileSite.id}
      semrushActionsDisabled={profileSite.enabled === false}
      onSave={handleSaveSiteClick}
    />
  ) : null;

  const displaySite = profileSite ?? tierFilteredSites[0] ?? null;

  const openProfileWithUrl = useCallback(
    (siteId: string) => {
      const site =
        tierFilteredSites.find((s) => s.id === siteId) ?? sites.find((s) => s.id === siteId);
      if (!site) return;
      openProfile(siteId);
      const isHomeFirst = tierFilteredSites[0]?.id === siteId;
      const path = propertyDashboardPath(site, isHomeFirst);
      if (location.pathname !== path) {
        navigate(path);
      }
    },
    [tierFilteredSites, sites, openProfile, location.pathname, navigate],
  );

  useEffect(() => {
    setPropertyEditing(false);
  }, [displaySite?.id]);

  /**
   * URL ↔ profile sync:
   * - /dashboard → first dock client only (home)
   * - /dashboard/{slug} → matching client; unknown slug → home
   */
  useEffect(() => {
    if (tierFilteredSites.length === 0) return;
    const first = tierFilteredSites[0];

    if (propertySlug) {
      const match =
        findSiteByDashboardSlug(tierFilteredSites, propertySlug) ??
        findSiteByDashboardSlug(sites, propertySlug);
      if (!match) {
        if (profileSiteId !== first.id) openProfile(first.id);
        if (location.pathname !== "/dashboard") navigate("/dashboard", { replace: true });
        return;
      }
      if (match.id === first.id) {
        if (profileSiteId !== first.id) openProfile(first.id);
        if (location.pathname !== "/dashboard") navigate("/dashboard", { replace: true });
        return;
      }
      if (profileSiteId !== match.id) openProfile(match.id);
      return;
    }

    if (profileSiteId !== first.id) openProfile(first.id);
  }, [
    propertySlug,
    tierFilteredSites,
    sites,
    profileSiteId,
    openProfile,
    navigate,
    location.pathname,
  ]);

  return (
    <div className={cn(PROPERTIES_SHELL, "flex h-full min-h-0 flex-1 flex-col overflow-hidden")}>
      <div className="flex h-full min-h-0 flex-1 flex-row overflow-hidden">
        <aside
          className={PROPERTIES_DOCK_CLASS}
          aria-label="Properties list"
          style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
        >
          <PropertiesWorkspaceToolbar
            siteSearchQuery={siteSearchQuery}
            onSearchChange={setSiteSearchQuery}
            editorialPackageFilter={editorialPackageFilter}
            setEditorialPackageFilter={setEditorialPackageFilter}
            editorialMonthOptions={editorialMonthOptions}
            editorialSelectedMonthKey={editorialSelectedMonthKey}
            setEditorialSelectedMonthKey={setEditorialSelectedMonthKey}
            credentialedSiteCount={credentialedSiteCount}
            isRefreshingAllQuarterCounts={isRefreshingAllQuarterCounts}
            isRefreshingAllOptimizationCounts={isRefreshingAllOptimizationCounts}
            refreshAllQuarterCounts={refreshAllQuarterCounts}
            refreshAllOptimizationCounts={refreshAllOptimizationCounts}
          />
          <WordPressSiteList
            sites={sites}
            filteredSites={tierFilteredSites}
            editorialPackageFilter={editorialPackageFilter}
            siteSearchQuery={siteSearchQuery}
            onSearchChange={setSiteSearchQuery}
            onOpenProfile={(site) => openProfileWithUrl(site.id)}
            isTesting={isTesting}
            isDetecting={isDetecting}
            isFetchingScheduled={isFetchingScheduled}
            isScrapingSitemap={isScrapingSitemap}
            isIndexingSitemap={isIndexingSitemap}
            isGeneratingEntities={isGeneratingEntities}
            isExtractingNAPAndGraph={isExtractingNAPAndGraph}
            isLoadingCalendar={isLoadingCalendar}
            onTest={handleTestConnection}
            onToggleEnabled={handleToggleEnabled}
            onConnectSite={handleConnectSite}
            onDetect={handleDetectSitemaps}
            onEdit={handleEditSite}
            onDelete={handleDeleteSite}
            onScrapeChildSitemap={handleScrapeChildSitemap}
            onIndexSitemap={handleIndexSitemap}
            onEntityGeneration={onEntityGeneration}
            onSetEntitySitemap={handleSetEntitySitemap}
            onSetCompetitorEntitySitemap={handleSetCompetitorEntitySitemap}
            onToggleChildSitemapDisabled={handleToggleChildSitemapDisabled}
            onAppendManualChildSitemap={handleAppendManualChildSitemap}
            onLoadCalendarPosts={handleLoadCalendarPosts}
            onExtractNAPAndGraph={handleExtractNAPAndLinkGraph}
            getScrapingKey={getScrapingKey}
            onPatchSite={handlePatchSite}
            quarterStatsBySite={quarterStatsBySite}
            optimizationStatsBySite={optimizationStatsBySite}
            countsBatchPending={countsBatchPending}
            editorialSelectedMonthKey={editorialSelectedMonthKey}
            editorialMonthOptions={editorialMonthOptions}
            onEditorialMonthChange={setEditorialSelectedMonthKey}
            propertyRowDisplay="compact"
            layout="dock"
            activeSiteId={displaySite?.id}
          />
          <AddClientDockPanel
            open={addClientPanelOpen}
            name={formName}
            siteUrl={formSiteUrl}
            username={formUsername}
            appPassword={formAppPassword}
            statusText={addClientStatus}
            isImporting={addClientImporting}
            onNameChange={setFormName}
            onSiteUrlChange={setFormSiteUrl}
            onUsernameChange={setFormUsername}
            onAppPasswordChange={setFormAppPassword}
            onAiImport={() => void handleAiImportClient()}
            onSave={handleSaveSiteClick}
            onCancel={handleCancelAddClient}
          />
          <PropertiesDockFooterActions
            sitesCount={sites.length}
            onExportAllSitesCsv={handleExportAllSitesCsv}
            onBulkImport={() => setBulkImportDialogOpen(true)}
            onAddSite={handleAddSite}
          />
        </aside>
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-zinc-950">
          {displaySite ? (
            <PropertyProfilePage
              site={displaySite}
              activeSectionId={profileSectionId}
              onActiveSectionChange={setProfileSectionId}
              settingsSubSectionId={settingsSubSectionId}
              onSettingsSubSectionChange={setSettingsSubSectionId}
              siteSettingsPanel={profileSettingsPanel}
              isTesting={isTesting === displaySite.id}
              isDetecting={isDetecting === displaySite.id}
              isFetchingScheduled={isFetchingScheduled === displaySite.id}
              isScrapingSitemap={isScrapingSitemap}
              isGeneratingEntities={isGeneratingEntities}
              isIndexingSitemap={isIndexingSitemap}
              isLoadingCalendar={isLoadingCalendar}
              isExtractingNAPAndGraph={Boolean(isExtractingNAPAndGraph[displaySite.id])}
              onTest={() => handleTestConnection(displaySite)}
              onDetect={() => handleDetectSitemaps(displaySite)}
              onScrapeChildSitemap={(url) => handleScrapeChildSitemap(displaySite, url)}
              onEntityGeneration={
                onEntityGeneration ? (sitemapUrl) => onEntityGeneration(displaySite, sitemapUrl) : undefined
              }
              onSetEntitySitemap={(sitemapUrl) => handleSetEntitySitemap(displaySite, sitemapUrl)}
              onSetCompetitorEntitySitemap={(sitemapUrl) => handleSetCompetitorEntitySitemap(displaySite, sitemapUrl)}
              onToggleChildSitemapDisabled={(childSitemapUrl) => handleToggleChildSitemapDisabled(displaySite, childSitemapUrl)}
              onAppendManualChildSitemap={(url) => handleAppendManualChildSitemap(displaySite, url)}
              onAddCustomSitemapTagLabel={(label) => handleAddCustomSitemapTagLabel(displaySite, label)}
              onToggleChildSystemRole={(childUrl, role) => handleToggleChildSystemRole(displaySite, childUrl, role)}
              onToggleChildCustomTag={(childUrl, label) => handleToggleChildCustomTag(displaySite, childUrl, label)}
              onIndexSitemap={(url) => handleIndexSitemap(displaySite, url)}
              onLoadCalendarPosts={(sitemapUrl) => handleLoadCalendarPosts(displaySite, sitemapUrl)}
              onExtractNAPAndGraph={() => void handleExtractNAPAndLinkGraph(displaySite)}
              getScrapingKey={getScrapingKey}
              onPatchSite={handlePatchSite}
              onSaveProperty={handleSaveSiteClick}
              onDeleteProperty={() => handleDeleteSite(displaySite.id)}
              onLogoBoxThemeChange={setFormClientLogoBoxTheme}
              editing={propertyEditing}
              onToggleEditing={() => setPropertyEditing((open) => !open)}
              onOpenSettingsProfile={() => {
                setProfileSectionId("site-settings");
                setSettingsSubSectionId("profile");
              }}
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col px-3 pt-3">
              <div className={PROPERTIES_EMPTY}>
                <p className="text-base text-foreground">
                  {sites.length === 0
                    ? "No WordPress sites connected. Use Add Site to connect your first property."
                    : "No properties match the current filter."}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Import Clients Dialog */}
      <BulkImportClientsDialog
        open={bulkImportDialogOpen}
        onOpenChange={setBulkImportDialogOpen}
        onAddBulk={async (clients) => {
          handleSaveSitesBulk(clients);
        }}
      />

      <WordPressDialogs
        isDialogOpen={isDialogOpen}
        onDialogOpenChange={setIsDialogOpen}
        editingSite={editingSite}
        formName={formName}
        formSiteUrl={formSiteUrl}
        formProductionSiteUrl={formProductionSiteUrl}
        formUsername={formUsername}
        formAppPassword={formAppPassword}
        formGa4PropertyId={formGa4PropertyId}
        formGoogleAdsCustomerId={formGoogleAdsCustomerId}
        formGbpLocationId={formGbpLocationId}
        formSemrushSiteAuditProjectId={formSemrushSiteAuditProjectId}
        formSemrushPositionTrackingProjectId={formSemrushPositionTrackingProjectId}
        formSemrushPositionTrackingCampaignId={formSemrushPositionTrackingCampaignId}
        formEditorialCountsPeriodStartYmd={formEditorialCountsPeriodStartYmd}
        formOptimizationPackage={formOptimizationPackage}
        formEditorialContentPackage={formEditorialContentPackage}
        formEditorialPublishTimeLocal={formEditorialPublishTimeLocal}
        formBenchmarkCustomTag={formBenchmarkCustomTag}
        formPrimaryLocalKeyword={formPrimaryLocalKeyword}
        formClientLogoUrl={formClientLogoUrl}
        formClientLogoBoxTheme={formClientLogoBoxTheme}
        formProfileTags={formProfileTags}
        formServiceCity={formServiceCity}
        formServiceState={formServiceState}
        formServiceCountry={formServiceCountry}
        onFormNameChange={setFormName}
        onFormSiteUrlChange={setFormSiteUrl}
        onFormProductionSiteUrlChange={setFormProductionSiteUrl}
        onFormUsernameChange={setFormUsername}
        onFormAppPasswordChange={setFormAppPassword}
        onFormGa4PropertyIdChange={setFormGa4PropertyId}
        onFormGoogleAdsCustomerIdChange={setFormGoogleAdsCustomerId}
        onFormGbpLocationIdChange={setFormGbpLocationId}
        onFormSemrushSiteAuditProjectIdChange={setFormSemrushSiteAuditProjectId}
        onFormSemrushPositionTrackingProjectIdChange={setFormSemrushPositionTrackingProjectId}
        onFormSemrushPositionTrackingCampaignIdChange={setFormSemrushPositionTrackingCampaignId}
        onFormEditorialCountsPeriodStartYmdChange={setFormEditorialCountsPeriodStartYmd}
        onFormOptimizationPackageChange={setFormOptimizationPackage}
        onFormEditorialContentPackageChange={setFormEditorialContentPackage}
        onFormEditorialPublishTimeLocalChange={setFormEditorialPublishTimeLocal}
        onFormBenchmarkCustomTagChange={setFormBenchmarkCustomTag}
        onFormPrimaryLocalKeywordChange={setFormPrimaryLocalKeyword}
        onFormClientLogoUrlChange={setFormClientLogoUrl}
        onFormClientLogoBoxThemeChange={setFormClientLogoBoxTheme}
        onFormProfileTagsChange={setFormProfileTags}
        onFormServiceCityChange={setFormServiceCity}
        onFormServiceStateChange={setFormServiceState}
        onFormServiceCountryChange={setFormServiceCountry}
        onSaveSite={handleSaveSiteClick}
        onPatchSite={handlePatchSite}
      />
    </div>
  );
};
