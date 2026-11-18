#!/usr/bin/env node
/** Validate one dated Google SEO archive entry JSON. */

import {
  EXIT,
  EXIT_HELP,
  failUsage,
  parseArgs,
  printErr,
  printJson,
  readJsonFileSync,
} from "./lib/cli.mjs";
import { validateArchiveEntry } from "./lib/validate-entry.mjs";

const USAGE = `Usage:
  node skills/google-seo-updates/scripts/validate-archive.mjs --entry PATH

Options:
  --entry PATH   Dated archive entry JSON file
  --help         Show this help

${EXIT_HELP}`;

const { flags } = parseArgs(process.argv.slice(2));
if (flags.help) {
  printErr(USAGE);
  process.exit(EXIT.OK);
}

const entryPath = typeof flags.entry === "string" ? flags.entry : "";
if (!entryPath) {
  failUsage("--entry is required", USAGE);
}

let entry;
try {
  entry = readJsonFileSync(entryPath);
} catch (err) {
  printErr(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(EXIT.DATA);
}

const result = validateArchiveEntry(entry);
if (!result.ok) {
  printErr(`Error: ${result.error}`);
  process.exit(EXIT.PLAN);
}

printJson({ ok: true, entry });
process.exit(EXIT.OK);
