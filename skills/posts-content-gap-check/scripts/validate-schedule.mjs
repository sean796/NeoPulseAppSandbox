#!/usr/bin/env node
/**
 * Validate a schedule plan against count JSON.
 *
 * Usage: node skills/posts-content-gap-check/scripts/validate-schedule.mjs --count count.json --plan schedule.json
 */

import {
  EXIT,
  EXIT_HELP,
  failUsage,
  parseArgs,
  printErr,
  printJson,
  readJsonFileSync,
} from "./lib/cli.mjs";
import { validateSchedulePlan } from "./lib/validate-plan.mjs";

const USAGE = `Usage: scripts/validate-schedule.mjs --count count.json --plan schedule.json

Validate a schedule plan against count JSON from count.mjs.

Options:
  --count   Path to count JSON (required)
  --plan    Path to schedule JSON (required)
  --help    Show this help

Examples:
  node skills/posts-content-gap-check/scripts/validate-schedule.mjs --count count.json --plan schedule.json

${EXIT_HELP}`;

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (flags.help || flags.h) {
    printErr(USAGE);
    process.exit(EXIT.OK);
  }

  const countPath = typeof flags.count === "string" ? flags.count.trim() : "";
  const planPath = typeof flags.plan === "string" ? flags.plan.trim() : "";
  if (!countPath) failUsage("--count is required.", USAGE);
  if (!planPath) failUsage("--plan is required.", USAGE);

  let count;
  let plan;
  try {
    count = readJsonFileSync(countPath);
    plan = readJsonFileSync(planPath);
  } catch (err) {
    printErr(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(EXIT.USAGE);
  }

  const result = validateSchedulePlan(count, plan);
  if (!result.ok) {
    printJson({ ok: false, errors: result.errors });
    for (const message of result.errors) {
      printErr(`Error: ${message}`);
    }
    process.exit(EXIT.PLAN);
  }

  printJson({ ok: true, ...result.plan });
  process.exit(EXIT.OK);
}

main();
