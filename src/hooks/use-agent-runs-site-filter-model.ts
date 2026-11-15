import { useCallback, useMemo } from "react";
import { useActiveWordPressSite } from "@/contexts/active-wordpress-site-context";
import { useAgentRunsContext } from "@/contexts/use-agent-runs-context";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import {
  buildAgentRunGroups,
  buildAgentRunSiteNameMap,
  mergeEnabledSiteClientGroups,
  type AgentRunClientGroup,
} from "@/lib/agent-runs/agent-run-grouping";
import {
  AGENT_RUNS_ALL_SITES_ID,
  isAgentsAllSitesFilter,
  resolveDefaultAgentsSiteFilter,
} from "@/lib/agent-runs/agent-runs-site-filter";

export function useAgentRunsSiteFilterModel() {
  const { runs, agentsSiteFilter, setAgentsSiteFilter } = useAgentRunsContext();
  const { activeWordPressSiteId, setActiveWordPressSiteId } = useActiveWordPressSite();
  const { sites: wpSites, handleConnectSite } = useWordPressSites();

  const allSiteIds = useMemo(() => wpSites.map((site) => site.id), [wpSites]);
  const siteNameById = useMemo(() => buildAgentRunSiteNameMap(wpSites), [wpSites]);

  const runGroups = useMemo(
    () => buildAgentRunGroups(runs, siteNameById),
    [runs, siteNameById],
  );

  const allSiteGroups = useMemo(
    () => mergeEnabledSiteClientGroups(allSiteIds, runGroups, siteNameById),
    [allSiteIds, runGroups, siteNameById],
  );

  const activeCountBySiteId = useMemo(() => {
    const map = new Map<string, number>();
    for (const client of allSiteGroups) {
      map.set(client.siteId, client.activeCount);
    }
    return map;
  }, [allSiteGroups]);

  const siteFilterOptions = useMemo(() => {
    const clients = wpSites.map((site) => ({
      id: site.id,
      label: site.name?.trim() || site.siteUrl || site.id,
      activeCount: activeCountBySiteId.get(site.id) ?? 0,
    }));
    if (wpSites.length <= 1) return clients;
    const allActive = clients.reduce((sum, site) => sum + site.activeCount, 0);
    return [
      { id: AGENT_RUNS_ALL_SITES_ID, label: "All clients", activeCount: allActive },
      ...clients,
    ];
  }, [activeCountBySiteId, wpSites]);

  const resolvedSiteFilter = useMemo(
    () =>
      isAgentsAllSitesFilter(agentsSiteFilter)
        ? AGENT_RUNS_ALL_SITES_ID
        : allSiteIds.includes(agentsSiteFilter)
          ? agentsSiteFilter
          : resolveDefaultAgentsSiteFilter(activeWordPressSiteId, allSiteIds),
    [activeWordPressSiteId, agentsSiteFilter, allSiteIds],
  );

  const selectedClient: AgentRunClientGroup | undefined = useMemo(
    () =>
      isAgentsAllSitesFilter(resolvedSiteFilter)
        ? undefined
        : allSiteGroups.find((group) => group.siteId === resolvedSiteFilter) ?? allSiteGroups[0],
    [allSiteGroups, resolvedSiteFilter],
  );

  const selectSite = useCallback(
    (siteId: string) => {
      setAgentsSiteFilter(siteId);
      if (isAgentsAllSitesFilter(siteId)) return;
      setActiveWordPressSiteId(siteId);
      const site = wpSites.find((s) => s.id === siteId);
      if (site) void handleConnectSite(site);
    },
    [handleConnectSite, setActiveWordPressSiteId, setAgentsSiteFilter, wpSites],
  );

  return {
    allSiteIds,
    allSiteGroups,
    resolvedSiteFilter,
    isAllClientsFilter: isAgentsAllSitesFilter(resolvedSiteFilter),
    selectedClient,
    setAgentsSiteFilter: selectSite,
    siteFilterOptions,
  };
}
