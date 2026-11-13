import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AiModelsSettingsContent } from "@/components/manager/AiModelsSettingsContent";
import { ApiKeysSettingsContent } from "@/components/manager/ApiKeysSettingsContent";
import { GoogleServicesSettingsContent } from "@/components/manager/GoogleServicesSettingsContent";
import { ManagerMasterRulesSettingsContent } from "@/components/manager/ManagerMasterRulesSettingsContent";
import { DecisionTreeManagerContent } from "@/components/manager/decision-tree/DecisionTreeManagerContent";
import { IntegrationsTab } from "@/components/IntegrationsTab";
import { PulseHostTabContent } from "@/components/hosting/PulseHostTabContent";
import { AgentLibraryTabContent } from "@/components/manager/agents/AgentLibraryTabContent";
import { ChangelogTabContent } from "@/components/manager/changelog/ChangelogTabContent";
import { SettingsStudioShell } from "@/components/manager/settings/SettingsStudioShell";
import { SETTINGS_STUDIO_CTA_CLASS } from "@/components/manager/settings/settings-studio-surfaces";
import {
  type ManagerSettingsClusterId,
  type ManagerSettingsItemId,
  isManagerSettingsItemId,
  readStoredManagerSettingsCluster,
  writeStoredManagerSettingsCluster,
} from "@/components/manager/manager-settings-cluster";
import {
  readGlobalAdsAgentModel,
  readGlobalBlogAgentModel,
  readGlobalDecisionAgentModel,
  readGlobalImageAgentModel,
  readGlobalMetaAgentModel,
  readGlobalReportAgentModel,
  readGlobalResearchAgentModel,
  readGlobalVideoAgentModel,
  writeGlobalAdsAgentModel,
  writeGlobalDecisionAgentModel,
  writeGlobalImageAgentModel,
  writeGlobalMetaAgentModel,
  writeGlobalReportAgentModel,
  writeGlobalResearchAgentModel,
  writeGlobalVideoAgentModel,
} from "@/lib/global-agent-models";
import { dashboardClusterToArea, useTeamPermission } from "@/hooks/use-team-permission";
import {
  DASHBOARD_SECTION_ORDER,
  SETTINGS_DOCK_ORDER,
} from "@/components/manager/dashboard/dashboard-section-labels";
import { cn } from "@/lib/utils";

export interface ManagerSettingsContentProps {
  apiKey: string;
  setApiKey: (key: string) => void;
  saveApiKey: (key: string) => void;
  dataForSEOApiKey: string;
  setDataForSEOApiKey: (key: string) => void;
  saveDataForSEOApiKeyToStorage: (key: string) => void;
  semrushApiKey: string;
  setSemrushApiKey: (key: string) => void;
  saveSemrushApiKeyToStorage: (key: string) => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  agentResearchModel?: string;
  setAgentResearchModel?: (model: string) => void;
  agentImageModel?: string;
  setAgentImageModel?: (model: string) => void;
  agentMetaModel?: string;
  setAgentMetaModel?: (model: string) => void;
  agentReportModel?: string;
  setAgentReportModel?: (model: string) => void;
  agentAdsModel?: string;
  setAgentAdsModel?: (model: string) => void;
  agentDecisionModel?: string;
  setAgentDecisionModel?: (model: string) => void;
  temperature: number;
  setTemperature: (value: number) => void;
  maxTokens: number;
  setMaxTokens: (value: number) => void;
  topP: number;
  setTopP: (value: number) => void;
  settingsCluster?: ManagerSettingsClusterId;
  onSettingsClusterChange?: (id: ManagerSettingsClusterId) => void;
}

