import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const skillRoot = path.resolve(__dirname, "../..");
const scriptsRoot = path.join(skillRoot, "scripts");

function runScript(script: string, args: string[] = []) {
  return spawnSync(process.execPath, [path.join(scriptsRoot, script), ...args], {
    encoding: "utf8",
    cwd: path.resolve(skillRoot, "../.."),
  });
}

describe("window-treatments-vertical scripts", () => {
  it("show-prompt --help prints usage and exit codes", () => {
    const result = runScript("show-prompt.mjs", ["--help"]);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("Usage:");
    expect(result.stderr).toContain("Exit codes:");
  });

  it("show-prompt prints standing prompt JSON", () => {
    const result = runScript("show-prompt.mjs");
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.ok).toBe(true);
    expect(payload.skillId).toBe("vertical.window-treatments.guide");
    expect(payload.livePrompt).toContain("WINDOW TREATMENTS RULES");
    expect(payload.livePrompt).toContain("Blind Spot");
    expect(payload.livePrompt).toContain("Custom Shades of London");
  });
});
