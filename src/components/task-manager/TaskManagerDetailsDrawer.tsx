import { AgentRunProgressLog } from "@/components/agent-runs/AgentRunProgressLog";
import {
  CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS,
  CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
  CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS,
  contentOptimizerRowStripeClass,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { WorkspaceDetailsLiveMessage } from "@/components/shared/WorkspaceDetailsStack";
import type { AgentRunLogTimelineRow } from "@/lib/agent-runs/agent-run-log-format";
import { formatAgentRunTimeOnly } from "@/lib/edmonton-time";
import {
  isWorkspaceTaskTerminal,
  type WorkspaceTask,
} from "@/lib/task-manager/types";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

type TaskManagerDetailsDrawerProps = {
  task: WorkspaceTask;
  siteLabel: string;
  onOpenStudio: () => void;
};

function timelineRowsForTask(task: WorkspaceTask, siteLabel: string): AgentRunLogTimelineRow[] {
  const rows: AgentRunLogTimelineRow[] = [];
  const started = formatAgentRunTimeOnly(new Date(task.createdAt).toISOString());
  const updated = formatAgentRunTimeOnly(new Date(task.updatedAt).toISOString());
  const terminal = isWorkspaceTaskTerminal(task.status);
  const pct =
    typeof task.progress === "number" && Number.isFinite(task.progress)
      ? `${Math.round(task.progress)}%`
      : null;

  rows.push({
    key: `${task.id}-started`,
    timeLabel: started,
    label: siteLabel ? `Started · ${siteLabel}` : "Started",
    status: "done",
  });

  if (task.restore?.sitemapSource) {
    rows.push({
      key: `${task.id}-source`,
      timeLabel: started,
      label: `Source: ${task.restore.sitemapSource}`,
      status: "done",
    });
  }

  const logged = (task.logLines ?? []).filter((line) => line.trim().length > 0);
  if (logged.length > 0) {
    logged.forEach((line, index) => {
      rows.push({
        key: `${task.id}-log-${index}`,
        timeLabel: updated,
        label: line,
        status: line.toLowerCase().includes("fail") || line.toLowerCase().includes("not confirmed") ? "error" : "done",
      });
    });
  } else if (task.step?.trim() || pct) {
    rows.push({
      key: `${task.id}-step`,
      timeLabel: updated,
      label: task.step?.trim() || pct || "",
      status: terminal ? (task.status === "done" ? "done" : "error") : "running",
      isActive: !terminal,
    });
  }

  if (task.status === "done") {
    rows.push({
      key: `${task.id}-done`,
      timeLabel: updated,
      label: "Completed",
      status: "done",
    });
  } else if (task.status === "cancelled") {
    rows.push({
      key: `${task.id}-cancelled`,
      timeLabel: updated,
      label: task.errorMessage?.trim() || "Cancelled",
      status: "error",
    });
  } else if (task.status === "error") {
    rows.push({
      key: `${task.id}-error`,
      timeLabel: updated,
      label: task.errorMessage?.trim() || "Failed",
      status: "error",
    });
  }

  return rows;
}

/** Agents-style drawer: current post + inline Studio button, then progress log. */
export function TaskManagerDetailsDrawer({
  task,
  siteLabel,
  onOpenStudio,
}: TaskManagerDetailsDrawerProps) {
  const isRunning = task.status === "running";
  const showError = Boolean(task.errorMessage?.trim()) && task.status === "error";
  let stripeIndex = 0;
  const rows = timelineRowsForTask(task, siteLabel);
  const currentUrl = task.currentUrl?.trim() || "";
  const currentLabel = task.currentTitle?.trim() || currentUrl;

  return (
    <div className={CONTENT_OPTIMIZER_MULTI_SITE_ROW_STACK_CLASS}>
      {showError ? (
        <WorkspaceDetailsLiveMessage message={task.errorMessage!.trim()} stripeIndex={stripeIndex++} />
      ) : null}

      {currentUrl ? (
        <div
          className={cn(
            contentOptimizerRowStripeClass(stripeIndex++, { isActiveOptimize: isRunning }),
            isRunning && CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS,
          )}
        >
          <div className="flex min-h-[2.75rem] w-full flex-row items-center gap-2 border-0 px-2.5 py-2 sm:px-3">
            <a
              href={currentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "min-w-0 flex-1 truncate text-base font-semibold underline",
                isRunning
                  ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS
                  : "text-semantic-analysis-foreground hover:text-semantic-analysis-foreground",
              )}
              onClick={(e) => e.stopPropagation()}
              title={currentLabel}
            >
              {currentLabel}
            </a>
            <Button
              type="button"
              className="shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onOpenStudio();
              }}
            >
              Open studio
            </Button>
          </div>
        </div>
      ) : null}

      <div className={contentOptimizerRowStripeClass(stripeIndex++)}>
        <div className="border-0 py-1 px-2.5 sm:px-3">
          <AgentRunProgressLog rows={rows} withSeparators />
        </div>
      </div>
    </div>
  );
}
