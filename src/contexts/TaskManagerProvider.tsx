import {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useActiveWordPressSite } from "@/contexts/active-wordpress-site-context";
import { useAgentRunsContext } from "@/contexts/use-agent-runs-context";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { syncActiveAgentRunsToTasks } from "@/lib/task-manager/adapt-agent-run";
import {
  cancelWorkspaceTask,
  clearAllWorkspaceTasks,
  dismissWorkspaceTask,
  getWorkspaceTask,
  getWorkspaceTaskSnapshot,
  patchWorkspaceTask,
  startWorkspaceTask,
  subscribeWorkspaceTasks,
} from "@/lib/task-manager/runtime-store";
import { appNavigate } from "@/lib/app-navigation";
import { writeSidebarOpen, writeSidebarPanel } from "@/lib/pulse-assist/storage";
import {
  buildAutoSeoTaskHref,
  OVERVIEW_TASK_CLIENT_QUERY,
  parseOverviewClientNameFromSearch,
  parseOverviewSourceFromPath,
  writeOverviewTaskRestoreIntent,
} from "@/lib/task-manager/overview-restore";
import { writeOverviewStudioActiveUrl } from "@/lib/overview/overview-studio-active-url-persist";
import type { StartWorkspaceTaskInput, WorkspaceTask, WorkspaceTaskPatch } from "@/lib/task-manager/types";
import { isWorkspaceTaskTerminal } from "@/lib/task-manager/types";
import { TaskManagerContext, type TaskManagerContextValue } from "@/contexts/task-manager-context";
import {
  wordpressSiteCanonicalName,
  wordpressSiteMenuDisplayName,
} from "@/lib/wordpress-site-display-name";
import { propertyDashboardPath } from "@/lib/properties/property-dashboard-slug";

/** Profile skills stay on the client URL. They do not switch the header connected site. */
const PROFILE_SKILL_KINDS = new Set([
  "blog_ideas_studio",
  "posts_content_gap_check",
  "entities_content_gap_check",
  "money_page_internal_links",
  "editorial_content_audit",
  "fact_checker",
  "cannibalization_audit",
  "semrush_safe_fix",
]);

function subscribe(listener: () => void): () => void {
  return subscribeWorkspaceTasks(listener);
}

function getSnapshot() {
  return getWorkspaceTaskSnapshot();
}

