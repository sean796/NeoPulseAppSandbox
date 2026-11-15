import { useEffect, useState, type ReactNode } from "react";
import { Clock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger, SelectField } from "@/ui";
import { UI_FIELD } from "@/ui/tokens";
import { cn } from "@/lib/utils";
import {
  readSkillRunSchedule,
  skillRunDailyIntervalValue,
  skillRunMenuCadence,
  skillRunScheduleFromDailyInterval,
  skillRunScheduleFromMenuCadence,
  skillRunScheduleFromWeekday,
  skillRunSummary,
  SKILL_RUN_CADENCE_OPTIONS,
  SKILL_RUN_INTERVALS,
  SKILL_RUN_WEEKDAYS,
  type SkillRunMenuCadence,
  type SkillRunSchedule,
} from "@/lib/skill-run-schedule";

const CLOCK_BTN_CLASS = cn(
  "inline-flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground",
  "hover:bg-primary hover:text-black",
  "data-[state=open]:bg-primary data-[state=open]:text-black",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

const DAY_NUMBERS = Array.from({ length: 31 }, (_, index) => index + 1);

const SLOT_BTN_CLASS = "h-full min-h-0 w-full text-base tabular-nums";

const EMPTY_CELL_CLASS = "h-full min-h-0 w-full bg-black";

const MONTH_SLOT_BTN_CLASS = "h-8 text-base tabular-nums";

const TIME_TILE_CLASS = cn(
  "h-full min-h-0 w-full rounded-none border-0 bg-black px-2 text-center text-base tabular-nums text-white",
  "placeholder:text-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

const ROW_TIME_INPUT_CLASS = cn(
  UI_FIELD,
  "h-8 w-11 shrink-0 px-1 text-center tabular-nums text-foreground",
  "placeholder:text-muted-foreground",
);

const PERIOD_OPTIONS = [
  { value: "AM", label: "AM" },
  { value: "PM", label: "PM" },
] as const;

const HOUR_CELLS = SKILL_RUN_INTERVALS.filter((hours) => hours < 24).map((hours) => ({
  value: String(hours),
  label: `${hours}h`,
  name: hours === 1 ? "Every hour" : `Every ${hours} hours`,
}));

type ClockParts = { hour12: number; minute: number; period: "AM" | "PM" };

function partsFromTime(time: string): ClockParts {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return { hour12: 7, minute: 0, period: "AM" };
  const hour24 = Number(match[1]);
  const minute = Number(match[2]);
  const period: "AM" | "PM" = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, minute, period };
}

function timeFromParts(parts: ClockParts): string {
  const hour12 = Math.min(12, Math.max(1, Math.floor(parts.hour12) || 12));
  const minute = Math.min(59, Math.max(0, Math.floor(parts.minute) || 0));
  let hour24 = hour12 % 12;
  if (parts.period === "PM") hour24 += 12;
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function OptionGrid({
  label,
  className,
  children,
}: {
  label: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid h-full gap-1", className)} role="group" aria-label={label}>
      {children}
    </div>
  );
}

function slotClass(selected: boolean, month = false): string {
  return cn(
    month ? MONTH_SLOT_BTN_CLASS : SLOT_BTN_CLASS,
    selected ? "bg-primary text-black" : "bg-black text-white hover:bg-white/10",
  );
}

function RowTimeControls({
  time,
  onChange,
  visible,
}: {
  time: string;
  onChange: (next: string) => void;
  visible: boolean;
}) {
  const parts = partsFromTime(time);
  const [hourDraft, setHourDraft] = useState(String(parts.hour12).padStart(2, "0"));
  const [minuteDraft, setMinuteDraft] = useState(String(parts.minute).padStart(2, "0"));

  useEffect(() => {
    const next = partsFromTime(time);
    setHourDraft(String(next.hour12).padStart(2, "0"));
    setMinuteDraft(String(next.minute).padStart(2, "0"));
  }, [time]);

  const commitParts = (patch: Partial<ClockParts>) => {
    onChange(timeFromParts({ ...parts, ...patch }));
  };

  return (
    <div
      className={cn("flex h-8 shrink-0 items-center gap-1", !visible && "invisible pointer-events-none")}
      aria-hidden={!visible}
    >
      <input
        type="text"
        inputMode="numeric"
        placeholder="HH"
        aria-label="Hour 01 to 12"
        tabIndex={visible ? undefined : -1}
        className={ROW_TIME_INPUT_CLASS}
        value={hourDraft}
        onChange={(event) => {
          const raw = event.target.value.replace(/\D/g, "").slice(0, 2);
          setHourDraft(raw);
          if (raw === "") return;
          const hour12 = Number(raw);
          if (hour12 >= 1 && hour12 <= 12) commitParts({ hour12 });
        }}
        onBlur={() => {
          const hour12 = Math.min(12, Math.max(1, Number(hourDraft) || parts.hour12));
          setHourDraft(String(hour12).padStart(2, "0"));
          commitParts({ hour12 });
        }}
      />
      <input
        type="text"
        inputMode="numeric"
        placeholder="MM"
        aria-label="Minute 00 to 59"
        tabIndex={visible ? undefined : -1}
        className={ROW_TIME_INPUT_CLASS}
        value={minuteDraft}
        onChange={(event) => {
          const raw = event.target.value.replace(/\D/g, "").slice(0, 2);
          setMinuteDraft(raw);
          if (raw === "") return;
          const minute = Number(raw);
          if (minute >= 0 && minute <= 59) commitParts({ minute });
        }}
        onBlur={() => {
          const minute = Math.min(59, Math.max(0, Number(minuteDraft) || 0));
          setMinuteDraft(String(minute).padStart(2, "0"));
          commitParts({ minute });
        }}
      />
      <SelectField
        placeholder="AM/PM"
        width="xs"
        value={parts.period}
        options={[...PERIOD_OPTIONS]}
        onValueChange={(value) => commitParts({ period: value === "PM" ? "PM" : "AM" })}
      />
    </div>
  );
}

function ClockTiles({
  time,
  onChange,
}: {
  time: string;
  onChange: (next: string) => void;
}) {
  const parts = partsFromTime(time);
  const [hourDraft, setHourDraft] = useState(String(parts.hour12).padStart(2, "0"));
  const [minuteDraft, setMinuteDraft] = useState(String(parts.minute).padStart(2, "0"));

  useEffect(() => {
    const next = partsFromTime(time);
    setHourDraft(String(next.hour12).padStart(2, "0"));
    setMinuteDraft(String(next.minute).padStart(2, "0"));
  }, [time]);

  const commitParts = (patch: Partial<ClockParts>) => {
    onChange(timeFromParts({ ...parts, ...patch }));
  };

  return (
    <OptionGrid label="Run time" className="grid-cols-2 grid-rows-2">
      <input
        type="text"
        inputMode="numeric"
        placeholder="Hour"
        aria-label="Hour 01 to 12"
        className={TIME_TILE_CLASS}
        value={hourDraft}
        onChange={(event) => {
          const raw = event.target.value.replace(/\D/g, "").slice(0, 2);
          setHourDraft(raw);
          if (raw === "") return;
          const hour12 = Number(raw);
          if (hour12 >= 1 && hour12 <= 12) commitParts({ hour12 });
        }}
        onBlur={() => {
          const hour12 = Math.min(12, Math.max(1, Number(hourDraft) || parts.hour12));
          setHourDraft(String(hour12).padStart(2, "0"));
          commitParts({ hour12 });
        }}
      />
      <input
        type="text"
        inputMode="numeric"
        placeholder="Minute"
        aria-label="Minute 00 to 59"
        className={TIME_TILE_CLASS}
        value={minuteDraft}
        onChange={(event) => {
          const raw = event.target.value.replace(/\D/g, "").slice(0, 2);
          setMinuteDraft(raw);
          if (raw === "") return;
          const minute = Number(raw);
          if (minute >= 0 && minute <= 59) commitParts({ minute });
        }}
        onBlur={() => {
          const minute = Math.min(59, Math.max(0, Number(minuteDraft) || 0));
          setMinuteDraft(String(minute).padStart(2, "0"));
          commitParts({ minute });
        }}
      />
      <button
        type="button"
        aria-pressed={parts.period === "AM"}
        aria-label="AM"
        className={slotClass(parts.period === "AM")}
        onClick={() => commitParts({ period: "AM" })}
      >
        AM
      </button>
      <button
        type="button"
        aria-pressed={parts.period === "PM"}
        aria-label="PM"
        className={slotClass(parts.period === "PM")}
        onClick={() => commitParts({ period: "PM" })}
      >
        PM
      </button>
    </OptionGrid>
  );
}

export function SkillRunClockButton({
  skillLabel,
  schedule,
  onScheduleChange,
}: {
  skillLabel: string;
  schedule?: SkillRunSchedule;
  onScheduleChange?: (next: SkillRunSchedule) => void;
}) {
  const saved = readSkillRunSchedule(schedule);
  const [draft, setDraft] = useState<SkillRunSchedule>(saved);

  useEffect(() => {
    setDraft(readSkillRunSchedule(schedule));
  }, [schedule]);

  const commit = (next: SkillRunSchedule) => {
    const normalized = readSkillRunSchedule({ ...next, lastRunKey: saved.lastRunKey });
    setDraft(normalized);
    onScheduleChange?.(normalized);
  };

  const summary = skillRunSummary(draft);
  const menu = skillRunMenuCadence(draft);
  const showRowTime = menu === "weekly" || menu === "monthly";
  const intervalValue = skillRunDailyIntervalValue(draft);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={CLOCK_BTN_CLASS}
          aria-label={`${skillLabel} schedule: ${summary}`}
          title={summary}
        >
          <Clock className="h-4 w-4 shrink-0" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(22rem,calc(100vw-2rem))] p-3" align="end">
        <p className="mb-2 text-base font-medium text-foreground">Run schedule</p>
        <div className="flex flex-col gap-2">
          <div className="flex h-8 items-center gap-2">
            <div className="min-w-0 flex-1">
              <SelectField
                placeholder="Cadence"
                width="full"
                value={menu}
                options={SKILL_RUN_CADENCE_OPTIONS}
                onValueChange={(value) =>
                  commit(skillRunScheduleFromMenuCadence(value as SkillRunMenuCadence, draft))
                }
              />
            </div>
            <RowTimeControls
              time={draft.time}
              visible={showRowTime}
              onChange={(time) => commit({ ...draft, time })}
            />
          </div>
          <div className="h-44 shrink-0">
            {menu === "time" ? (
              <ClockTiles time={draft.time} onChange={(time) => commit({ ...draft, time })} />
            ) : null}
            {menu === "daily" ? (
              <OptionGrid label="Run every" className="grid-cols-4 grid-rows-2">
                {HOUR_CELLS.map((cell) => {
                  const selected = intervalValue === cell.value;
                  return (
                    <button
                      key={cell.value}
                      type="button"
                      aria-pressed={selected}
                      aria-label={cell.name}
                      className={slotClass(selected)}
                      onClick={() => commit(skillRunScheduleFromDailyInterval(cell.value, draft))}
                    >
                      {cell.label}
                    </button>
                  );
                })}
                <span className={EMPTY_CELL_CLASS} aria-hidden />
                <span className={EMPTY_CELL_CLASS} aria-hidden />
                <span className={EMPTY_CELL_CLASS} aria-hidden />
              </OptionGrid>
            ) : null}
            {menu === "weekly" ? (
              <OptionGrid label="Weekday" className="grid-cols-4 grid-rows-2">
                {SKILL_RUN_WEEKDAYS.map((day) => {
                  const selected = draft.dayOfWeek === day.value;
                  return (
                    <button
                      key={day.value}
                      type="button"
                      aria-pressed={selected}
                      aria-label={day.label}
                      className={slotClass(selected)}
                      onClick={() => commit(skillRunScheduleFromWeekday(String(day.value), draft))}
                    >
                      {day.short}
                    </button>
                  );
                })}
                <span className={EMPTY_CELL_CLASS} aria-hidden />
              </OptionGrid>
            ) : null}
            {menu === "monthly" ? (
              <OptionGrid label="Day of month" className="grid-cols-7 content-start">
                {DAY_NUMBERS.map((day) => {
                  const selected = draft.dayOfMonth === day;
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={selected}
                      aria-label={`Day ${day}`}
                      className={slotClass(selected, true)}
                      onClick={() =>
                        commit({ ...draft, cadence: "monthly", dayOfMonth: day, dayOfWeek: null })
                      }
                    >
                      {day}
                    </button>
                  );
                })}
              </OptionGrid>
            ) : null}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
