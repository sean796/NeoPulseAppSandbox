import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCount } from "../lib/build-count.mjs";
import { validateMap } from "../lib/validate-map.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function runNode(script: string, args: string[]) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
  });
  return {
    status: result.status ?? 1,
    stdout: String(result.stdout ?? ""),
    stderr: String(result.stderr ?? ""),
  };
}

describe("cannibalization-audit scripts", () => {
  it("count --help prints usage", () => {
    const result = runNode("skills/cannibalization-audit/scripts/count.mjs", ["--help"]);
    expect(result.status).toBe(0);
    expect(result.stderr + result.stdout).toContain("Usage:");
    expect(result.stderr + result.stdout).toContain("Exit codes:");
  });

  it("count without --inventory exits 2", () => {
    const result = runNode("skills/cannibalization-audit/scripts/count.mjs", []);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--inventory is required");
  });

  it("buildCount keeps published blog posts only", () => {
    const count = buildCount({
      siteId: "wp-1",
      pages: [
        { id: 1, url: "https://example.com/blog/a/", title: "A", status: "publish", type: "post" },
        { id: 2, url: "https://example.com/service-area/x/", title: "X", status: "publish", type: "service-area" },
        { id: 3, url: "https://example.com/blog/b/", title: "B", status: "draft", type: "post" },
      ],
    });
    expect(count.pageCount).toBe(1);
    expect(count.pages[0]?.url).toContain("/blog/a/");
  });

  it("validateMap accepts a good map and rejects a bad reason", () => {
    const good = validateMap({
      siteId: "wp-1",
      windowDays: 90,
      redirects: [
        {
          from: "https://example.com/blog/a/",
          to: "https://example.com/blog/b/",
          reason: "overlap",
          ageDays: 200,
          clicks90d: 2,
          foldIn: "Power source note",
        },
      ],
      leave: [{ url: "https://example.com/blog/c/", why: "young" }],
    });
    expect(good.ok).toBe(true);

    const bad = validateMap({
      siteId: "wp-1",
      windowDays: 90,
      redirects: [
        {
          from: "https://example.com/blog/a/",
          to: "https://example.com/blog/b/",
          reason: "guess",
          ageDays: 200,
          clicks90d: 2,
          foldIn: "",
        },
      ],
      leave: [],
    });
    expect(bad.ok).toBe(false);
  });

  it("validateMap rejects a redirect chain", () => {
    const chained = validateMap({
      siteId: "wp-1",
      windowDays: 90,
      redirects: [
        {
          from: "https://example.com/blog/roman-shades-cost/",
          to: "https://example.com/blog/roman-shades/",
          reason: "overlap",
          ageDays: 200,
          clicks90d: 2,
          foldIn: "Cost note",
        },
        {
          from: "https://example.com/blog/roman-shades/",
          to: "https://example.com/blog/roman-shade/",
          reason: "overlap",
          ageDays: 400,
          clicks90d: 8,
          foldIn: "Style note",
        },
      ],
      leave: [],
    });
    expect(chained.ok).toBe(false);
  });
});
