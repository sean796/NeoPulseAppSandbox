import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import {
  NOTIFY_API_KEY_SAVED_AND_UPDATED_FOR_CURRENT_SE,
  NOTIFY_SIGN_IN_TO_SAVE_SETTINGS_TO_THE_CLOUD,
} from "@/lib/notify-messages";
import { notify } from "@/lib/app-notifications";
import {
  loadAgentMailApiKey,
  loadAgentMailInbox,
  saveApiKey as saveRuntimeApiKey,
  saveDataForSEOApiKey as saveRuntimeDataForSeoKey,
  saveSemrushApiKey as saveRuntimeSemrushKey,
} from "@/lib/api";
import { saveManagerWorkspaceBackup } from "@/lib/manager-workspace-backup";
import { ApiKeyContent } from "@/components/ApiKeyContent";
import { DataForSEOApiKeyContent } from "@/components/DataForSEOApiKeyContent";
import { SemrushApiKeyContent } from "@/components/SemrushApiKeyContent";
import { AgentMailApiKeyContent } from "@/components/AgentMailApiKeyContent";
import { ResidentialProxySettingsContent } from "@/components/manager/ResidentialProxySettingsContent";
import { SETTINGS_STUDIO_PANEL_CLASS } from "@/components/manager/settings/settings-studio-surfaces";

export type ApiKeysSettingsContentProps = {
  apiKey: string;
  setApiKey: (key: string) => void;
  saveApiKey: (key: string) => void;
  dataForSEOApiKey: string;
  setDataForSEOApiKey: (key: string) => void;
  saveDataForSEOApiKey: (key: string) => void;
  semrushApiKey: string;
  setSemrushApiKey: (key: string) => void;
  saveSemrushApiKey: (key: string) => void;
  selectedModel: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  /** Register Save for the Settings identity strip. */
  onSaveBindingChange?: (binding: { save: () => void; saving: boolean } | null) => void;
};

export function ApiKeysSettingsContent({
  apiKey,
  setApiKey,
  saveApiKey,
  dataForSEOApiKey,
  setDataForSEOApiKey,
  saveDataForSEOApiKey,
  semrushApiKey,
  setSemrushApiKey,
  saveSemrushApiKey,
  selectedModel,
  temperature,
  maxTokens,
  topP,
  onSaveBindingChange,
}: ApiKeysSettingsContentProps) {
  const { user } = useAuth();
  const { activeTeam } = useTeam();
  const [saving, setSaving] = useState(false);

  const handleSaveAllKeys = useCallback(() => {
    void (async () => {
      saveKeyInLocalStorage(saveApiKey, apiKey);
      saveRuntimeApiKey(apiKey);
      saveKeyInLocalStorage(saveDataForSEOApiKey, dataForSEOApiKey);
      saveRuntimeDataForSeoKey(dataForSEOApiKey);
      saveKeyInLocalStorage(saveSemrushApiKey, semrushApiKey);
      saveRuntimeSemrushKey(semrushApiKey);

      if (!user) {
        notify.error(NOTIFY_SIGN_IN_TO_SAVE_SETTINGS_TO_THE_CLOUD);
        return;
      }

      setSaving(true);
      try {
        const r = await saveManagerWorkspaceBackup(
          {
            apiKey,
            dataForSEOApiKey,
            semrushApiKey,
            agentMailApiKey: loadAgentMailApiKey(),
            agentMailInbox: loadAgentMailInbox(),
            selectedModel,
            temperature,
            maxTokens,
            topP,
          },
          activeTeam?.id,
        );
        if (!r.ok) {
          notify.error(r.error || "API key save failed");
          return;
        }
        notify.success(NOTIFY_API_KEY_SAVED_AND_UPDATED_FOR_CURRENT_SE);
      } finally {
        setSaving(false);
      }
    })();
  }, [
    user,
    activeTeam?.id,
    apiKey,
    dataForSEOApiKey,
    semrushApiKey,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    saveApiKey,
    saveDataForSEOApiKey,
    saveSemrushApiKey,
  ]);

  useEffect(() => {
    if (!onSaveBindingChange) return;
    onSaveBindingChange({ save: handleSaveAllKeys, saving });
    return () => onSaveBindingChange(null);
  }, [onSaveBindingChange, handleSaveAllKeys, saving]);

  return (
    <div className="flex w-full min-w-0 flex-col gap-3" aria-label="API Keys">
      <section className={SETTINGS_STUDIO_PANEL_CLASS}>
        <div className="space-y-6">
          <ApiKeyContent apiKey={apiKey} setApiKey={setApiKey} saveApiKey={saveApiKey} />
          <DataForSEOApiKeyContent
            apiKey={dataForSEOApiKey}
            setApiKey={setDataForSEOApiKey}
            saveApiKey={saveDataForSEOApiKey}
          />
          <SemrushApiKeyContent
            apiKey={semrushApiKey}
            setApiKey={setSemrushApiKey}
            saveApiKey={saveSemrushApiKey}
          />
          <AgentMailApiKeyContent />
        </div>
      </section>
      <ResidentialProxySettingsContent />
    </div>
  );
}

function saveKeyInLocalStorage(fn: (key: string) => void, value: string): void {
  fn(value);
}
