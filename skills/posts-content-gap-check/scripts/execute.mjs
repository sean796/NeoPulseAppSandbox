#!/usr/bin/env node
/**
 * Dry-run or confirm the Blog Ideas Studio handoff from count + schedule plan.
 *
 * Usage:
 *   node skills/posts-content-gap-check/scripts/execute.mjs --site-id ID --count count.json --plan schedule.json --dry-run
 *   node skills/posts-content-gap-check/scripts/execute.mjs --site-id ID --count count.json --plan schedule.json --confirm
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
import { buildDryRunResult, buildPostCreatorPayload } from "./lib/build-payload.mjs";
import { validateSchedulePlan } from "./lib/validate-plan.mjs";

const USAGE = `Usage: scripts/execute.mjs --site-id SITE_ID --count count.json --plan schedule.json (--dry-run | --confirm)

Start Blog Ideas for the gap, or preview the payload.

Options:
  --site-id     Integrations site id (required)
  --count       Path to count JSON (required)
  --plan        Path to schedule JSON (required)
  --dry-run     Print payload only; do not start a task
  --confirm     Hand the gap to Blog Ideas Studio (Ideas, then the post run)
  --help        Show this help

Examples:
  node skills/posts-content-gap-check/scripts/execute.mjs --site-id advance-blinds --count count.json --plan schedule.json --dry-run

${EXIT_HELP}`;

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (flags.help || flags.h) {
    printErr(USAGE);
    process.exit(EXIT.OK);
  }

  const siteId = typeof flags["site-id"] === "string" ? flags["site-id"].trim() : "";
  const countPath = typeof flags.count === "string" ? flags.count.trim() : "";
  const planPath = typeof flags.plan === "string" ? flags.plan.trim() : "";
  const dryRun = flags["dry-run"] === true || flags["dry-run"] === "true";
  const confirm = flags.confirm === true || flags.confirm === "true";

  if (!siteId) failUsage("--site-id is required.", USAGE);
  if (!countPath) failUsage("--count is required.", USAGE);
  if (!planPath) failUsage("--plan is required.", USAGE);
  if (!dryRun && !confirm) {
    failUsage("Pass --dry-run or --confirm.", USAGE);
  }
  if (dryRun && confirm) {
    failUsage("Pass only one of --dry-run or --confirm.", USAGE);
  }

  let count;
  let plan;
  try {
    count = readJsonFileSync(countPath);
    plan = readJsonFileSync(planPath);
  } catch (err) {
    printErr(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(EXIT.USAGE);
  }

  if (count.goalMet === true || Number(count.gap) === 0) {
    printJson({ ok: true, goalMet: true, created: 0, siteId });
    process.exit(EXIT.OK);
  }

  const validated = validateSchedulePlan(count, plan);
  if (!validated.ok) {
    printJson({ ok: false, errors: validated.errors });
    for (const message of validated.errors) {
      printErr(`Error: ${message}`);
    }
    process.exit(EXIT.PLAN);
  }

  if (dryRun) {
    printJson(buildDryRunResult(siteId, count, validated.plan));
    process.exit(EXIT.OK);
  }

  const payload = buildPostCreatorPayload(count, validated.plan);
  printJson({
    ok: true,
    blogIdeasStudio: true,
    siteId,
    gap: count.gap,
    month: count.month,
    postCount: payload.postCount,
  });
  process.exit(EXIT.OK);
}

main();
