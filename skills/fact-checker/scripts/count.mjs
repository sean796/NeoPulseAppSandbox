#!/usr/bin/env node
/**
 * Count posts + service-area pages from inventory JSON.
 *
 * Usage: node skills/fact-checker/scripts/count.mjs --inventory inventory.json
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
import { buildCountResult } from "./lib/build-count.mjs";

const USAGE = `Usage: scripts/count.mjs --inventory inventory.json

Count blog posts and service-area pages from inventory JSON.

Options:
  --inventory  Path to inventory JSON with a pages array (required)
  --help       Show this help

Examples:
  node skills/fact-checker/scripts/count.mjs --inventory inventory.json

${EXIT_HELP}`;

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (flags.help || flags.h) {
    printErr(USAGE);
    process.exit(EXIT.OK);
  }

  const inventoryPath =
    typeof flags.inventory === "string" ? flags.inventory.trim() : "";
  if (!inventoryPath) {
    failUsage("--inventory is required.", USAGE);
  }

  let inventory;
  try {
    inventory = readJsonFileSync(inventoryPath);
  } catch (err) {
    printErr(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(EXIT.COUNTS);
  }

  const result = buildCountResult(inventory);
  printJson(result);
  process.exit(EXIT.OK);
}

main();
