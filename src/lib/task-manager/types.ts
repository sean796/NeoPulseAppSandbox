export type WorkspaceTaskStatus = "running" | "done" | "error" | "cancelled";

/** Snapshot of the studio surface where the task was started. */
export type WorkspaceTaskRestore = {
  sitemapSource?: "pages" | "posts" | "sap";
};

export type WorkspaceTask = {
  id: string;
  title: string;
  kind: string;
  status: WorkspaceTaskStatus;
  siteId?: string;
  href: string;
  step?: string;
  progress?: number;
  /** URL of the post/page currently being worked. */
  currentUrl?: string;
  /** Display title for currentUrl when known. */
  currentTitle?: string;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
  /** Optional link to an agent-run id when this task mirrors one. */
  agentRunId?: number;
  /** Where to put the user when they click the task. */
  restore?: WorkspaceTaskRestore;
};

export type WorkspaceTaskPatch = Partial<
  Pick<
    WorkspaceTask,
    | "title"
    | "status"
    | "step"
    | "progress"
    | "currentUrl"
    | "currentTitle"
    | "errorMessage"
    | "href"
    | "siteId"
    | "agentRunId"
    | "restore"
  >
>;

export type StartWorkspaceTaskInput = {
  title: string;
  kind: string;
  siteId?: string;
  href?: string;
  agentRunId?: number;
  restore?: WorkspaceTaskRestore;
  /** Background work. Task Manager owns lifecycle; leaving the page does not cancel. */
  run?: (ctx: WorkspaceTaskRunContext) => Promise<void>;
};

export type WorkspaceTaskRunContext = {
  taskId: string;
  signal: AbortSignal;
  patch: (patch: WorkspaceTaskPatch) => void;
};

export function isWorkspaceTaskTerminal(status: WorkspaceTaskStatus): boolean {
  return status === "done" || status === "error" || status === "cancelled";
}
