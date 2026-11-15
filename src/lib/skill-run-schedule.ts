/** When an assigned skill runs. America/Edmonton. Same shape for every skill. */

export const SKILL_RUN_INTERVALS = [1, 2, 4, 6, 12, 24] as const;

export type SkillRunIntervalHours = (typeof SKILL_RUN_INTERVALS)[number];

export const SKILL_RUN_CADENCES = ["hourly", "daily", "weekly", "monthly"] as const;

export type SkillRunCadence = (typeof SKILL_RUN_CADENCES)[number];

/** Top menu: Time (clock), Daily (every N hours), Weekly, Monthly. */
export const SKILL_RUN_MENU_CADENCES = ["time", "daily", "weekly", "monthly"] as const;

export type SkillRunMenuCadence = (typeof SKILL_RUN_MENU_CADENCES)[number];

export type SkillRunSchedule = {
  cadence: SkillRunCadence;
  /** Step between runs when cadence is hourly. 24 for once-a-day and other cadences. */
  intervalHours: SkillRunIntervalHours;
  /** HH:mm. Used for once-a-day, weekly, and monthly. Ignored for hourly (slots from midnight). */
  time: string;
  /** 0 Sunday through 6 Saturday. Weekly only. */
  dayOfWeek: number | null;
  /** 1–31. Monthly only. Short months use the last day. */
  dayOfMonth: number | null;
  lastRunKey?: string;
};

export const DEFAULT_SKILL_RUN_TIME = "07:00";

/** Monday-first labels. Value matches DateTime "w" (0 = Sunday). */
export const SKILL_RUN_WEEKDAYS = [
  { value: 1, short: "Mon", label: "Mondays" },
  { value: 2, short: "Tue", label: "Tuesdays" },
  { value: 3, short: "Wed", label: "Wednesdays" },
  { value: 4, short: "Thu", label: "Thursdays" },
  { value: 5, short: "Fri", label: "Fridays" },
  { value: 6, short: "Sat", label: "Saturdays" },
  { value: 0, short: "Sun", label: "Sundays" },
] as const;

