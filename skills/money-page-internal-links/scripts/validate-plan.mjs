#!/usr/bin/env node
/**
 * Validate a link plan against inventory JSON.
 *
 * Usage: node skills/money-page-internal-links/scripts/validate-plan.mjs --inventory inventory.json --plan link-plan.json
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
import { validateLinkPlan } from "./lib/validate-plan.mjs";

const USAGE = `Usage: scripts/validate-plan.mjs --inventory PATH --plan PATH

Validate a link plan against inventory JSON (moneyUrls + blogUrls).

Options:
  --inventory  Path to inventory JSON (required; --count accepted as alias)
  --count      Alias for --inventory
  --plan       Path to link plan JSON (required)
  --help       Show this help

Examples:
  node skills/money-page-internal-links/scripts/validate-plan.mjs --inventory inventory.json --plan link-plan.json

${EXIT_HELP}`;

function resolveInventoryPath(flags) {
  if (typeof flags.inventory === "string" && flags.inventory.trim()) {
    return flags.inventory.trim();
  }
  if (typeof flags.count === "string" && flags.count.trim()) {
    return flags.count.trim();
  }
  return "";
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (flags.help || flags.h) {
    printErr(USAGE);
    process.exit(EXIT.OK);
  }

  const inventoryPath = resolveInventoryPath(flags);
  const planPath = typeof flags.plan === "string" ? flags.plan.trim() : "";
  if (!inventoryPath) failUsage("--inventory (or --count) is required.", USAGE);
  if (!planPath) failUsage("--plan is required.", USAGE);

  let inventory;
  let plan;
  try {
    inventory = readJsonFileSync(inventoryPath);
    plan = readJsonFileSync(planPath);
  } catch (err) {
    printErr(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(EXIT.USAGE);
  }

  const normalized = {
    moneyUrls: Array.isArray(inventory.moneyUrls) ? inventory.moneyUrls : [],
    blogUrls: Array.isArray(inventory.blogUrls) ? inventory.blogUrls : [],
  };

  const result = validateLinkPlan(plan, normalized);
  if (!result.ok) {
    printJson({ ok: false, error: result.error });
    printErr(`Error: ${result.error}`);
    process.exit(EXIT.PLAN);
  }

  printJson({ ok: true, linkCount: plan.links?.length ?? 0 });
  process.exit(EXIT.OK);
}

main();