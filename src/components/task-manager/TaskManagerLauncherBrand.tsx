import { ListTodo, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type TaskManagerLauncherBrandProps = {
  className?: string;
  hasRunning?: boolean;
  showDone?: boolean;
};

/** Black launcher tab: Tasks label + reserved status icon (zero CLS). */
export function TaskManagerLauncherBrand({
  className,
  hasRunning = false,
  showDone = false,
}: TaskManagerLauncherBrandProps) {
  return (
    <span className={cn("pulse-assist-launcher-brand", className)}>
      <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
        <ListTodo className="pulse-assist-launcher-brand__spark h-4 w-4" aria-hidden />
        {hasRunning ? (
          <Loader2
            className="absolute -right-1 -top-1 h-3 w-3 animate-spin text-black"
            aria-hidden
          />
        ) : showDone ? (
          <Check
            className="absolute -right-1 -top-1 h-3 w-3 text-black"
            aria-hidden
          />
        ) : null}
      </span>
      <span className="pulse-assist-launcher-brand__label">Tasks</span>
    </span>
  );
}
