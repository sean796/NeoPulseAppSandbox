import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

import { formatEdmontonCalendarTooltip } from "@/lib/edmonton-time";
import { cn } from "@/lib/utils";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@/ui";

type PulseAssistClockProps = {
  className?: string;
};

export function PulseAssistClock({ className }: PulseAssistClockProps) {
  const [tooltip, setTooltip] = useState(() => formatEdmontonCalendarTooltip());

  useEffect(() => {
    setTooltip(formatEdmontonCalendarTooltip());
    const id = window.setInterval(() => setTooltip(formatEdmontonCalendarTooltip()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("inline-flex", className)}>
          <Button size="icon" icon={Clock} variant="tool" aria-label={tooltip} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-none text-base">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
