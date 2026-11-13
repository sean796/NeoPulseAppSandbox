import {
  isWorkspaceTaskTerminal,
  type StartWorkspaceTaskInput,
  type WorkspaceTask,
  type WorkspaceTaskPatch,
  type WorkspaceTaskRunContext,
} from "@/lib/task-manager/types";
import { resolveTaskHref } from "@/lib/task-manager/task-url";

type Listener = () => void;

const STORAGE_KEY = "neo-pulse-workspace-tasks-v1";

let nextId = 1;
const tasks = new Map<string, WorkspaceTask>();
const controllers = new Map<string, AbortController>();
const listeners = new Set<Listener>();
/** Stable snapshot for useSyncExternalStore (must be referentially equal until emit). */
let snapshot: WorkspaceTask[] = [];

function rebuildSnapshot(): void {
  snapshot = Array.from(tasks.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

function canUseStorage(): boolean {
  return typeof localStorage !== "undefined";
}

function persistSnapshot(): void {
  if (!canUseStorage()) return;
  try {
    if (tasks.size === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        nextId,
        tasks: Array.from(tasks.values()),
      }),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

function isValidTask(value: unknown): value is WorkspaceTask {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<WorkspaceTask>;
  return (
    typeof row.id === "string" &&
    row.id.trim().length > 0 &&
    typeof row.title === "string" &&
    typeof row.kind === "string" &&
    typeof row.href === "string" &&
    (row.status === "running" ||
      row.status === "done" ||
      row.status === "error" ||
      row.status === "cancelled") &&
    typeof row.createdAt === "number" &&
    typeof row.updatedAt === "number"
  );
}

function hydrateFromStorage(): void {
  if (!canUseStorage()) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { nextId?: unknown; tasks?: unknown };
    const rows = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    for (const row of rows) {
      if (!isValidTask(row)) continue;
      tasks.set(row.id, row);
    }
    if (typeof parsed.nextId === "number" && Number.isFinite(parsed.nextId) && parsed.nextId > 0) {
      nextId = Math.max(nextId, Math.floor(parsed.nextId));
    }
  } catch {
    /* ignore corrupt storage */
  }
}

hydrateFromStorage();
rebuildSnapshot();

function emit(): void {
  rebuildSnapshot();
  persistSnapshot();
  for (const listener of listeners) listener();
}

function now(): number {
  return Date.now();
}

function patchChanged(current: WorkspaceTask, patch: WorkspaceTaskPatch): boolean {
  for (const key of Object.keys(patch) as (keyof WorkspaceTaskPatch)[]) {
    if (patch[key] !== undefined && patch[key] !== current[key]) return true;
  }
  return false;
}

export function createTaskId(): string {
  const id = `tm-${now().toString(36)}-${nextId}`;
  nextId += 1;
  return id;
}

export function listWorkspaceTasks(): WorkspaceTask[] {
  return snapshot;
}

export function getWorkspaceTaskSnapshot(): WorkspaceTask[] {
  return snapshot;
}

export function getWorkspaceTask(taskId: string): WorkspaceTask | undefined {
  return tasks.get(taskId);
}

export function subscribeWorkspaceTasks(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function patchWorkspaceTask(taskId: string, patch: WorkspaceTaskPatch): WorkspaceTask | undefined {
  const current = tasks.get(taskId);
  if (!current) return undefined;
  if (!patchChanged(current, patch)) return current;
  const next: WorkspaceTask = {
    ...current,
    ...patch,
    updatedAt: now(),
  };
  tasks.set(taskId, next);
  emit();
  return next;
}

export function registerWorkspaceTask(input: StartWorkspaceTaskInput & { id?: string }): WorkspaceTask {
  const id = input.id?.trim() || createTaskId();
  const existing = tasks.get(id);
  if (existing) return existing;
  const createdAt = now();
  const task: WorkspaceTask = {
    id,
    title: input.title.trim() || "Task",
    kind: input.kind.trim() || "task",
    status: "running",
    siteId: input.siteId?.trim() || undefined,
    href: resolveTaskHref(id, input.href),
    agentRunId: input.agentRunId,
    restore: input.restore,
    createdAt,
    updatedAt: createdAt,
  };
  tasks.set(id, task);
  emit();
  return task;
}

export async function startWorkspaceTask(input: StartWorkspaceTaskInput): Promise<WorkspaceTask> {
  const task = registerWorkspaceTask(input);
  if (!input.run) return task;

  const controller = new AbortController();
  controllers.set(task.id, controller);

  const ctx: WorkspaceTaskRunContext = {
    taskId: task.id,
    signal: controller.signal,
    patch: (patch) => {
      patchWorkspaceTask(task.id, patch);
    },
  };

  void (async () => {
    try {
      await input.run!(ctx);
      if (controller.signal.aborted) {
        patchWorkspaceTask(task.id, {
          status: "cancelled",
          errorMessage: "Cancelled",
        });
        return;
      }
      const latest = tasks.get(task.id);
      if (latest && !isWorkspaceTaskTerminal(latest.status)) {
        patchWorkspaceTask(task.id, { status: "done", progress: 100 });
      }
    } catch (err) {
      if (controller.signal.aborted) {
        patchWorkspaceTask(task.id, {
          status: "cancelled",
          errorMessage: "Cancelled",
        });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      patchWorkspaceTask(task.id, {
        status: "error",
        errorMessage: message || "Task failed",
      });
    } finally {
      controllers.delete(task.id);
    }
  })();

  return task;
}

export function cancelWorkspaceTask(taskId: string): void {
  const controller = controllers.get(taskId);
  if (controller) {
    controller.abort();
    controllers.delete(taskId);
  }
  const current = tasks.get(taskId);
  if (current && !isWorkspaceTaskTerminal(current.status)) {
    patchWorkspaceTask(taskId, {
      status: "cancelled",
      errorMessage: "Cancelled",
    });
  }
}

export function dismissWorkspaceTask(taskId: string): void {
  cancelWorkspaceTask(taskId);
  if (!tasks.has(taskId)) return;
  tasks.delete(taskId);
  emit();
}

export function hasRunningWorkspaceTasks(): boolean {
  for (const task of tasks.values()) {
    if (task.status === "running") return true;
  }
  return false;
}

export function latestTerminalWorkspaceTask(): WorkspaceTask | undefined {
  return snapshot.find((task) => isWorkspaceTaskTerminal(task.status));
}

/** Explicit user clear only. Never call on mount or refresh. */
export function clearAllWorkspaceTasks(): void {
  for (const controller of controllers.values()) controller.abort();
  controllers.clear();
  tasks.clear();
  nextId = 1;
  emit();
}

/** Test helper: wipe runtime state. */
export function resetWorkspaceTaskRuntimeForTests(): void {
  clearAllWorkspaceTasks();
}
