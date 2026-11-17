import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCountResult } from "../lib/build-count.mjs";
import { validateFindingsDoc } from "../lib/validate-findings.mjs";

const skillRoot = path.resolve(__dirname, "../..");
const scriptsRoot = path.join(skillRoot, "scripts");

function runScript(script: string, args: string[]) {
  return spawnSync(process.execPath, [path.join(scriptsRoot, script), ...args], {
    encoding: "utf8",
    cwd: path.resolve(skillRoot, "../.."),
  });
}

describe("editorial-content-audit scripts", () => {
  it("count --help prints usage and exit codes", () => {
    const result = runScript("count.mjs", ["--help"]);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("Usage:");
    expect(result.stderr).toContain("Exit codes:");
  });

  it("count without --inventory exits 2", () => {
    const result = runScript("count.mjs", []);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--inventory is required");
  });

  it("validate-findings --help prints usage", () => {
    const result = runScript("validate-findings.mjs", ["--help"]);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("Usage:");
  });

  it("buildCountResult counts posts and entities", () => {
    const result = buildCountResult({
      pages: [
        { id: 1, type: "post", title: "A", url: "https://example.com/a", status: "publish" },
        { id: 2, type: "service-area", title: "B", url: "https://example.com/b", status: "future" },
        { id: 3, type: "service-area", title: "C", url: "https://example.com/c", status: "draft" },
      ],
    });
    expect(result.postCount).toBe(1);
    expect(result.entityCount).toBe(2);
    expect(result.pageCount).toBe(3);
    expect(result.goalMet).toBe(false);
  });

  it("buildCountResult marks empty inventory as goalMet", () => {
    const result = buildCountResult({ pages: [] });
    expect(result.pageCount).toBe(0);
    expect(result.goalMet).toBe(true);
  });

  it("validateFindingsDoc accepts a clean page list", () => {
    const result = validateFindingsDoc({ findings: [] });
    expect(result.ok).toBe(true);
  });

  it("validateFindingsDoc rejects empty quotes", () => {
    const result = validateFindingsDoc({
      findings: [
        {
          pageId: 10,
          severity: "high",
          certainty: "proven",
          quote: "   ",
          problem: "Wrong phone",
          fix: "Use the NAP phone",
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("quote"))).toBe(true);
    }
  });

  it("validate-findings script exits 5 on bad JSON shape", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "editorial-audit-"));
    const findingsPath = path.join(dir, "findings.json");
    fs.writeFileSync(
      findingsPath,
      JSON.stringify({
        findings: [
          {
            pageId: 1,
            severity: "critical",
            certainty: "proven",
            quote: "x",
            problem: "y",
            fix: "z",
          },
        ],
      }),
    );
    const result = runScript("validate-findings.mjs", ["--findings", findingsPath]);
    expect(result.status).toBe(5);
  });
});
