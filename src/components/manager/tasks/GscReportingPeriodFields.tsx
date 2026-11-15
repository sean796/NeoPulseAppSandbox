import React, { useEffect, useState } from "react";
import {
  computeTrailingFullMonthsCompareRanges,
  formatGscComparePeriodLabel,
  parseTrailingMonthCount,
  TRAILING_MONTH_COUNT_MAX,
  TRAILING_MONTH_COUNT_MIN,
} from "@/lib/gsc-reporting/gsc-fetch-date-presets";
import {
  payloadForGscTrailingMonthCount,
  resolveGscTrailingMonthCount,
} from "@/lib/gsc-reporting/resolve-gsc-reporting-run-config";
import type { TaskExecutionPayload } from "@/lib/tasks-types";
import { Field } from "@/ui";

export type GscReportingPeriodFieldsProps = {
  executionPayload?: TaskExecutionPayload | null;
  disabled?: boolean;
  onChange: (payload: TaskExecutionPayload) => void;
};

export function GscReportingPeriodFields({
  executionPayload,
  disabled = false,
  onChange,
}: GscReportingPeriodFieldsProps): React.ReactElement {
  const payload = executionPayload ?? {};
  const monthCount = resolveGscTrailingMonthCount(payload);
  const [draft, setDraft] = useState(() => String(monthCount));

  useEffect(() => {
    setDraft(String(monthCount));
  }, [monthCount]);

  const ranges = computeTrailingFullMonthsCompareRanges(monthCount);
  const periodALabel = formatGscComparePeriodLabel(ranges.primary.startDate, ranges.primary.endDate);
  const periodBLabel = formatGscComparePeriodLabel(ranges.compare.startDate, ranges.compare.endDate);

  const setMonthCount = (raw: string) => {
    setDraft(raw);
    const parsed = parseTrailingMonthCount(raw);
    if (parsed == null) return;
    onChange({ ...payload, ...payloadForGscTrailingMonthCount(parsed) });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-8 min-h-8 items-center gap-2">
        <Field
          type="number"
          inputMode="numeric"
          min={TRAILING_MONTH_COUNT_MIN}
          max={TRAILING_MONTH_COUNT_MAX}
          step={1}
          placeholder="Months"
          aria-label="Months vs prior"
          disabled={disabled}
          value={draft}
          onChange={(event) => setMonthCount(event.target.value)}
        />
        <span className="min-w-0 break-words text-base text-muted-foreground">months vs prior</span>
      </div>
      <dl className="space-y-2 text-base">
        <div>
          <dt className="text-muted-foreground">Period A (current)</dt>
          <dd className="text-white tabular-nums">{periodALabel}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Period B (compare)</dt>
          <dd className="text-white tabular-nums">{periodBLabel}</dd>
        </div>
      </dl>
    </div>
  );
}
