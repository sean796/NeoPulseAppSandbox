import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCountResult } from "../lib/build-count.mjs";
import { lastAllowedDay, nextMonthKey } from "../lib/calendar.mjs";
import { validateSchedulePlan } from "../lib/validate-plan.mjs";
import { buildPostCreatorPayload, buildPostCreatorRunBody } from "../lib/build-payload.mjs";

const skillRoot = path.resolve(__dirname, "../..");
const scriptsRoot = path.join(skillRoot, "scripts");

function runScript(script: string, args: string[]) {
  return spawnSync(process.execPath, [path.join(scriptsRoot, script), ...args], {
    encoding: "utf8",
    cwd: path.resolve(skillRoot, "../.."),
  });
}

describe("posts-content-gap-check scripts", () => {
  it("count --help prints usage and exit codes", () => {
    const result = runScript("count.mjs", ["--help"]);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("Usage:");
    expect(result.stderr).toContain("Exit codes:");
  });

  it("count without --site-id exits 2", () => {
    const result = runScript("count.mjs", []);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--site-id is required");
  });

  it("validate-schedule --help prints usage", () => {
    const result = runScript("validate-schedule.mjs", ["--help"]);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("Usage:");
  });

  it("execute without dry-run or confirm exits 2", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "posts-gap-"));
    const countPath = path.join(dir, "count.json");
    const planPath = path.join(dir, "plan.json");
    fs.writeFileSync(
      countPath,
      JSON.stringify({
        gap: 1,
        goalMet: false,
        month: "2026-12",
        lastAllowedDay: "2026-12-26",
        occupiedDates: [],
      }),
    );
    fs.writeFileSync(
      planPath,
      JSON.stringify({ publishDates: ["2026-12-10"], publishTime: "09:00" }),
    );
    const result = runScript("execute.mjs", [
      "--site-id",
      "advance-blinds",
      "--count",
      countPath,
      "--plan",
      planPath,
    ]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--dry-run or --confirm");
  });

  it("buildCountResult marks filled month as goalMet", () => {
    const result = buildCountResult(
      { id: "advance-blinds", name: "Advance Blinds", editorialContentPackage: "lite" },
      { published: 1, scheduled: 0, occupiedDates: ["2026-12-05"] },
      "2026-12",
    );
    expect(result.quota).toBe(1);
    expect(result.current).toBe(1);
    expect(result.gap).toBe(0);
    expect(result.goalMet).toBe(true);
    expect(result.lastAllowedDay).toBe(lastAllowedDay("2026-12"));
  });

  it("buildCountResult computes a shortfall for Standard", () => {
    const result = buildCountResult(
      { id: "blind-magic", name: "Blind Magic", editorialContentPackage: "standard" },
      { published: 0, scheduled: 1, occupiedDates: ["2026-12-02"] },
      "2026-12",
    );
    expect(result.quota).toBe(2);
    expect(result.gap).toBe(1);
    expect(result.goalMet).toBe(false);
  });

  it("validateSchedulePlan rejects wrong length and occupied days", () => {
    const count = {
      gap: 2,
      month: "2026-12",
      lastAllowedDay: "2026-12-26",
      occupiedDates: ["2026-12-02"],
    };
    const bad = validateSchedulePlan(count, {
      publishDates: ["2026-12-02", "2026-12-31"],
      publishTime: "09:00",
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.some((e) => e.includes("occupied"))).toBe(true);
      expect(bad.errors.some((e) => e.includes("lastAllowedDay"))).toBe(true);
    }
  });

  it("validateSchedulePlan accepts a valid plan", () => {
    const count = {
      gap: 2,
      month: "2026-12",
      lastAllowedDay: "2026-12-26",
      occupiedDates: ["2026-12-02"],
    };
    const ok = validateSchedulePlan(count, {
      publishDates: ["2026-12-08", "2026-12-20"],
      publishTime: "09:00",
    });
    expect(ok.ok).toBe(true);
  });

  it("execute --dry-run prints payload without starting a task", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "posts-gap-"));
    const countPath = path.join(dir, "count.json");
    const planPath = path.join(dir, "plan.json");
    const count = {
      siteId: "advance-blinds",
      siteName: "Advance Blinds",
      month: "2026-12",
      published: 0,
      scheduled: 0,
      current: 0,
      quota: 1,
      gap: 1,
      goalMet: false,
      occupiedDates: [],
      lastAllowedDay: "2026-12-26",
      publishTimeHint: "09:00",
    };
    const plan = { publishDates: ["2026-12-10"], publishTime: "09:00" };
    fs.writeFileSync(countPath, JSON.stringify(count));
    fs.writeFileSync(planPath, JSON.stringify(plan));
    const result = runScript("execute.mjs", [
      "--site-id",
      "advance-blinds",
      "--count",
      countPath,
      "--plan",
      planPath,
      "--dry-run",
    ]);
    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.dryRun).toBe(true);
    expect(json.payload.postCount).toBe(1);
    expect(json.payload.keywordSource).toBe("gsc");
    expect(json.payload.scheduleCustomStartDate).toBe("2026-12-01");
  });

  it("execute exits 0 with created 0 when goalMet", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "posts-gap-"));
    const countPath = path.join(dir, "count.json");
    const planPath = path.join(dir, "plan.json");
    fs.writeFileSync(
      countPath,
      JSON.stringify({
        gap: 0,
        goalMet: true,
        month: "2026-12",
        lastAllowedDay: "2026-12-26",
        occupiedDates: [],
      }),
    );
    fs.writeFileSync(planPath, JSON.stringify({ publishDates: [], publishTime: "09:00" }));
    const result = runScript("execute.mjs", [
      "--site-id",
      "advance-blinds",
      "--count",
      countPath,
      "--plan",
      planPath,
      "--confirm",
    ]);
    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.goalMet).toBe(true);
    expect(json.created).toBe(0);
  });

  it("buildPostCreatorRunBody attaches the site for any client", () => {
    const body = buildPostCreatorRunBody({
      teamId: "1",
      site: {
        id: "site-a",
        name: "Example Co",
        siteUrl: "https://example.com",
        username: "editor",
        appPassword: "app-pass",
      },
      payload: { postCount: 1, keywordSource: "gsc" },
      title: "Posts content gap: Example Co",
    });
    expect(body.teamId).toBe(1);
    expect(body.context.siteId).toBe("site-a");
    expect(body.plan.site.siteUrl).toBe("https://example.com");
    expect(body.plan.site.appPassword).toBe("app-pass");
    expect(body.plan.executionPayload.wordpressSiteId).toBe("site-a");
    expect(body.plan.executionPayload.postCount).toBe(1);
  });

  it("buildPostCreatorPayload maps publish days", () => {
    const payload = buildPostCreatorPayload(
      { gap: 2, month: "2026-12" },
      { publishDates: ["2026-12-08", "2026-12-20"], publishTime: "03:00" },
    );
    expect(payload.schedulePublishDays).toEqual([8, 20]);
    expect(payload.scheduleStartTime).toBe("03:00");
    expect(payload.keywordSource).toBe("gsc");
  });

  it("nextMonthKey returns YYYY-MM", () => {
    expect(nextMonthKey(new Date("2026-11-14T12:00:00-07:00"))).toMatch(/^\d{4}-\d{2}$/);
  });
});
