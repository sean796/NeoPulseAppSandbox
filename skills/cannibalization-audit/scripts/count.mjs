#!/usr/bin/env node
/** Count published /blog/ posts from inventory JSON. */

import { buildCount } from "./lib/build-count.mjs";
import {
  EXIT,
  EXIT_HELP,
  failUsage,
  parseArgs,
  printErr,
  printJson,
  readJsonFileSync,
} from "./lib/cli.mjs";

const USAGE = `Usage:
  node skills/cannibalization-audit/scripts/count.mjs --inventory <path.json>

Options:
  --inventory  Inventory JSON with pages[]
  --help       Show help

${EXIT_HELP}`;

const { flags } = parseArgs(process.argv.slice(2));
if (flags.help === true) {
  printErr(USAGE);
  process.exit(EXIT.OK);
}
if (!flags.inventory || flags.inventory === true) {
  failUsage("--inventory is required", USAGE);
}

let inventory;
try {
  inventory = readJsonFileSync(String(flags.inventory));
} catch (err) {
  printErr(err instanceof Error ? err.message : String(err));
  process.exit(EXIT.SITE);
}

printJson(buildCount(inventory));
process.exit(EXIT.OK);
