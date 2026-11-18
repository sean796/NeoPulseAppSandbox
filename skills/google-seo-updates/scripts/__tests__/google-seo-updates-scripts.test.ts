import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateArchiveEntry } from "../lib/validate-entry.mjs";

const skillRoot = path.resolve(__dirname, "../..");
const scriptsRoot = path.join(skillRoot, "scripts");

function runScript(script: string, args: string[]) {
  return spawnSync(process.execPath, [path.join(scriptsRoot, script), ...args], {
    encoding: "utf8",
    cwd: path.resolve(skillRoot, "../.."),
  });
}

describe("google-seo-updates scripts", () => {
  it("validate-archive --help prints usage and exit codes", () => {
    const result = runScript("validate-archive.mjs", ["--help"]);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("Usage:");
    expect(result.stderr).toContain("Exit codes:");
  });

  it("validate-archive without --entry exits 2", () => {
    const result = runScript("validate-archive.mjs", []);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--entry is required");
  });

  it("run without dry-run or confirm exits 2", () => {
    const result = runScript("run.mjs", []);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--dry-run or --confirm");
  });

  it("run --dry-run prints generate payload", () => {
    const result = runScript("run.mjs", ["--dry-run"]);
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.ok).toBe(true);
    expect(payload.dryRun).toBe(true);
    expect(payload.payload.action).toBe("generate");
  });

  it("validateArchiveEntry accepts a dated entry with empty items", () => {
    const result = validateArchiveEntry({
      id: "2026-11-18-abc",
      date: "2026-11-18",
      title: "No new major SEO changes",
      sourcesChecked: [
        "https://developers.google.com/search/blog",
        "https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history",
      ],
      items: [],
    });
    expect(result.ok).toBe(true);
  });

  it("validateArchiveEntry rejects a bad date", () => {
    const result = validateArchiveEntry({
      id: "x",
      date: "11/18/2026",
      title: "Bad",
      sourcesChecked: ["https://developers.google.com/search/blog"],
      items: [],
    });
    expect(result.ok).toBe(false);
  });

  it("validate-archive accepts a good entry file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "google-seo-"));
    const entryPath = path.join(dir, "entry.json");
    fs.writeFileSync(
      entryPath,
      JSON.stringify({
        id: "2026-11-18-abc",
        date: "2026-11-18",
        title: "Search Central week",
        sourcesChecked: [
          "https://developers.google.com/search/blog",
          "https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history",
        ],
        items: [
          {
            publishedAt: "2026-11-10",
            sourceUrl: "https://developers.google.com/search/blog/2026/11/example",
            title: "Example update",
            whatChanged: "Clarified helpful content for blogs.",
            postRule: "Lead with the searcher answer in the first paragraph.",
          },
        ],
      }),
    );
    const result = runScript("validate-archive.mjs", ["--entry", entryPath]);
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.ok).toBe(true);
  });
});