export const SKILL_RUN_CADENCE_OPTIONS: { value: SkillRunMenuCadence; label: string }[] = [
  { value: "time", label: "Time" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export function defaultSkillRunSchedule(): SkillRunSchedule {
  return {
    cadence: "daily",
    intervalHours: 24,
    time: DEFAULT_SKILL_RUN_TIME,
    dayOfWeek: null,
    dayOfMonth: null,
  };
}

/** Top menu value. Hourly is Daily; once-a-day clock is Time. */
export function skillRunMenuCadence(schedule: SkillRunSchedule): SkillRunMenuCadence {
  if (schedule.cadence === "weekly" || schedule.cadence === "monthly") return schedule.cadence;
  if (schedule.cadence === "hourly") return "daily";
  return "time";
}

export function skillRunDailyIntervalValue(schedule: SkillRunSchedule): string {
  if (schedule.cadence === "hourly") return String(schedule.intervalHours);
  return "24";
}

export function skillRunWeekdayValue(schedule: SkillRunSchedule): string {
  return String(schedule.dayOfWeek ?? 1);
}

export function skillRunScheduleFromMenuCadence(
  menu: SkillRunMenuCadence,
  current: SkillRunSchedule,
): SkillRunSchedule {
  const time = current.time;
  const lastRunKey = current.lastRunKey;
  if (menu === "weekly") {
    return readSkillRunSchedule({
      cadence: "weekly",
      intervalHours: 24,
      time,
      dayOfWeek: current.dayOfWeek ?? 1,
      dayOfMonth: null,
      lastRunKey,
    });
  }
  if (menu === "monthly") {
    return readSkillRunSchedule({
      cadence: "monthly",
      intervalHours: 24,
      time,
      dayOfWeek: null,
      dayOfMonth: current.dayOfMonth ?? 1,
      lastRunKey,
    });
  }
  if (menu === "daily") {
    const hours =
      current.cadence === "hourly" && current.intervalHours < 24 ? current.intervalHours : 1;
    return readSkillRunSchedule({
      cadence: "hourly",
      intervalHours: hours,
      time,
      dayOfWeek: null,
      dayOfMonth: null,
      lastRunKey,
    });
  }
  return readSkillRunSchedule({
    cadence: "daily",
    intervalHours: 24,
    time,
    dayOfWeek: null,
    dayOfMonth: null,
    lastRunKey,
  });
}

export function skillRunScheduleFromDailyInterval(
  hoursRaw: string,
  current: SkillRunSchedule,
): SkillRunSchedule {
  const hours = Number(hoursRaw) as SkillRunIntervalHours;
  if (!SKILL_RUN_INTERVALS.includes(hours)) return readSkillRunSchedule(current);
  if (hours === 24) {
    return readSkillRunSchedule({
      cadence: "daily",
      intervalHours: 24,
      time: current.time,
      dayOfWeek: null,
      dayOfMonth: null,
      lastRunKey: current.lastRunKey,
    });
  }
  return readSkillRunSchedule({
    cadence: "hourly",
    intervalHours: hours,
    time: current.time,
    dayOfWeek: null,
    dayOfMonth: null,
    lastRunKey: current.lastRunKey,
  });
}

export function skillRunScheduleFromWeekday(dayRaw: string, current: SkillRunSchedule): SkillRunSchedule {
  const day = Number(dayRaw);
  if (!Number.isInteger(day) || day < 0 || day > 6) return readSkillRunSchedule(current);
  return readSkillRunSchedule({
    cadence: "weekly",
    intervalHours: 24,
    time: current.time,
    dayOfWeek: day,
    dayOfMonth: null,
    lastRunKey: current.lastRunKey,
  });
}

export function skillRunSummary(schedule: SkillRunSchedule): string {
  const clock = formatSkillRunClock(schedule.time);
  if (schedule.cadence === "hourly") {
    return schedule.intervalHours === 1 ? "Every hour" : `Every ${schedule.intervalHours} hours`;
  }
  if (schedule.cadence === "weekly") {
    const day = SKILL_RUN_WEEKDAYS.find((item) => item.value === schedule.dayOfWeek);
    return `${day?.label ?? "Mondays"} at ${clock}`;
  }
  if (schedule.cadence === "monthly") {
    return `Monthly on the ${ordinal(schedule.dayOfMonth ?? 1)} at ${clock}`;
  }
  return `At ${clock}`;
}

export function readSkillRunSchedule(raw: SkillRunSchedule | undefined): SkillRunSchedule {
  const base = defaultSkillRunSchedule();
  if (!raw) return base;
  const interval = SKILL_RUN_INTERVALS.find((hours) => hours === raw.intervalHours) ?? base.intervalHours;
  const time = readClock(raw.time, base.time);
  const dayOfMonth = readDayOfMonth(raw.dayOfMonth);
  const dayOfWeek = readDayOfWeek(raw.dayOfWeek);
  const cadence = resolveCadence(raw.cadence, interval, dayOfMonth);
  const lastRunKey = raw.lastRunKey;
  if (cadence === "hourly") {
    return {
      cadence,
      intervalHours: interval < 24 ? interval : 1,
      time,
      dayOfWeek: null,
      dayOfMonth: null,
      lastRunKey,
    };
  }
  if (cadence === "weekly") {
    return {
      cadence,
      intervalHours: 24,
      time,
      dayOfWeek: dayOfWeek ?? 1,
      dayOfMonth: null,
      lastRunKey,
    };
  }
  if (cadence === "monthly") {
    return {
      cadence,
      intervalHours: 24,
      time,
      dayOfWeek: null,
      dayOfMonth: dayOfMonth ?? 1,
      lastRunKey,
    };
  }
  return {
    cadence: "daily",
    intervalHours: 24,
    time,
    dayOfWeek: null,
    dayOfMonth: null,
    lastRunKey,
  };
}

function resolveCadence(
  stored: SkillRunSchedule["cadence"] | undefined,
  interval: SkillRunIntervalHours,
  dayOfMonth: number | null,
): SkillRunCadence {
  if (stored === "hourly" || stored === "weekly" || stored === "monthly") return stored;
  if (dayOfMonth != null) return "monthly";
  if (interval < 24) return "hourly";
  return "daily";
}

function readClock(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const head = value.slice(0, 5);
  return /^\d{2}:\d{2}$/.test(head) ? head : fallback;
}

function readDayOfMonth(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 31) return null;
  return value;
}

function readDayOfWeek(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 6) return null;
  return value;
}

function formatSkillRunClock(time: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hour = Number(match[1]);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${match[2]} ${suffix}`;
}

function ordinal(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  const mod10 = day % 10;
  if (mod10 === 1) return `${day}st`;
  if (mod10 === 2) return `${day}nd`;
  if (mod10 === 3) return `${day}rd`;
  return `${day}th`;
}
