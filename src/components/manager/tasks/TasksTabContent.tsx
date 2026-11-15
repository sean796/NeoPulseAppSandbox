import React from "react";
import { TasksShell } from "@/components/manager/tasks/TasksShell";

export function TasksTabContent(): React.ReactElement {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <TasksShell />
    </div>
  );
}
