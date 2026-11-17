import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateLinkPlan } from "../lib/validate-plan.mjs";
import { isUtilityPageUrl } from "../lib/utility-pages.mjs";

const skillRoot = path.resolve(__dirname, "../..");
const scriptsRoot = path.join(skillRoot, "scripts");

function runScript(script: string, args: string[]) {
  return spawnSync(process.execPath, [path.join(scriptsRoot, script), ...args], {
    encoding: "utf8",
    cwd: path.resolve(skillRoot, "../.."),
  });
}

const inventory = {
  moneyUrls: [
    "https://example.com/window-treatments/",
    "https://example.com/motorized-blinds/",
  ],
  blogUrls: [
    "https://example.com/blog/how-to-measure/",
    "https://example.com/blog/shade-styles/",
  ],
};

describe("money-page-internal-links scripts", () => {
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

  it("validate-plan rejects bad plan", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "money-links-"));
    const inventoryPath = path.join(dir, "inventory.json");
    const planPath = path.join(dir, "plan.json");
    fs.writeFileSync(inventoryPath, JSON.stringify(inventory));
    fs.writeFileSync(
      planPath,
      JSON.stringify({
        links: [
          {
            moneyUrl: inventory.moneyUrls[0],
            targetUrl: "https://example.com/blog/unknown/",
            anchorText: "window treatments",
          },
        ],
      }),
    );
    const result = runScript("validate-plan.mjs", [
      "--inventory",
      inventoryPath,
      "--plan",
      planPath,
    ]);
    expect(result.status).toBe(5);
    expect(result.stderr).toContain("targetUrl");
  });

  it("execute without dry-run or confirm exits 2", () => {
    const result = runScript("execute.mjs", []);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("--dry-run or --confirm");
  });

  it("isUtilityPageUrl flags hubs and legal pages", () => {
    expect(isUtilityPageUrl("https://example.com/contact/")).toBe(true);
    expect(isUtilityPageUrl("https://example.com/blog/")).toBe(true);
    expect(isUtilityPageUrl("https://example.com/privacy-policy/")).toBe(true);
    expect(isUtilityPageUrl("https://example.com/service-area/")).toBe(true);
    expect(isUtilityPageUrl("https://example.com/blog/my-post/")).toBe(false);
    expect(isUtilityPageUrl("https://example.com/window-treatments/")).toBe(false);
  });

  it("validateLinkPlan accepts a valid top-down plan", () => {
    const plan = {
      links: [
        {
          moneyUrl: inventory.moneyUrls[0],
          targetUrl: inventory.blogUrls[0],
          anchorText: "how to measure blinds",
        },
        {
          moneyUrl: inventory.moneyUrls[0],
          targetUrl: inventory.moneyUrls[1],
          anchorText: "motorized blinds",
        },
      ],
    };
    expect(validateLinkPlan(plan, inventory)).toEqual({ ok: true });
  });

  it("validateLinkPlan rejects duplicate pairs", () => {
    const plan = {
      links: [
        {
          moneyUrl: inventory.moneyUrls[0],
          targetUrl: inventory.blogUrls[0],
          anchorText: "a",
        },
        {
          moneyUrl: inventory.moneyUrls[0],
          targetUrl: inventory.blogUrls[0],
          anchorText: "b",
        },
      ],
    };
    const result = validateLinkPlan(plan, inventory);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("duplicate");
    }
  });
});
