import { useCallback, type Dispatch, type SetStateAction } from "react";
import { logger } from "@/lib/logger";
import {
  createAgentRun,
  patchAgentRun,
} from "@/lib/agent-runs-api";
import { buildAgentRunBatchKey } from "@/lib/agent-runs/agent-run-batch-key";
import { pinAgentRunSiteId } from "@/lib/agent-runs/resolve-agent-run-site";
import {
  retainSiblingOptimisticAgentRuns,
} from "@/lib/agent-runs/optimistic-workflow-agent-run";
import { agentRunIsServerExecution } from "@/lib/agent-runs/agent-run-display";
import type { AgentRunListPatch } from "@/lib/agent-runs/agent-runs-local-patch";
import type { AgentRun, StartAgentRunPayload } from "@/lib/agent-runs-types";
import { resolveTaskExecuteSiteId, taskExecutionKindToRecipe } from "@/lib/agent-runs-types";
import { prepareTaskForAutomationExecute, resolveEffectiveExecutionKind } from "@/lib/task-automation-ui";
import { readCachedExecutionPayload } from "@/lib/forge-automation-plan-cache";
import { mergeExecutionPayloadForSave } from "@/lib/post-creator/post-creator-schedule-payload";
import { startTaskExecution } from "@/lib/tasks-api";
import {
  advanceServerAgentRun,
} from "@/lib/agent-runs/run-server-post-creator-upload";
import type { TeamTask } from "@/lib/tasks-types";
import {
  type StartRunOptions,
} from "@/contexts/agent-runs-provider-helpers";
import { trackStartedAgentRun } from "@/lib/task-manager/adapt-agent-run";
import type { useWordPressSites } from "@/hooks/use-wordpress-sites";

type UseAgentRunsStartRunParams = {
  teamId: number | null;
  activeWordPressSiteId: string | null;
  sites: ReturnType<typeof useWordPressSites>["sites"];
  runsRef: { current: AgentRun[] };
  kickClientAgentRuns: (candidates: AgentRun[]) => void;
  openSidebar: (runId?: number) => void;
  patchRunInList: (runId: number, patch: AgentRunListPatch) => void;
  refreshRuns: () => Promise<void>;
  setRuns: Dispatch<SetStateAction<AgentRun[]>>;
};

export function useAgentRunsStartRun({
  teamId,
  activeWordPressSiteId,
  sites,
  kickClientAgentRuns,
  openSidebar,
  patchRunInList,
  refreshRuns,
  setRuns,
}: UseAgentRunsStartRunParams) {
  const startRun = useCallback(
    async (payload: StartAgentRunPayload, options?: StartRunOptions) => {
      const result = await createAgentRun(payload);
      if (result.ok && result.run) {
        const clientBatchKey = buildAgentRunBatchKey(result.run.id);
        const siteId =
          payload.context?.siteId?.trim()
          || String(payload.plan?.clientRunContract?.siteId ?? "").trim()
          || String((payload.plan?.executionPayload as { siteId?: string } | undefined)?.siteId ?? "").trim();
        const run = pinAgentRunSiteId({ ...result.run, clientBatchKey }, siteId);
        void patchAgentRun(result.run.teamId, result.run.id, { clientBatchKey });
        setRuns((prev) => {
          const withoutOptimistic = retainSiblingOptimisticAgentRuns(prev, run);
          const idx = withoutOptimistic.findIndex((r) => r.id === run.id);
          if (idx >= 0) {
            const next = [...withoutOptimistic];
            next[idx] = run;
            return next;
          }
          return [run, ...withoutOptimistic];
        });
        if (options?.openSidebar === true) {
          openSidebar(result.run.id);
        }
        trackStartedAgentRun(run);
        if (agentRunIsServerExecution(run)) {
          void advanceServerAgentRun(payload.teamId, run, sites)
            .then((latest) => {
              patchRunInList(run.id, latest);
            })
            .catch((err) => {
              logger.error("[Agent runs] Server run advance failed:", err);
            });
        } else if (!agentRunIsServerExecution(run)) {
          kickClientAgentRuns([run]);
        }
        return { ok: true, run };
      } else {
        void refreshRuns();
      }
      return result;
    },
    [kickClientAgentRuns, openSidebar, patchRunInList, refreshRuns, setRuns, sites],
  );

  const startRunFromTask = useCallback(
    async (task: TeamTask, options?: StartRunOptions) => {
      if (!teamId) return { ok: false, error: "No active team" };
      const prepared = prepareTaskForAutomationExecute(task, null, activeWordPressSiteId);
      const kind =
        (prepared.executionKind ?? "").trim() ||
        resolveEffectiveExecutionKind(prepared);
      const recipeKey = taskExecutionKindToRecipe(kind);
      if (!recipeKey) return { ok: false, error: "Task has no execution recipe" };

      const siteId =
        prepared.wordpressSiteId?.trim() || resolveTaskExecuteSiteId(prepared, activeWordPressSiteId);
      if (!siteId) {
        return { ok: false, error: "Set a client on the project." };
      }

      const executionPayload = mergeExecutionPayloadForSave(
        readCachedExecutionPayload(prepared.projectId),
        prepared.executionPayload,
      );

      const pinnedPayload = {
        ...executionPayload,
        siteId,
        wordpressSiteId: siteId,
      };
      const exec = await startTaskExecution(teamId, prepared.id, {
        executionKind: kind as TeamTask["executionKind"],
        executionPayload: pinnedPayload,
        wordpressSiteId: siteId,
      });
      if (!exec.ok || !exec.execution) {
        return { ok: false, error: exec.error ?? "Could not start task execution" };
      }

      if (exec.execution.status === "completed") {
        return startRun(
          {
            teamId,
            source: "task_manager",
            recipeKey,
            title: prepared.title,
            taskId: prepared.id,
            context: {
              siteId,
              taskKeyword: prepared.keyword,
              taskTitle: prepared.title,
              projectId: prepared.projectId,
            },
            plan: {
              taskExecutionId: exec.execution.id,
              completedOnServer: true,
              executionPayload: pinnedPayload,
              clientRunContract: { siteId },
            },
          },
          options,
        );
      }

      const executionMode =
        exec.execution.executionMode === "server" ? ("server" as const) : undefined;

      return startRun(
        {
          teamId,
          source: "task_manager",
          recipeKey,
          title: prepared.title,
          taskId: prepared.id,
          context: {
            siteId,
            taskKeyword: prepared.keyword,
            taskTitle: prepared.title,
            projectId: prepared.projectId,
          },
          plan: {
            taskExecutionId: exec.execution.id,
            executionKind: kind,
            clientRunContract: {
              ...(exec.execution.clientRunContract ?? {}),
              siteId,
            },
            executionPayload: pinnedPayload,
            executionMode,
          },
        },
        options,
      );
    },
    [activeWordPressSiteId, startRun, teamId],
  );

  return {
    startRun,
    startRunFromTask,
  };
}
