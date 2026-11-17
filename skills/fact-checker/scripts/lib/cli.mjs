/** Shared CLI helpers for fact-checker scripts. */

import fs from "node:fs";

export const EXIT = {
  OK: 0,
  USAGE: 2,
  SITE: 3,
  COUNTS: 4,
  PLAN: 5,
  WORKER: 6,
};

export function parseArgs(argv) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--") continue;
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      if (eq !== -1) {
        flags[token.slice(2, eq)] = token.slice(eq + 1);
        continue;
      }
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next != null && !next.startsWith("--")) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
      continue;
    }
    positionals.push(token);
  }
  return { flags, positionals };
}

export function printJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

export function printErr(message) {
  process.stderr.write(`${message}\n`);
}

export function failUsage(message, usage) {
  printErr(`Error: ${message}`);
  if (usage) printErr(usage);
  process.exit(EXIT.USAGE);
}

export function readJsonFileSync(path) {
  const raw = fs.readFileSync(path, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Could not parse JSON file ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export const EXIT_HELP = `Exit codes:
  0  success (including zero pages)
  2  invalid arguments
  3  site or inventory missing
  4  counts unavailable
  5  claims plan rejected
  6  auth or worker failure`;
