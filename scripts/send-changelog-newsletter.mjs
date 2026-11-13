#!/usr/bin/env node
/**
 * Launcher for the TypeScript send script (tsx resolves TS imports).
 * Usage: node scripts/send-changelog-newsletter.mjs [--dry-run] [--to=email]
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(dir, "send-changelog-newsletter.ts");
const result = spawnSync(
  process.execPath,
  ["--import", "tsx", script, ...process.argv.slice(2)],
  { stdio: "inherit", cwd: path.resolve(dir, "..") },
);
process.exit(result.status ?? 1);
