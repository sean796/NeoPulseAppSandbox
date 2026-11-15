#!/usr/bin/env node
/**
 * Local Dominator setup for Forge Research grid export (local WP Staging).
 *
 * Usage:
 *   node scripts/setup-local-dominator.mjs
 *   node scripts/setup-local-dominator.mjs --smoke
 *   npm run setup:local-dominator
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const envExample = path.join(repoRoot, ".env.localdominator.example");
const envFile = path.join(repoRoot, ".env.localdominator");
const recipePath = path.join(
  repoRoot,
  "wordpress-plugins",
  "neo-pulse-app",
  "recipes",
  "research-local-dominator-grid-export.json",
);
const actionBlockPath = path.join(
  repoRoot,
  "wordpress-plugins",
  "neo-pulse-app",
  "includes",
  "automation-recipes",
  "blocks",
  "actions",
  "local-dominator-grid-export.json",
);
const exportScript = path.join(repoRoot, "scripts", "research", "local-dominator", "export-grid.mjs");
const puppeteerPath = path.join(repoRoot, "node_modules", "puppeteer");

const args = new Set(process.argv.slice(2));
const runSmoke = args.has("--smoke");

function log(step, detail = "") {
  const suffix = detail ? ` ${detail}` : "";
  console.log(`${step}${suffix}`);
}

function ensureEnvFile() {
  if (fs.existsSync(envFile)) {
    log("OK", ".env.localdominator exists");
    return;
  }
  if (!fs.existsSync(envExample)) {
    throw new Error("Missing .env.localdominator.example");
  }
  fs.copyFileSync(envExample, envFile);
  log("Created", ".env.localdominator from example (add your credentials)");
}

function ensureCatalogFiles() {
  if (!fs.existsSync(recipePath)) {
    throw new Error(`Missing Research recipe: ${recipePath}`);
  }
  if (!fs.existsSync(actionBlockPath)) {
    throw new Error(`Missing action block: ${actionBlockPath}`);
  }
  if (!fs.existsSync(exportScript)) {
    throw new Error(`Missing export script: ${exportScript}`);
  }
  const recipeCount = fs.readdirSync(path.join(repoRoot, "wordpress-plugins", "neo-pulse-app", "recipes"))
    .filter((name) => name.endsWith(".json")).length;
  log("OK", `Research recipe present (${recipeCount} catalog recipes in repo)`);
}

function ensurePuppeteer() {
  if (!fs.existsSync(puppeteerPath)) {
    throw new Error("Puppeteer not installed. Run: npm install");
  }
  log("OK", "Puppeteer installed");
}

function writeAppSecrets() {
  const result = spawnSync(process.execPath, ["scripts/generate-local-app-secrets.mjs"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error("generate-local-app-secrets.mjs failed");
  }
}

function runExportSmoke() {
  log("Running", "Local Dominator export smoke test (--json)…");
  const result = spawnSync(
    process.execPath,
    [
      exportScript,
      "--json",
      "--business",
      "Advance Blinds & Drapery",
      "--keyword",
      "blinds near me",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const stdout = result.stdout?.trim() ?? "";
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || stdout || "export smoke test failed");
  }
  let payload;
  try {
    payload = JSON.parse(stdout.split("\n").pop() ?? "{}");
  } catch {
    throw new Error(`Export did not return JSON: ${stdout.slice(0, 200)}`);
  }
  if (!payload.ok) {
    throw new Error(payload.error || "Export smoke test returned ok:false");
  }
  log("OK", `Export smoke test passed (${payload.fileName})`);
}

function main() {
  ensureEnvFile();
  ensureCatalogFiles();
  ensurePuppeteer();
  writeAppSecrets();
  if (runSmoke) {
    runExportSmoke();
  }
  console.log("");
  console.log("Local Dominator setup complete.");
  console.log("Next:");
  console.log("  1. Edit .env.localdominator with your Local Dominator login");
  console.log("  2. npm run sync:local-wp   (copies plugin + recipe into neopulse.local)");
  console.log("  3. npm run dev             then install the Research Local Dominator recipe via Assist or the recipes API");
  console.log("  4. npm run localdominator:export:json   (CLI export anytime)");
  if (!runSmoke) {
    console.log("  Optional: npm run setup:local-dominator:smoke");
  }
}

main();
