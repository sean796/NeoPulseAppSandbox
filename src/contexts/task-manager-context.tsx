import { createContext, useContext } from "react";
import type {
  StartWorkspaceTaskInput,
  WorkspaceTask,
  WorkspaceTaskPatch,
} from "@/lib/task-manager/types";

export type TaskManagerContextValue = {
  tasks: WorkspaceTask[];
  hasRunning: boolean;
  latestTerminal: WorkspaceTask | undefined;
  startTask: (input: StartWorkspaceTaskInput) => Promise<WorkspaceTask>;
  patchTask: (taskId: string, patch: WorkspaceTaskPatch) => void;
  completeTask: (taskId: string) => void;
  failTask: (taskId: string, errorMessage: string) => void;
  cancelTask: (taskId: string) => void;
  cancelRunningTasks: () => void;
  dismissTask: (taskId: string) => void;
  clearAllTasks: () => void;
  openTask: (taskId: string) => void;
  openTasksPanel: () => void;
};

export const TaskManagerContext = createContext<TaskManagerContextValue | null>(null);

export function useTaskManager(): TaskManagerContextValue {
  const ctx = useContext(TaskManagerContext);
  if (!ctx) {
    throw new Error("useTaskManager must be used within TaskManagerProvider");
  }
  return ctx;
}

export function useTaskManagerOptional(): TaskManagerContextValue | null {
  return useContext(TaskManagerContext);
}
