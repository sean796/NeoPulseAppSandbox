import { agentRunSiteId } from "@/lib/agent-runs/agent-run-batch-key";
import { resolveAgentRunRecipeKey } from "@/lib/agent-runs/agent-run-navigation";
import type { AgentRun } from "@/lib/agent-runs-types";
import { isAgentRunTerminal } from "@/lib/agent-runs-types";
import {
  isTaskExecutionTargetBucket,
  TASK_EXECUTION_TARGET_BUCKET_LABELS,
  type TaskExecutionTargetBucket,
} from "@/lib/task-execution-bucket";
import { isTaskExecutionTargetAll } from "@/lib/task-execution-target";

export type AgentRunRecipeBucketKey =
  | "reporting"
  | "editorial"
  | "meta"
  | "research"
  | "dfs_llm_article_audit";

export type AgentRunBucketKey = TaskExecutionTargetBucket | AgentRunRecipeBucketKey | "other";

export type AgentRunBucketGroup = {
  key: AgentRunBucketKey;
  label: string;
  runs: AgentRun[];
  activeCount: number;
};

export type AgentRunClientGroup = {
  siteId: string;
  label: string;
  buckets: AgentRunBucketGroup[];
  runCount: number;
  activeCount: number;
};

export const AGENT_RUN_BUCKET_ORDER: AgentRunBucketKey[] = [
  "pages",
  "posts",
  "sap",
  "all",
  "reporting",
  "research",
  "dfs_llm_article_audit",
  "editorial",
  "meta",
  "other",
];

export const AGENT_RUN_UNASSIGNED_CLIENT_ID = "__unassigned__";
export const AGENT_RUN_UNASSIGNED_CLIENT_LABEL = "Unassigned";

const SITEMAP_SOURCE_BUCKETS = new Set<string>(["pages", "posts", "sap"]);

function isActiveRun(run: AgentRun): boolean {
  return !isAgentRunTerminal(run.status);
}

function bucketLabel(key: AgentRunBucketKey): string {
  if (key === "other") return "Other";
  if (key === "reporting") return "Reporting";
  if (key === "research") return "Research";
  if (key === "dfs_llm_article_audit") return "Article audit";
  if (key === "editorial") return "Editorial";
  if (key === "meta") return "Meta";
  return TASK_EXECUTION_TARGET_BUCKET_LABELS[key];
}

function recipeBucketKey(run: AgentRun): AgentRunRecipeBucketKey | null {
  const recipe = resolveAgentRunRecipeKey(run);
  if (recipe === "gsc_reporting" || recipe === "ads_reporting") return "reporting";
  if (recipe === "local_dominator_export") return "research";
  if (recipe === "chatgpt_website_audit") return "research";
  if (recipe === "browser_automation") return "research";
  if (recipe === "dfs_llm_article_audit") return "dfs_llm_article_audit";
  if (recipe === "content_gap_check") return "editorial";
  if (recipe === "posts_content_gap_check") return "editorial";
  if (recipe === "entities_content_gap_check") return "editorial";
  if (recipe === "money_page_internal_links") return "editorial";
  if (recipe === "editorial_content_audit") return "editorial";
  if (recipe === "post_creator") return "editorial";
  if (recipe === "entity_page_creator" || recipe === "entity_generator" || recipe === "sap_generator") {
    return "editorial";
  }
  if (recipe === "overview_pages_meta_batch") return "meta";
  if (recipe === "content_optimizer_bulk") return "meta";
  return null;
}

function inferBucketFromResolvedPost(
  resolvedPost: { subtype?: string; endpoint?: string } | null | undefined,
): AgentRunBucketKey | null {
  const endpoint = resolvedPost?.endpoint?.trim().toLowerCase();
  if (endpoint === "pages") return "pages";
  if (endpoint === "posts") return "posts";
  if (endpoint && endpoint !== "page" && endpoint !== "post") return "sap";

  const subtype = resolvedPost?.subtype?.trim().toLowerCase();
  if (subtype === "page") return "pages";
  if (subtype === "post") return "posts";
  if (subtype && subtype !== "page" && subtype !== "post") return "sap";
  return null;
}

