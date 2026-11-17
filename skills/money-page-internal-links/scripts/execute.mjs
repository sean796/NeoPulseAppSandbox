#!/usr/bin/env node
/**
 * Dry-run or confirm handoff for money-page internal link apply.
 *
 * Usage:
 *   node skills/money-page-internal-links/scripts/execute.mjs --plan link-plan.json --dry-run
 *   node skills/money-page-internal-links/scripts/execute.mjs --confirm
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

const USAGE = `Usage: scripts/execute.mjs (--dry-run --plan PATH | --confirm)

Preview a link plan or acknowledge hub Property Skills Run execute. CLI does not call Neo MCP.

Options:
  --plan        Path to link plan JSON (required with --dry-run)
  --dry-run     Print plan summary JSON only
  --confirm     Acknowledge hub execute handoff
  --help        Show this help

Examples:
  node skills/money-page-internal-links/scripts/execute.mjs --plan link-plan.json --dry-run

${EXIT_HELP}`;

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (flags.help || flags.h) {
    printErr(USAGE);
    process.exit(EXIT.OK);
  }

  const dryRun = flags["dry-run"] === true || flags["dry-run"] === "true";
  const confirm = flags.confirm === true || flags.confirm === "true";
  const planPath = typeof flags.plan === "string" ? flags.plan.trim() : "";

  if (!dryRun && !confirm) {
    failUsage("Pass --dry-run or --confirm.", USAGE);
  }
  if (dryRun && confirm) {
    failUsage("Pass only one of --dry-run or --confirm.", USAGE);
  }

  if (confirm) {
    printJson({
      ok: true,
      started: true,
      message: "Hub execute via Property Skills Run",
    });
    process.exit(EXIT.OK);
  }

  if (!planPath) {
    failUsage("--plan is required with --dry-run.", USAGE);
  }

  let plan;
  try {
    plan = readJsonFileSync(planPath);
  } catch (err) {
    printErr(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(EXIT.USAGE);
  }

  const links = Array.isArray(plan?.links) ? plan.links : [];
  const byMoney = new Map();
  for (const row of links) {
    const money = String(row?.moneyUrl ?? "");
    const support = String(row?.supportUrl ?? "");
    if (!money) continue;
    if (!byMoney.has(money)) byMoney.set(money, []);
    byMoney.get(money).push(support);
  }

  printJson({
    dryRun: true,
    linkCount: links.length,
    uniqueMoneyPages: byMoney.size,
    summary: Object.fromEntries(
      [...byMoney.entries()].map(([moneyUrl, supports]) => [
        moneyUrl,
        { supportCount: supports.length, supportUrls: supports },
      ]),
    ),
  });
  process.exit(EXIT.OK);
}

main();