export function ManagerSettingsContent({
  apiKey,
  setApiKey,
  saveApiKey,
  dataForSEOApiKey,
  setDataForSEOApiKey,
  saveDataForSEOApiKeyToStorage,
  semrushApiKey,
  setSemrushApiKey,
  saveSemrushApiKeyToStorage,
  selectedModel,
  setSelectedModel,
  agentResearchModel: agentResearchModelProp,
  setAgentResearchModel: setAgentResearchModelProp,
  agentImageModel: agentImageModelProp,
  setAgentImageModel: setAgentImageModelProp,
  agentMetaModel: agentMetaModelProp,
  setAgentMetaModel: setAgentMetaModelProp,
  agentReportModel: agentReportModelProp,
  setAgentReportModel: setAgentReportModelProp,
  agentAdsModel: agentAdsModelProp,
  setAgentAdsModel: setAgentAdsModelProp,
  agentDecisionModel: agentDecisionModelProp,
  setAgentDecisionModel: setAgentDecisionModelProp,
  temperature,
  setTemperature,
  maxTokens,
  setMaxTokens,
  topP,
  setTopP,
  settingsCluster: settingsClusterControlled,
  onSettingsClusterChange,
}: ManagerSettingsContentProps) {
  const [fallbackResearch, setFallbackResearch] = useState(readGlobalResearchAgentModel);
  const [fallbackImage, setFallbackImage] = useState(readGlobalImageAgentModel);
  const [fallbackMeta, setFallbackMeta] = useState(readGlobalMetaAgentModel);
  const [fallbackReport, setFallbackReport] = useState(readGlobalReportAgentModel);
  const [fallbackAds, setFallbackAds] = useState(readGlobalAdsAgentModel);
  const [fallbackDecision, setFallbackDecision] = useState(readGlobalDecisionAgentModel);
  const [agentVideoModel, setVideoModelState] = useState(readGlobalVideoAgentModel);
  const setAgentVideoModel = (model: string) => {
    setVideoModelState(model);
    writeGlobalVideoAgentModel(model);
  };
  const agentResearchModel = agentResearchModelProp ?? fallbackResearch;
  const agentImageModel = agentImageModelProp ?? fallbackImage;
  const agentMetaModel = agentMetaModelProp ?? fallbackMeta;
  const agentReportModel = agentReportModelProp ?? fallbackReport;
  const agentAdsModel = agentAdsModelProp ?? fallbackAds;
  const agentDecisionModel = agentDecisionModelProp ?? fallbackDecision;
  const setAgentDecisionModel =
    setAgentDecisionModelProp ??
    ((model: string) => {
      setFallbackDecision(model);
      writeGlobalDecisionAgentModel(model);
    });
  const setAgentResearchModel =
    setAgentResearchModelProp ??
    ((model: string) => {
      setFallbackResearch(model);
      writeGlobalResearchAgentModel(model);
    });
  const setAgentImageModel =
    setAgentImageModelProp ??
    ((model: string) => {
      setFallbackImage(model);
      writeGlobalImageAgentModel(model);
    });
  const setAgentMetaModel =
    setAgentMetaModelProp ??
    ((model: string) => {
      setFallbackMeta(model);
      writeGlobalMetaAgentModel(model);
    });
  const setAgentReportModel =
    setAgentReportModelProp ??
    ((model: string) => {
      setFallbackReport(model);
      writeGlobalReportAgentModel(model);
    });
  const setAgentAdsModel =
    setAgentAdsModelProp ??
    ((model: string) => {
      setFallbackAds(model);
      writeGlobalAdsAgentModel(model);
    });
  const blogModel = selectedModel || readGlobalBlogAgentModel();

  const [internalCluster, setInternalCluster] = useState<ManagerSettingsClusterId>(() =>
    readStoredManagerSettingsCluster(),
  );
  const [apiKeysSaveBinding, setApiKeysSaveBinding] = useState<{
    save: () => void;
    saving: boolean;
  } | null>(null);

  const cluster =
    settingsClusterControlled !== undefined ? settingsClusterControlled : internalCluster;

  const { canRead } = useTeamPermission();

  const onClusterChange = useCallback(
    (id: ManagerSettingsClusterId) => {
      if (onSettingsClusterChange) {
        onSettingsClusterChange(id);
      } else {
        setInternalCluster(id);
      }
    },
    [onSettingsClusterChange],
  );

  const visibleSectionIds = useMemo(
    () =>
      DASHBOARD_SECTION_ORDER.filter((id) => {
        const area = dashboardClusterToArea(id);
        return !area || canRead(area);
      }),
    [canRead],
  );

  const visibleSettingsItems = useMemo(
    () => SETTINGS_DOCK_ORDER.filter((id) => visibleSectionIds.includes(id)),
    [visibleSectionIds],
  );

  useEffect(() => {
    if (!visibleSectionIds.includes(cluster) && visibleSectionIds.length > 0) {
      onClusterChange(visibleSectionIds[0]);
    }
  }, [cluster, visibleSectionIds, onClusterChange]);

  useEffect(() => {
    writeStoredManagerSettingsCluster(cluster);
  }, [cluster]);

  const handleDataForSEOSave = useCallback(
    (key: string) => {
      setDataForSEOApiKey(key);
      saveDataForSEOApiKeyToStorage(key);
    },
    [setDataForSEOApiKey, saveDataForSEOApiKeyToStorage],
  );

  const handleSemrushSave = useCallback(
    (key: string) => {
      setSemrushApiKey(key);
      saveSemrushApiKeyToStorage(key);
    },
    [setSemrushApiKey, saveSemrushApiKeyToStorage],
  );

  const handleSettingsSelect = useCallback(
    (id: ManagerSettingsItemId) => {
      onClusterChange(id);
    },
    [onClusterChange],
  );

  const handleApiKeysSaveBindingChange = useCallback(
    (binding: { save: () => void; saving: boolean } | null) => {
      setApiKeysSaveBinding(binding);
    },
    [],
  );

  if (cluster === "properties") {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <IntegrationsTab
          activeDashboardSection={cluster}
          onDashboardSectionChange={onClusterChange}
          visibleDashboardSectionIds={visibleSectionIds}
        />
      </div>
    );
  }

  const activeItem: ManagerSettingsItemId = isManagerSettingsItemId(cluster)
    ? cluster
    : (visibleSettingsItems[0] ?? "api-keys");

  const fillPane =
    activeItem === "pulse-host" ||
    activeItem === "agent-library" ||
    activeItem === "changelog";

  let pane: ReactNode = null;
  switch (activeItem) {
    case "api-keys":
      pane = (
        <ApiKeysSettingsContent
          apiKey={apiKey}
          setApiKey={setApiKey}
          saveApiKey={saveApiKey}
          dataForSEOApiKey={dataForSEOApiKey}
          setDataForSEOApiKey={setDataForSEOApiKey}
          saveDataForSEOApiKey={handleDataForSEOSave}
          semrushApiKey={semrushApiKey}
          setSemrushApiKey={setSemrushApiKey}
          saveSemrushApiKey={handleSemrushSave}
          selectedModel={selectedModel}
          temperature={temperature}
          maxTokens={maxTokens}
          topP={topP}
          onSaveBindingChange={handleApiKeysSaveBindingChange}
        />
      );
      break;
    case "master-rules":
      pane = <ManagerMasterRulesSettingsContent />;
      break;
    case "ai-generation":
      pane = (
        <AiModelsSettingsContent
          researchModel={agentResearchModel}
          setResearchModel={setAgentResearchModel}
          blogModel={blogModel}
          setBlogModel={setSelectedModel}
          imageModel={agentImageModel}
          setImageModel={setAgentImageModel}
          metaModel={agentMetaModel}
          setMetaModel={setAgentMetaModel}
          reportModel={agentReportModel}
          setReportModel={setAgentReportModel}
          adsModel={agentAdsModel}
          setAdsModel={setAgentAdsModel}
          videoModel={agentVideoModel}
          setVideoModel={setAgentVideoModel}
          decisionModel={agentDecisionModel}
          setDecisionModel={setAgentDecisionModel}
          temperature={temperature}
          setTemperature={setTemperature}
          maxTokens={maxTokens}
          setMaxTokens={setMaxTokens}
          topP={topP}
          setTopP={setTopP}
        />
      );
      break;
    case "decision-tree":
      pane = <DecisionTreeManagerContent />;
      break;
    case "google":
      pane = <GoogleServicesSettingsContent />;
      break;
    case "pulse-host":
      pane = <PulseHostTabContent />;
      break;
    case "agent-library":
      pane = <AgentLibraryTabContent />;
      break;
    case "changelog":
      pane = <ChangelogTabContent />;
      break;
    default:
      pane = null;
  }

  const identityActions =
    activeItem === "api-keys" ? (
      <button
        type="button"
        className={cn(SETTINGS_STUDIO_CTA_CLASS, "min-w-[4.5rem]")}
        disabled={!apiKeysSaveBinding || apiKeysSaveBinding.saving}
        onClick={() => apiKeysSaveBinding?.save()}
      >
        {apiKeysSaveBinding?.saving ? "Saving…" : "Save"}
      </button>
    ) : null;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <SettingsStudioShell
        items={visibleSettingsItems}
        activeItem={activeItem}
        onSelect={handleSettingsSelect}
        identityActions={identityActions}
        fillPane={fillPane}
      >
        {pane}
      </SettingsStudioShell>
    </div>
  );
}
