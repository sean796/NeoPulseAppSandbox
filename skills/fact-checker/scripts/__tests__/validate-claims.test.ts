import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCountResult } from "../lib/build-count.mjs";
import { validateClaimsDoc } from "../lib/validate-claims.mjs";

const skillRoot = path.resolve(__dirname, "../..");
const scriptsRoot = path.join(skillRoot, "scripts");

function runScript(script: string, args: string[]) {
  return spawnSync(process.execPath, [path.join(scriptsRoot, script), ...args], {
    encoding: "utf8",
    cwd: path.resolve(skillRoot, "../.."),
  });
}

describe("fact-checker scripts", () => {
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

  it("validate-claims --help prints usage", () => {
    const result = runScript("validate-claims.mjs", ["--help"]);
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

  it("validateClaimsDoc accepts an empty claims list", () => {
    const result = validateClaimsDoc({ claims: [] });
    expect(result.ok).toBe(true);
  });

  it("validateClaimsDoc rejects supported claims without a source URL", () => {
    const result = validateClaimsDoc({
      claims: [
        {
          pageId: 10,
          quote: "Duette cellular shades insulate windows.",
          category: "energy",
          verdict: "supported",
          sourceUrl: "",
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.includes("sourceUrl"))).toBe(true);
    }
  });

  it("validate-claims script exits 5 on bad verdict", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fact-checker-"));
    const claimsPath = path.join(dir, "claims.json");
    fs.writeFileSync(
      claimsPath,
      JSON.stringify({
        claims: [
          {
            pageId: 1,
            quote: "x",
            category: "energy",
            verdict: "maybe",
          },
        ],
      }),
    );
    const result = runScript("validate-claims.mjs", ["--claims", claimsPath]);
    expect(result.status).toBe(5);
  });
});
