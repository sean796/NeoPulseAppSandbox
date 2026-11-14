import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTeam } from "@/contexts/TeamContext";
import { notify } from "@/lib/app-notifications";
import { loadAgentMailApiKey, loadAgentMailInbox } from "@/lib/api";
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
}: ApiKeysSettingsContentProps) {
  const { user } = useAuth();
  const { activeTeam } = useTeam();
  const [agentMailStamp, setAgentMailStamp] = useState(0);
  const seenCredentials = useRef<string | null>(null);
  const saveSeq = useRef(0);
  const onAgentMailStored = useCallback(() => {
    setAgentMailStamp((n) => n + 1);
  }, []);

  useEffect(() => {
    const credentials = `${apiKey}\n${dataForSEOApiKey}\n${semrushApiKey}\n${agentMailStamp}`;
    if (seenCredentials.current === credentials) return;
    const openingPage = seenCredentials.current === null;
    seenCredentials.current = credentials;
    if (openingPage || !user) return;

    const seq = ++saveSeq.current;
    const timer = window.setTimeout(() => {
      void (async () => {
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
        if (seq !== saveSeq.current) return;
        if (!r.ok) notify.error(r.error || "API key save failed");
      })();
    }, 400);

    return () => window.clearTimeout(timer);
  }, [
    user,
    activeTeam?.id,
    apiKey,
    dataForSEOApiKey,
    semrushApiKey,
    agentMailStamp,
    selectedModel,
    temperature,
    maxTokens,
    topP,
  ]);

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
          <AgentMailApiKeyContent onStored={onAgentMailStored} />
        </div>
      </section>
      <ResidentialProxySettingsContent />
    </div>
  );
}
