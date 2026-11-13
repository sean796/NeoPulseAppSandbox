import { appNavigate } from "@/lib/app-navigation";

/** Avoids clash with manager tab `/tasks` (Forge automations). */
const TASK_VIEW_PATH_RE = /^\/workspace-task\/([a-zA-Z0-9_-]+)$/;

export function buildTaskViewPath(taskId: string): string {
  return `/workspace-task/${encodeURIComponent(taskId)}`;
}

export function parseTaskIdFromPath(pathname: string): string | null {
  const match = pathname.match(TASK_VIEW_PATH_RE);
  if (!match) return null;
  const id = decodeURIComponent(match[1] ?? "").trim();
  return id || null;
}

export function isTaskViewPath(pathname: string): boolean {
  return TASK_VIEW_PATH_RE.test(pathname);
}

export function writeTaskViewPath(taskId: string): void {
  appNavigate(buildTaskViewPath(taskId));
}

export function resolveTaskHref(taskId: string, href?: string): string {
  const trimmed = href?.trim();
  if (trimmed) return trimmed;
  return buildTaskViewPath(taskId);
}