function resolveSitemapSourceBucket(run: AgentRun): AgentRunBucketKey | null {
  const raw = run.context.sitemapSource?.trim() || run.plan.sitemapSource?.trim();
  if (raw && SITEMAP_SOURCE_BUCKETS.has(raw) && isTaskExecutionTargetBucket(raw)) {
    return raw;
  }
  return null;
}

export function agentRunClientId(run: AgentRun): string {
  return agentRunSiteId(run) || AGENT_RUN_UNASSIGNED_CLIENT_ID;
}

export function agentRunBucketKey(run: AgentRun): AgentRunBucketKey {
  const recipe = resolveAgentRunRecipeKey(run);
  if (recipe === "dfs_llm_article_audit") return "dfs_llm_article_audit";

  const contract = run.plan?.clientRunContract;
  const bucket = contract?.targetBucket?.trim();
  if (bucket && isTaskExecutionTargetBucket(bucket)) return bucket;
  if (contract?.scope === "all" || isTaskExecutionTargetAll(contract?.url)) return "all";

  const inferred = inferBucketFromResolvedPost(contract?.resolvedPost);
  if (inferred) return inferred;

  const sitemapBucket = resolveSitemapSourceBucket(run);
  if (sitemapBucket) return sitemapBucket;

  const recipeBucket = recipeBucketKey(run);
  if (recipeBucket) return recipeBucket;

  return "other";
}

export function resolveAgentRunClientLabel(
  siteId: string,
  siteNameById: ReadonlyMap<string, string>,
): string {
  if (siteId === AGENT_RUN_UNASSIGNED_CLIENT_ID) return AGENT_RUN_UNASSIGNED_CLIENT_LABEL;
  return siteNameById.get(siteId)?.trim() || siteId;
}

export function buildAgentRunSiteNameMap(
  sites: ReadonlyArray<{ id: string; name: string; siteUrl?: string }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const site of sites) {
    const id = site.id.trim();
    if (!id) continue;
    map.set(id, site.name.trim() || site.siteUrl?.trim() || id);
  }
  return map;
}

function compareClientGroups(a: AgentRunClientGroup, b: AgentRunClientGroup): number {
  if (a.siteId === AGENT_RUN_UNASSIGNED_CLIENT_ID) return 1;
  if (b.siteId === AGENT_RUN_UNASSIGNED_CLIENT_ID) return -1;
  return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
}

function compareBucketGroups(a: AgentRunBucketGroup, b: AgentRunBucketGroup): number {
  return AGENT_RUN_BUCKET_ORDER.indexOf(a.key) - AGENT_RUN_BUCKET_ORDER.indexOf(b.key);
}

export function buildAgentRunGroups(
  runs: AgentRun[],
  siteNameById: ReadonlyMap<string, string>,
): AgentRunClientGroup[] {
  const clientMap = new Map<string, Map<AgentRunBucketKey, AgentRun[]>>();

  for (const run of runs) {
    const clientId = agentRunClientId(run);
    const bucketKey = agentRunBucketKey(run);
    let bucketMap = clientMap.get(clientId);
    if (!bucketMap) {
      bucketMap = new Map();
      clientMap.set(clientId, bucketMap);
    }
    const bucketRuns = bucketMap.get(bucketKey) ?? [];
    bucketRuns.push(run);
    bucketMap.set(bucketKey, bucketRuns);
  }

  const groups: AgentRunClientGroup[] = [];

  for (const [siteId, bucketMap] of clientMap) {
    const buckets: AgentRunBucketGroup[] = [];
    let clientRunCount = 0;
    let clientActiveCount = 0;

    for (const [key, bucketRuns] of bucketMap) {
      const activeCount = bucketRuns.filter(isActiveRun).length;
      clientRunCount += bucketRuns.length;
      clientActiveCount += activeCount;
      buckets.push({
        key,
        label: bucketLabel(key),
        runs: bucketRuns,
        activeCount,
      });
    }

    buckets.sort(compareBucketGroups);
    groups.push({
      siteId,
      label: resolveAgentRunClientLabel(siteId, siteNameById),
      buckets,
      runCount: clientRunCount,
      activeCount: clientActiveCount,
    });
  }

  groups.sort(compareClientGroups);
  return groups;
}

