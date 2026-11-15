import { describe, expect, it } from "vitest";
import {
  readSkillRunSchedule,
  skillRunDailyIntervalValue,
  skillRunMenuCadence,
  skillRunScheduleFromDailyInterval,
  skillRunScheduleFromMenuCadence,
  skillRunScheduleFromWeekday,
  skillRunSummary,
  type SkillRunSchedule,
} from "../skill-run-schedule";

const atTime: SkillRunSchedule = {
  cadence: "daily",
  intervalHours: 24,
  time: "07:00",
  dayOfWeek: null,
  dayOfMonth: null,
};

describe("readSkillRunSchedule", () => {
  it("defaults a missing schedule to once at 07:00", () => {
    expect(readSkillRunSchedule(undefined)).toEqual(atTime);
    expect(skillRunMenuCadence(readSkillRunSchedule(undefined))).toBe("time");
  });

  it("treats a saved day of month on the old daily cadence as monthly", () => {
    const next = readSkillRunSchedule({
      cadence: "daily",
      intervalHours: 24,
      time: "07:00",
      dayOfWeek: null,
      dayOfMonth: 17,
    });
    expect(next.cadence).toBe("monthly");
    expect(next.dayOfMonth).toBe(17);
    expect(skillRunMenuCadence(next)).toBe("monthly");
    expect(skillRunSummary(next)).toBe("Monthly on the 17th at 7:00 AM");
  });

  it("treats an interval under 24 hours as Daily hours", () => {
    const next = readSkillRunSchedule({
      cadence: "daily",
      intervalHours: 2,
      time: "07:00",
      dayOfWeek: null,
      dayOfMonth: null,
    });
    expect(next.cadence).toBe("hourly");
    expect(skillRunMenuCadence(next)).toBe("daily");
    expect(skillRunDailyIntervalValue(next)).toBe("2");
    expect(skillRunSummary(next)).toBe("Every 2 hours");
  });

  it("keeps Sunday as a real weekday", () => {
    const next = readSkillRunSchedule({
      cadence: "weekly",
      intervalHours: 24,
      time: "15:30",
      dayOfWeek: 0,
      dayOfMonth: null,
    });
    expect(next.dayOfWeek).toBe(0);
    expect(skillRunSummary(next)).toBe("Sundays at 3:30 PM");
  });
});

describe("one-menu schedule writers", () => {
  it("maps Time, Daily, Weekly, and Monthly as separate menu values", () => {
    expect(skillRunMenuCadence(skillRunScheduleFromMenuCadence("time", atTime))).toBe("time");
    expect(skillRunMenuCadence(skillRunScheduleFromMenuCadence("daily", atTime))).toBe("daily");
    expect(skillRunMenuCadence(skillRunScheduleFromMenuCadence("weekly", atTime))).toBe("weekly");
    expect(skillRunMenuCadence(skillRunScheduleFromMenuCadence("monthly", atTime))).toBe("monthly");
  });

  it("switches menus without leftover day fields", () => {
    const weekly = skillRunScheduleFromMenuCadence("weekly", atTime);
    expect(weekly.cadence).toBe("weekly");
    expect(weekly.dayOfWeek).toBe(1);
    const back = skillRunScheduleFromMenuCadence("time", weekly);
    expect(back).toMatchObject({ cadence: "daily", dayOfWeek: null, dayOfMonth: null, intervalHours: 24 });
    expect(skillRunSummary(back)).toBe("At 7:00 AM");
  });

  it("sets every-N-hours on Daily and clock time on Time", () => {
    const everyTwo = skillRunScheduleFromDailyInterval("2", atTime);
    expect(everyTwo.cadence).toBe("hourly");
    expect(skillRunMenuCadence(everyTwo)).toBe("daily");
    expect(skillRunSummary(everyTwo)).toBe("Every 2 hours");
    const once = skillRunScheduleFromMenuCadence("time", everyTwo);
    expect(once.cadence).toBe("daily");
    expect(skillRunSummary(once)).toBe("At 7:00 AM");
  });

  it("picks a weekday from the weekly menu", () => {
    const sunday = skillRunScheduleFromWeekday("0", skillRunScheduleFromMenuCadence("weekly", atTime));
    expect(sunday.dayOfWeek).toBe(0);
    expect(skillRunSummary(sunday)).toBe("Sundays at 7:00 AM");
  });

  it("uses the 1st when monthly has no day yet", () => {
    const monthly = skillRunScheduleFromMenuCadence("monthly", atTime);
    expect(monthly.dayOfMonth).toBe(1);
    expect(skillRunSummary(monthly)).toBe("Monthly on the 1st at 7:00 AM");
  });
});
