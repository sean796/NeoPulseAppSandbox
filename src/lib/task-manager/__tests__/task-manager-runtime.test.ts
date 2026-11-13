import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelWorkspaceTask,
  dismissWorkspaceTask,
  getWorkspaceTask,
  hasRunningWorkspaceTasks,
  listWorkspaceTasks,
  patchWorkspaceTask,
  resetWorkspaceTaskRuntimeForTests,
  startWorkspaceTask,
} from "@/lib/task-manager/runtime-store";
import { buildTaskViewPath, parseTaskIdFromPath, resolveTaskHref } from "@/lib/task-manager/task-url";
import {
  refreshTrackedAgentRuns,
  syncActiveAgentRunsToTasks,
  trackStartedAgentRun,
} from "@/lib/task-manager/adapt-agent-run";
import type { AgentRun } from "@/lib/agent-runs-types";

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  });
});

afterEach(() => {
  resetWorkspaceTaskRuntimeForTests();
  vi.unstubAllGlobals();
});

describe("task-manager runtime", () => {
  it("starts a task, runs work in background, and marks done", async () => {
    let resolveWork: (() => void) | undefined;
    const work = new Promise<void>((resolve) => {
      resolveWork = resolve;
    });

    const task = await startWorkspaceTask({
      title: "Auto SEO (50)",
      kind: "auto_seo",
      siteId: "site-a",
      href: "/generator/opt",
      run: async (ctx) => {
        ctx.patch({ step: "Optimizing content", progress: 40 });
        await work;
      },
    });

    expect(task.status).toBe("running");
    expect(hasRunningWorkspaceTasks()).toBe(true);
    expect(getWorkspaceTask(task.id)?.step).toBe("Optimizing content");
    expect(getWorkspaceTask(task.id)?.progress).toBe(40);

    resolveWork?.();
    await vi.waitFor(() => {
      expect(getWorkspaceTask(task.id)?.status).toBe("done");
    });
    expect(hasRunningWorkspaceTasks()).toBe(false);
  });

  it("keeps the task listed after cancel and supports dismiss", async () => {
    const task = await startWorkspaceTask({
      title: "Long job",
      kind: "report",
      run: async () => {
        await new Promise(() => {
          /* never resolves unless cancelled */
        });
      },
    });

    cancelWorkspaceTask(task.id);
    await vi.waitFor(() => {
      expect(getWorkspaceTask(task.id)?.status).toBe("cancelled");
    });

    dismissWorkspaceTask(task.id);
    expect(listWorkspaceTasks().find((item) => item.id === task.id)).toBeUndefined();
  });

  it("patches progress while running", async () => {
    const task = await startWorkspaceTask({
      title: "Patch me",
      kind: "optimize",
    });
    patchWorkspaceTask(task.id, { step: "Uploading", progress: 90 });
    expect(getWorkspaceTask(task.id)?.step).toBe("Uploading");
    expect(getWorkspaceTask(task.id)?.progress).toBe(90);
  });
});

describe("task-manager urls", () => {
  it("builds and parses workspace-task paths", () => {
    const href = buildTaskViewPath("tm-abc");
    expect(href).toBe("/workspace-task/tm-abc");
    expect(parseTaskIdFromPath(href)).toBe("tm-abc");
    expect(resolveTaskHref("tm-abc", "/generator/opt")).toBe("/generator/opt");
  });
});

describe("adapt-agent-run", () => {
  const sampleRun = {
    id: 42,
    teamId: 1,
    createdBy: 1,
    title: "Bulk optimize",
    recipeKey: "content_optimizer_bulk",
    recipeTitle: "Content optimizer",
    status: "running",
    source: "task_manager",
    taskId: 0,
    taskTitle: "",
    context: { siteId: "site-b" },
    plan: {},
    result: null,
    errorMessage: "",
    clientBatchKey: "",
    startedAt: null,
    finishedAt: null,
    createdAt: "",
    updatedAt: "",
    steps: [{ id: 1, stepIndex: 0, label: "Inventory", status: "running", createdAt: "" }],
  } as AgentRun;

  it("tracks a freshly started agent run with virtual href", () => {
    const task = trackStartedAgentRun(sampleRun);
    expect(task.agentRunId).toBe(42);
    expect(task.title).toBe("Content optimizer");
    expect(task.href).toContain("/agent-run/42");
    expect(task.status).toBe("running");
  });

  it("does not invent tasks from history refresh", () => {
    refreshTrackedAgentRuns([
      { ...sampleRun, id: 99, recipeTitle: "GSC reporting", recipeKey: "gsc_reporting", status: "done" },
    ]);
    expect(listWorkspaceTasks().find((task) => task.agentRunId === 99)).toBeUndefined();
  });

  it("rehydrates active server agent runs into Tasks after refresh", () => {
    syncActiveAgentRunsToTasks([sampleRun]);
    expect(listWorkspaceTasks().find((task) => task.agentRunId === 42)?.status).toBe("running");
  });

  it("persists tasks to localStorage and only clears when asked", async () => {
    await startWorkspaceTask({
      title: "Auto SEO (12)",
      kind: "auto_seo",
      siteId: "site-persist",
      href: "/generator/opt?source=posts",
    });
    const raw = localStorage.getItem("neo-pulse-workspace-tasks-v1");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as { tasks: Array<{ kind: string; status: string }> };
    expect(parsed.tasks.some((task) => task.kind === "auto_seo" && task.status === "running")).toBe(
      true,
    );

    resetWorkspaceTaskRuntimeForTests();
    expect(localStorage.getItem("neo-pulse-workspace-tasks-v1")).toBeNull();
  });
});