export function flattenAgentRunClientRuns(
  groups: AgentRunClientGroup[],
): Array<{ client: AgentRunClientGroup; run: AgentRun }> {
  const rows: Array<{ client: AgentRunClientGroup; run: AgentRun }> = [];
  for (const client of groups) {
    for (const bucket of client.buckets) {
      for (const run of bucket.runs) {
        rows.push({ client, run });
      }
    }
  }
  rows.sort((a, b) => b.run.id - a.run.id);
  return rows;
}

/** One drawer per enabled site, merged with run groups so empty clients still appear. */
export function mergeEnabledSiteClientGroups(
  enabledSiteIds: string[],
  runGroups: AgentRunClientGroup[],
  siteNameById: ReadonlyMap<string, string>,
): AgentRunClientGroup[] {
  const bySiteId = new Map(runGroups.map((group) => [group.siteId, group]));
  const merged = enabledSiteIds.map((siteId) => {
    const existing = bySiteId.get(siteId);
    if (existing) return existing;
    return {
      siteId,
      label: resolveAgentRunClientLabel(siteId, siteNameById),
      buckets: [],
      runCount: 0,
      activeCount: 0,
    };
  });

  const unassigned = bySiteId.get(AGENT_RUN_UNASSIGNED_CLIENT_ID);
  if (unassigned) merged.push(unassigned);

  merged.sort(compareClientGroups);
  return merged;
}

export function agentRunClientFolderKey(siteId: string): string {
  return `client:${siteId}`;
}

export function agentRunBucketFolderKey(siteId: string, bucketKey: AgentRunBucketKey): string {
  return `bucket:${siteId}:${bucketKey}`;
}

export function buildAutoExpandedAgentRunFolderKeys(
  runs: AgentRun[],
  selectedRunId: number | null,
): Set<string> {
  const keys = new Set<string>();

  for (const run of runs) {
    const shouldExpand = isActiveRun(run) || (selectedRunId != null && run.id === selectedRunId);
    if (!shouldExpand) continue;
    const siteId = agentRunClientId(run);
    const bucketKey = agentRunBucketKey(run);
    keys.add(agentRunClientFolderKey(siteId));
    keys.add(agentRunBucketFolderKey(siteId, bucketKey));
  }

  return keys;
}

export function buildAutoExpandedAgentRunClientKeys(
  runs: AgentRun[],
  selectedRunId: number | null,
): Set<string> {
  const keys = new Set<string>();
  for (const run of runs) {
    const shouldExpand = isActiveRun(run) || (selectedRunId != null && run.id === selectedRunId);
    if (!shouldExpand) continue;
    keys.add(agentRunClientFolderKey(agentRunClientId(run)));
  }
  return keys;
}

/** Per-client bucket tab: keep the user's pick; otherwise prefer active runs. */
export function resolveAgentRunBucketTabSelections(
  clientGroups: AgentRunClientGroup[],
  currentSelections: Readonly<Record<string, AgentRunBucketKey>> = {},
): Record<string, AgentRunBucketKey> {
  const result: Record<string, AgentRunBucketKey> = {};

  for (const client of clientGroups) {
    const buckets = client.buckets;
    const userPick = currentSelections[client.siteId];

    if (userPick) {
      result[client.siteId] = userPick;
      continue;
    }

    const activeBucket = buckets.find((bucket) => bucket.activeCount > 0);
    const bucketWithRuns = activeBucket ?? buckets.find((bucket) => bucket.runs.length > 0);
    result[client.siteId] = bucketWithRuns?.key ?? buckets[0]?.key ?? "reporting";
  }

  return result;
}
