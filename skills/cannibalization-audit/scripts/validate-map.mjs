#!/usr/bin/env node
/** Validate a cannibalization redirect-map JSON. */

import { validateMap } from "./lib/validate-map.mjs";
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
  node skills/cannibalization-audit/scripts/validate-map.mjs --map <path.json>

Options:
  --map   Redirect-map JSON
  --help  Show help

${EXIT_HELP}`;

const { flags } = parseArgs(process.argv.slice(2));
if (flags.help === true) {
  printErr(USAGE);
  process.exit(EXIT.OK);
}
if (!flags.map || flags.map === true) {
  failUsage("--map is required", USAGE);
}

let map;
try {
  map = readJsonFileSync(String(flags.map));
} catch (err) {
  printErr(err instanceof Error ? err.message : String(err));
  process.exit(EXIT.PLAN);
}

const result = validateMap(map);
if (!result.ok) {
  printErr(result.error ?? "map rejected");
  process.exit(EXIT.PLAN);
}
printJson({ ok: true, redirectCount: map.redirects.length, leaveCount: map.leave.length });
process.exit(EXIT.OK);
