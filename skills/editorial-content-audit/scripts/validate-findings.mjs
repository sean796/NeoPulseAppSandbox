#!/usr/bin/env node
/**
 * Validate findings JSON against the editorial audit contract.
 *
 * Usage: node skills/editorial-content-audit/scripts/validate-findings.mjs --findings findings.json
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
import { validateFindingsDoc } from "./lib/validate-findings.mjs";

const USAGE = `Usage: scripts/validate-findings.mjs --findings findings.json

Validate findings JSON from an editorial content audit.

Options:
  --findings  Path to findings JSON (required)
  --help      Show this help

Examples:
  node skills/editorial-content-audit/scripts/validate-findings.mjs --findings findings.json

${EXIT_HELP}`;

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (flags.help || flags.h) {
    printErr(USAGE);
    process.exit(EXIT.OK);
  }

  const findingsPath =
    typeof flags.findings === "string" ? flags.findings.trim() : "";
  if (!findingsPath) {
    failUsage("--findings is required.", USAGE);
  }

  let doc;
  try {
    doc = readJsonFileSync(findingsPath);
  } catch (err) {
    printErr(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(EXIT.USAGE);
  }

  const result = validateFindingsDoc(doc);
  if (!result.ok) {
    printJson({ ok: false, errors: result.errors });
    for (const message of result.errors) {
      printErr(`Error: ${message}`);
    }
    process.exit(EXIT.PLAN);
  }

  printJson({ ok: true, findingCount: result.findings.length });
  process.exit(EXIT.OK);
}

main();
