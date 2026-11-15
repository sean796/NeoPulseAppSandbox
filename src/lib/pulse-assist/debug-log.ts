import type { WordPressSite } from "@/components/integrations/types";
import type { PulseAssistOverviewBridge } from "@/contexts/pulse-assist-context";
import { buildPropertiesContext, buildPulseContext } from "./context";
import type { PlatformDataResearchMeta } from "@/lib/platform-data/types";
import type { AssistCardStep, AssistHistoryMessage, AssistSubmode, AssistCard } from "./types";

export type PulseAssistDebugTurn =
  | { kind: "user"; text: string }
  | { kind: "ack"; text: string }
  | { kind: "thinking"; title?: string; steps: AssistCardStep[] }
  | { kind: "card"; card: AssistCard } & PlatformDataResearchMeta;

export type PulseAssistDebugLog = {
  exportedAt: string;
  app: {
    url: string;
    deployGitSha?: string;
    version?: string;
  };
  session: {
    userId: string | number;
    submode: AssistSubmode;
  };
  workspace: {
    managerTab: string;
    generatorSection: string;
    overview: PulseAssistOverviewBridge;
    pulseContext: ReturnType<typeof buildPulseContext>;
    propertiesContext: ReturnType<typeof buildPropertiesContext>;
  };
  history: AssistHistoryMessage[];
  turns: PulseAssistDebugTurn[];
};

export type PulseAssistDebugLogInput = {
  userId: string | number;
  submode: AssistSubmode;
  managerTab: string;
  generatorSection: string;
  overview: PulseAssistOverviewBridge;
  activeSite: WordPressSite | null;
  siteDisplayName: string;
  allSites: WordPressSite[];
  activeSiteId: string | null;
  history: AssistHistoryMessage[];
  turns: PulseAssistDebugTurn[];
};

export function buildPulseAssistDebugLog(input: PulseAssistDebugLogInput): PulseAssistDebugLog {
  return {
    exportedAt: new Date().toISOString(),
    app: {
      url: typeof window !== "undefined" ? window.location.href : "",
      deployGitSha: (import.meta.env.VITE_DEPLOY_GIT_SHA as string | undefined)?.trim() || undefined,
      version: (import.meta.env.VITE_APP_VERSION as string | undefined)?.trim() || undefined,
    },
    session: {
      userId: input.userId,
      submode: input.submode,
    },
    workspace: {
      managerTab: input.managerTab,
      generatorSection: input.generatorSection,
      overview: input.overview,
      pulseContext: buildPulseContext({
        site: input.activeSite,
        siteDisplayName: input.siteDisplayName,
        allSites: input.allSites,
        activeSiteId: input.activeSiteId,
        managerTab: input.managerTab,
        generatorSection: input.generatorSection,
        sitemapSource: input.overview.sitemapSource || undefined,
        expandedPageUrl: input.overview.expandedPageUrl,
        expandedPageTitle: input.overview.expandedPageTitle,
        postId: input.overview.postId,
      }),
      propertiesContext: buildPropertiesContext(input.allSites, input.activeSiteId),
    },
    history: input.history,
    turns: input.turns,
  };
}

export function downloadPulseAssistDebugLog(log: PulseAssistDebugLog): void {
  const json = JSON.stringify(log, null, 2);
  const stamp = log.exportedAt.replace(/[:.]/g, "-");
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pulse-assist-debug-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
