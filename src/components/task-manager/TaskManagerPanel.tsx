import type { MouseEvent } from "react";
import { useMemo, useState } from "react";
import { ChevronDown, Download, X } from "lucide-react";
import { useTaskManager } from "@/contexts/task-manager-context";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { AgentRunsHeaderSiteFilter } from "@/components/agent-runs/AgentRunsHeaderSiteFilter";
import { AGENT_RUNS_ALL_SITES_ID } from "@/lib/agent-runs/agent-runs-site-filter";
import { wordpressSiteMenuDisplayName } from "@/lib/wordpress-site-display-name";
import {
  isWorkspaceTaskTerminal,
  type WorkspaceTask,
  type WorkspaceTaskStatus,
} from "@/lib/task-manager/types";
import { Button, SelectField } from "@/ui";
import { cn } from "@/lib/utils";
import {
  taskKindSelectSlotProps,
  taskPickerRowStyle,
} from "@/components/task-manager/task-kind-select-width";
import { TaskManagerDetailsDrawer } from "@/components/task-manager/TaskManagerDetailsDrawer";
import {
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS,
  contentOptimizerRowStripeClass,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import "@/components/agent-runs/agent-runs-theme.css";

/** Chevron first (left), then lead, status, dismiss X. */
const TASK_CARD_ROW_CLASS =
  "agent-runs-card__row !grid-cols-[1.75rem_minmax(0,1fr)_auto_1.75rem]";

/** Exact same fixed slot as Agents bucket select: zero CLS Tasks ↔ Agents. */
const KIND_SELECT_SLOT = taskKindSelectSlotProps();
const PICKER_ROW_STYLE = taskPickerRowStyle();

const STATUS_LABELS: Record<WorkspaceTaskStatus, string> = {
  running: "Running",
  done: "Done",
  error: "Failed",
  cancelled: "Cancelled",
};

const KIND_ALL = "__all_kinds__";

function statusClass(status: WorkspaceTaskStatus): string {
  if (status === "running") return "agent-runs-status-pill agent-runs-status-pill--running";
  if (status === "done") return "agent-runs-status-pill agent-runs-status-pill--done";
  if (status === "cancelled") return "agent-runs-status-pill agent-runs-status-pill--cancelled";
  return "agent-runs-status-pill agent-runs-status-pill--failed";
}

function kindLabel(kind: string): string {
  const trimmed = kind.trim();
  if (!trimmed) return "Task";
  return trimmed.replace(/_/g, " ");
}

/** Step + % on one line; post on its own line. */
function taskStatusLines(task: WorkspaceTask): string[] {
  const lines: string[] = [];
  const logged = (task.logLines ?? []).map((line) => line.trim()).filter(Boolean);
  if (logged.length > 0) {
    lines.push(logged[logged.length - 1]);
  } else {
    const step = task.step?.trim() || "";
    if (step) lines.push(step);
  }
  const post = task.currentTitle?.trim() || task.currentUrl?.trim() || "";
  if (post) lines.push(post);
  return lines;
}

export function TaskManagerPanel() {
  const { tasks, dismissTask, openTask } = useTaskManager();
  const { sites } = useWordPressSites();
  const [siteFilter, setSiteFilter] = useState(AGENT_RUNS_ALL_SITES_ID);
  const [kindFilter, setKindFilter] = useState(KIND_ALL);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const siteNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const site of sites) {
      map.set(site.id, wordpressSiteMenuDisplayName(site));
    }
    return map;
  }, [sites]);

  const siteFilterOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      if (!task.siteId?.trim()) continue;
      counts.set(task.siteId.trim(), (counts.get(task.siteId.trim()) ?? 0) + 1);
    }
    const options = [
      { id: AGENT_RUNS_ALL_SITES_ID, label: "All clients", activeCount: tasks.length },
    ];
    for (const site of sites) {
      const count = counts.get(site.id) ?? 0;
      if (count === 0 && !tasks.some((task) => task.siteId === site.id)) continue;
      options.push({
        id: site.id,
        label: wordpressSiteMenuDisplayName(site),
        activeCount: count,
      });
    }
    for (const [siteId, count] of counts) {
      if (options.some((opt) => opt.id === siteId)) continue;
      options.push({ id: siteId, label: siteId, activeCount: count });
    }
    return options;
  }, [sites, tasks]);

  const kindOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      const key = task.kind.trim() || "task";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [
      { value: KIND_ALL, label: `All kinds (${tasks.length})` },
      ...Array.from(counts.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([kind, count]) => ({
          value: kind,
          label: `${kindLabel(kind)} (${count})`,
        })),
    ];
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (siteFilter !== AGENT_RUNS_ALL_SITES_ID && task.siteId !== siteFilter) return false;
      if (kindFilter !== KIND_ALL && task.kind !== kindFilter) return false;
      return true;
    });
  }, [tasks, siteFilter, kindFilter]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="agent-runs-body">
        <div className="agent-runs-list">
          <div className="agent-runs-site-picker">
            <div className="agent-runs-site-picker-row" style={PICKER_ROW_STYLE}>
              <AgentRunsHeaderSiteFilter
                value={siteFilter}
                options={siteFilterOptions}
                onChange={(next) => {
                  setSiteFilter(next);
                  setExpandedTaskId(null);
                }}
              />
              <span className="agent-runs-site-picker-row__divider" aria-hidden />
              <div
                className={cn(
                  "agent-runs-bucket-select-slot agent-runs-site-picker-row__tabs flex-none self-center",
                  KIND_SELECT_SLOT.className,
                )}
                style={KIND_SELECT_SLOT.style}
              >
                <SelectField
                  placeholder="Task kinds"
                  value={kindFilter}
                  onValueChange={(next) => {
                    setKindFilter(next);
                    setExpandedTaskId(null);
                  }}
                  options={kindOptions}
                  width="full"
                />
              </div>
              <span className="agent-runs-site-picker-row__logs">
                <Button variant="quiet" type="button" reserved disabled>
                  <Download className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  All logs (0)
                </Button>
              </span>
            </div>
          </div>

          {filteredTasks.length === 0 ? null : (
            <div className="agent-runs-client-group">
              <div className="agent-runs-bucket-group__runs">
                {filteredTasks.map((task, index) => {
                  const terminal = isWorkspaceTaskTerminal(task.status);
                  const expanded = expandedTaskId === task.id;
                  const siteLabel = task.siteId
                    ? (siteNameById.get(task.siteId) ?? task.siteId)
                    : "Unassigned";
                  const isActive = task.status === "running";
                  const drawerId = `workspace-task-drawer-${task.id}`;
                  const statusLines = taskStatusLines(task);
                  const toggle = () => setExpandedTaskId(expanded ? null : task.id);
                  const handleRowClick = (e: MouseEvent<HTMLDivElement>) => {
                    if ((e.target as HTMLElement).closest("button, a")) return;
                    toggle();
                  };
                  return (
                    <div key={task.id} className={CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS}>
                      <div
                        className={cn(
                          TASK_CARD_ROW_CLASS,
                          contentOptimizerRowStripeClass(index, { isActiveOptimize: isActive }),
                          expanded && "agent-runs-card__row--expanded",
                        )}
                        role="button"
                        tabIndex={0}
                        aria-expanded={expanded}
                        aria-controls={drawerId}
                        onClick={handleRowClick}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggle();
                          }
                        }}
                      >
                        <Button
                          size="icon"
                          icon={ChevronDown}
                          variant="quiet"
                          className={cn("agent-runs-card__chevron", expanded && "rotate-180")}
                          aria-label={expanded ? "Collapse details" : "Expand details"}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle();
                          }}
                        />
                        <div className="agent-runs-card__lead">
                          <div className="agent-runs-card__title">{task.title}</div>
                          <span className="agent-runs-card__hint flex flex-col gap-0.5" aria-live="polite">
                            {statusLines.length > 0 ? (
                              statusLines.map((line) => (
                                <span key={line} className="block truncate">
                                  {line}
                                </span>
                              ))
                            ) : (
                              <span className="block">{"\u00a0"}</span>
                            )}
                          </span>
                        </div>
                        <span className="agent-runs-card__status-end">
                          <span className={statusClass(task.status)}>{STATUS_LABELS[task.status]}</span>
                        </span>
                        <Button
                          size="icon"
                          icon={X}
                          variant="quiet"
                          aria-label={
                            terminal ? `Dismiss task ${task.title}` : `Cancel task ${task.title}`
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            dismissTask(task.id);
                          }}
                        />
                      </div>

                      <div
                        id={drawerId}
                        className={cn(
                          "agent-runs-card__drawer",
                          !expanded && "agent-runs-card__drawer--collapsed",
                        )}
                        aria-hidden={!expanded}
                      >
                        <div className="agent-runs-card__drawer-inner">
                          <TaskManagerDetailsDrawer
                            task={task}
                            siteLabel={siteLabel}
                            onOpenStudio={() => openTask(task.id)}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
