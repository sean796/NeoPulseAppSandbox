#!/usr/bin/env node
/**
 * Validate claims JSON against the fact-checker contract.
 *
 * Usage: node skills/fact-checker/scripts/validate-claims.mjs --claims claims.json
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
import { validateClaimsDoc } from "./lib/validate-claims.mjs";

const USAGE = `Usage: scripts/validate-claims.mjs --claims claims.json

Validate claims JSON from a fact-checker run.

Options:
  --claims  Path to claims JSON (required)
  --help    Show this help

Examples:
  node skills/fact-checker/scripts/validate-claims.mjs --claims claims.json

${EXIT_HELP}`;

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (flags.help || flags.h) {
    printErr(USAGE);
    process.exit(EXIT.OK);
  }

  const claimsPath =
    typeof flags.claims === "string" ? flags.claims.trim() : "";
  if (!claimsPath) {
    failUsage("--claims is required.", USAGE);
  }

  let doc;
  try {
    doc = readJsonFileSync(claimsPath);
  } catch (err) {
    printErr(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(EXIT.USAGE);
  }

  const result = validateClaimsDoc(doc);
  if (!result.ok) {
    printJson({ ok: false, errors: result.errors });
    for (const message of result.errors) {
      printErr(`Error: ${message}`);
    }
    process.exit(EXIT.PLAN);
  }

  printJson({ ok: true, claimCount: result.claims.length });
  process.exit(EXIT.OK);
}

main();
