/** Shared CLI helpers for window-treatments-vertical scripts. */

export const EXIT = {
  OK: 0,
  USAGE: 2,
  SITE: 3,
  DATA: 4,
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

export const EXIT_HELP = `Exit codes:
  0  success
  2  invalid arguments
  3  unused (site gate is server-side)
  4  required data unavailable
  5  unused
  6  unused`;
