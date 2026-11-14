import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { useActiveWordPressSite } from "@/contexts/active-wordpress-site-context";
import { Switch } from "@/ui";

import { SEO_WORKSPACE_TYPO_CLASS } from "@/components/seo/seo-workspace-layout";
import {
  buildSkillsLibraryEntries,
  buildUnifiedAgentLibraryEntries,
  DEFAULT_HUB_AGENTS,
  fetchAgentLibraryState,
  toggleAgentLibraryEntry,
  type AgentLibraryCategoryFilter,
  type AgentLibraryDomainFilter,
  type HubAgentDefinitionItem,
} from "@/lib/agent-library/agent-library-api";
import { cn } from "@/lib/utils";
import { AgentLibraryWorkspaceHeader } from "./AgentLibraryWorkspaceHeader";
import { SkillJsonLibrary } from "./SkillJsonLibrary";

const DOMAIN_BADGE_LABELS: Record<Exclude<AgentLibraryDomainFilter, "all">, string> = {
  "slack-hub": "Slack & Hub",
  aiseo: "AISEO",
  "blog-generator": "Blog Generator",
  "entity-sap": "Entity SAP",
  "sitemap-optimizer": "Sitemap",
  "competitor-research": "Competitor",
  reporting: "Reporting",
  "ppc-ads": "PPC & Ads",
  video: "Video",
  wikipedia: "Wikipedia",
};

export function AgentLibraryTabContent({
  scope = "agents",
}: {
  scope?: "agents" | "skills";
}): React.ReactElement {
  const navigate = useNavigate();
  const { activeWordPressSiteId } = useActiveWordPressSite();
  const [searchQuery, setSearchQuery] = useState("");
  const [domainFilter, setDomainFilter] = useState<AgentLibraryDomainFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<AgentLibraryCategoryFilter>("all");

  const [hubAgents, setHubAgents] = useState<HubAgentDefinitionItem[]>(DEFAULT_HUB_AGENTS);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inspectSkillId, setInspectSkillId] = useState<string | null>(null);

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const payload = await fetchAgentLibraryState();
      setHubAgents(payload.hubAgents);
      setOverrides(payload.overrides);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : scope === "skills"
            ? "Could not sync Skills Library state."
            : "Could not sync Agent Library state.",
      );
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  const allEntries = useMemo(
    () =>
      (scope === "skills" ? buildSkillsLibraryEntries : buildUnifiedAgentLibraryEntries)(
        hubAgents,
        overrides,
        activeWordPressSiteId,
      ),
    [activeWordPressSiteId, hubAgents, overrides, scope],
  );

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allEntries.filter((entry) => {
      if (domainFilter !== "all" && entry.domain !== domainFilter) return false;
      if (categoryFilter !== "all" && entry.category !== categoryFilter) return false;
      if (!q) return true;
      const hay = [
        entry.id,
        entry.label,
        entry.description,
        entry.sourceModule,
        entry.resolvedModel,
        entry.slashCommand ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [allEntries, categoryFilter, domainFilter, searchQuery]);

  const handleToggleAgent = useCallback(
    async (agentId: string, nextEnabled: boolean) => {
      setTogglingId(agentId);
      setOverrides((prev) => ({ ...prev, [agentId]: nextEnabled }));
      try {
        const payload = await toggleAgentLibraryEntry(agentId, nextEnabled);
        setHubAgents(payload.hubAgents);
        setOverrides(payload.overrides);
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Failed to update agent status.");
      } finally {
        setTogglingId(null);
      }
    },
    [],
  );

  const inspectEntry =
    scope === "skills" && inspectSkillId
      ? allEntries.find((entry) => entry.id === inspectSkillId)
      : undefined;

  return (
    <div className={cn("flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-black", SEO_WORKSPACE_TYPO_CLASS)}>
      <AgentLibraryWorkspaceHeader
        scope={scope}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        domainFilter={domainFilter}
        onDomainFilterChange={setDomainFilter}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        totalCount={allEntries.length}
        visibleCount={filteredEntries.length}
        busy={loading || togglingId !== null}
        onRefresh={() => void loadLibrary()}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-3 pb-4 pt-3">
        {inspectEntry ? (
          <SkillJsonLibrary
            skillId={inspectEntry.id}
            skillLabel={inspectEntry.label}
            onBack={() => setInspectSkillId(null)}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            {errorMessage ? (
              <div className="bg-zinc-900 px-4 py-2.5 text-base text-red-400">
                {errorMessage}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
              {filteredEntries.map((agent) => (
                <article
                  key={agent.id}
                  className="flex min-h-[7.5rem] flex-col justify-between gap-2.5 bg-zinc-900 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-white">{agent.label}</span>
                      <span className="bg-black px-2 py-0.5 text-base text-primary">
                        {DOMAIN_BADGE_LABELS[agent.domain]}
                      </span>
                      <span className="bg-black px-2 py-0.5 font-mono text-base text-muted-foreground">
                        {agent.category}
                      </span>
                      {agent.slashCommand ? (
                        <span className="bg-black px-2 py-0.5 font-mono text-base text-white">
                          {agent.slashCommand}
                        </span>
                      ) : null}
                      {agent.status === "beta" ? (
                        <span className="bg-black px-2 py-0.5 text-base text-amber-400">beta</span>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-base tabular-nums text-muted-foreground">
                        {agent.enabled ? "On" : "Off"}
                      </span>
                      <Switch
                        checked={agent.enabled}
                        disabled={togglingId === agent.id}
                        onCheckedChange={(checked) => void handleToggleAgent(agent.id, checked)}
                        aria-label={`Toggle ${agent.label}`}
                      />
                    </div>
                  </div>

                  <p className="text-base text-muted-foreground">{agent.description}</p>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 font-mono text-base text-muted-foreground">
                    <span className="truncate">id: {agent.id}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="truncate text-white/80">{agent.resolvedModel}</span>
                      {scope === "skills" ? (
                        <button
                          type="button"
                          onClick={() => setInspectSkillId(agent.id)}
                          className="inline-flex h-8 items-center justify-center bg-black px-3 font-sans text-base font-medium text-white hover:bg-primary hover:text-black"
                          aria-label={`Inspect ${agent.label}`}
                        >
                          Inspect
                        </button>
                      ) : null}
                      {agent.appPath ? (
                        <button
                          type="button"
                          onClick={() => navigate(agent.appPath!)}
                          className="inline-flex items-center gap-1 bg-black px-2 py-0.5 font-sans text-base text-primary hover:bg-zinc-800"
                          aria-label={`Open ${agent.label}`}
                        >
                          Open
                          <ArrowUpRight className="h-4 w-4" aria-hidden />
                        </button>
                      ) : null}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