export function TaskManagerProvider({ children }: { children: ReactNode }) {
  const tasks = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const { setSidebarOpen, setSidebarPanel, runs, cancelRun } = useAgentRunsContext();
  const { setActiveWordPressSiteId } = useActiveWordPressSite();
  const { sites } = useWordPressSites();

  // Rehydrate Tasks from live server agent runs after refresh. Never wipe on mount.
  useEffect(() => {
    syncActiveAgentRunsToTasks(runs);
  }, [runs]);

  const openTasksPanel = useCallback(() => {
    setSidebarPanel("tasks");
    writeSidebarPanel("tasks");
    setSidebarOpen(true);
    writeSidebarOpen(true);
  }, [setSidebarOpen, setSidebarPanel]);

  const openTask = useCallback(
    (taskId: string) => {
      const task = getWorkspaceTask(taskId);
      if (!task) return;
      const siteId = task.siteId?.trim() || "";
      const site = siteId ? sites.find((item) => item.id === siteId) : undefined;
      const clientName = site
        ? wordpressSiteMenuDisplayName(site) || wordpressSiteCanonicalName(site)
        : "";

      // Profile skills: open Tasks only. Stay on (or return to) the client URL.
      // Do not read or change the header connected site.
      if (PROFILE_SKILL_KINDS.has(task.kind)) {
        setSidebarPanel("tasks");
        writeSidebarPanel("tasks");
        setSidebarOpen(true);
        writeSidebarOpen(true);
        const clientHref = site
          ? propertyDashboardPath(site)
          : task.href?.startsWith("/dashboard/")
            ? task.href
            : "";
        if (clientHref) appNavigate(clientHref);
        return;
      }

      if (siteId) {
        setActiveWordPressSiteId(siteId);
      }
      const focusUrl = task.currentUrl?.trim() || "";
      if (siteId && focusUrl) {
        writeOverviewStudioActiveUrl(siteId, focusUrl);
      }
      const sourceFromTask = task.restore?.sitemapSource;
      const sourceFromHref = parseOverviewSourceFromPath("", task.href.includes("?") ? task.href.slice(task.href.indexOf("?")) : "");
      const sitemapSource = sourceFromTask ?? sourceFromHref ?? undefined;
      writeOverviewTaskRestoreIntent({
        siteId: siteId || undefined,
        sitemapSource,
        clientName: clientName || undefined,
      });
      // Keep Tasks open; studio restore is additive, not a hide-the-rail navigation.
      setSidebarPanel("tasks");
      writeSidebarPanel("tasks");
      setSidebarOpen(true);
      writeSidebarOpen(true);
      // Always land on studio with source + client NAME in the URL (never site id).
      const href = sitemapSource
        ? buildAutoSeoTaskHref(sitemapSource, clientName || undefined)
        : (() => {
            if (!clientName) return task.href;
            const search = task.href.includes("?") ? task.href.slice(task.href.indexOf("?")) : "";
            if (parseOverviewClientNameFromSearch(search)) return task.href;
            const join = task.href.includes("?") ? "&" : "?";
            return `${task.href}${join}${OVERVIEW_TASK_CLIENT_QUERY}=${encodeURIComponent(clientName)}`;
          })();
      appNavigate(href);
    },
    [setActiveWordPressSiteId, setSidebarOpen, setSidebarPanel, sites],
  );

  const startTask = useCallback(async (input: StartWorkspaceTaskInput) => {
    return startWorkspaceTask(input);
  }, []);

  const patchTask = useCallback((taskId: string, patch: WorkspaceTaskPatch) => {
    patchWorkspaceTask(taskId, patch);
  }, []);

  const completeTask = useCallback((taskId: string) => {
    patchWorkspaceTask(taskId, { status: "done", progress: 100 });
  }, []);

  const failTask = useCallback((taskId: string, errorMessage: string) => {
    patchWorkspaceTask(taskId, {
      status: "error",
      errorMessage: errorMessage.trim() || "Task failed",
    });
  }, []);

  const stopServerRun = useCallback(
    (taskId: string) => {
      const task = getWorkspaceTask(taskId);
      const fromField = task?.agentRunId;
      const fromId = /^agent-run-(\d+)$/.exec(taskId)?.[1];
      const runId =
        typeof fromField === "number" && fromField > 0
          ? fromField
          : fromId
            ? Number(fromId)
            : 0;
      if (runId > 0) void cancelRun(runId);
    },
    [cancelRun],
  );

  const cancelTask = useCallback(
    (taskId: string) => {
      stopServerRun(taskId);
      cancelWorkspaceTask(taskId);
    },
    [stopServerRun],
  );

  const cancelRunningTasks = useCallback(() => {
    for (const task of getWorkspaceTaskSnapshot()) {
      if (task.status === "running") {
        stopServerRun(task.id);
        cancelWorkspaceTask(task.id);
      }
    }
  }, [stopServerRun]);

  const dismissTask = useCallback(
    (taskId: string) => {
      stopServerRun(taskId);
      dismissWorkspaceTask(taskId);
    },
    [stopServerRun],
  );

  const clearAllTasks = useCallback(() => {
    for (const task of getWorkspaceTaskSnapshot()) {
      stopServerRun(task.id);
    }
    clearAllWorkspaceTasks();
  }, [stopServerRun]);

  const value = useMemo<TaskManagerContextValue>(() => {
    const hasRunning = tasks.some((task) => task.status === "running");
    const latestTerminal = tasks.reduce<WorkspaceTask | undefined>((latest, task) => {
      if (!isWorkspaceTaskTerminal(task.status)) return latest;
      if (!latest || task.updatedAt > latest.updatedAt) return task;
      return latest;
    }, undefined);
    return {
      tasks,
      hasRunning,
      latestTerminal,
      startTask,
      patchTask,
      completeTask,
      failTask,
      cancelTask,
      cancelRunningTasks,
      dismissTask,
      clearAllTasks,
      openTask,
      openTasksPanel,
    };
  }, [
    tasks,
    startTask,
    patchTask,
    completeTask,
    failTask,
    cancelTask,
    cancelRunningTasks,
    dismissTask,
    clearAllTasks,
    openTask,
    openTasksPanel,
  ]);

  return <TaskManagerContext.Provider value={value}>{children}</TaskManagerContext.Provider>;
}
