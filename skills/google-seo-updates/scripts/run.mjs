#!/usr/bin/env node
/** Dry-run or confirm-POST Google SEO Updates Generate on the hub. */

import {
  EXIT,
  EXIT_HELP,
  failUsage,
  parseArgs,
  printErr,
  printJson,
} from "./lib/cli.mjs";

const USAGE = `Usage:
  node skills/google-seo-updates/scripts/run.mjs --dry-run
  node skills/google-seo-updates/scripts/run.mjs --confirm

Options:
  --dry-run   Print the Generate payload without calling the hub
  --confirm   POST /api/google-seo-updates/generate
  --base-url  Hub base URL (default http://127.0.0.1:8080)
  --help      Show this help

${EXIT_HELP}`;

const { flags } = parseArgs(process.argv.slice(2));
if (flags.help) {
  printErr(USAGE);
  process.exit(EXIT.OK);
}

const dryRun = Boolean(flags["dry-run"]);
const confirm = Boolean(flags.confirm);
if (!dryRun && !confirm) {
  failUsage("pass --dry-run or --confirm", USAGE);
}
if (dryRun && confirm) {
  failUsage("pass only one of --dry-run or --confirm", USAGE);
}

const payload = {
  skillId: "seo.google.updates",
  action: "generate",
};

if (dryRun) {
  printJson({ ok: true, dryRun: true, payload });
  process.exit(EXIT.OK);
}

const baseUrl =
  typeof flags["base-url"] === "string" && flags["base-url"].trim()
    ? flags["base-url"].replace(/\/$/, "")
    : "http://127.0.0.1:8080";

try {
  const res = await fetch(`${baseUrl}/api/google-seo-updates/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({}),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    printErr(`Error: hub returned non-JSON (${res.status})`);
    process.exit(EXIT.WORKER);
  }
  if (!res.ok || data?.ok === false) {
    printErr(`Error: ${data?.error ?? `Generate failed (${res.status})`}`);
    process.exit(EXIT.WORKER);
  }
  printJson(data);
  process.exit(EXIT.OK);
} catch (err) {
  printErr(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(EXIT.WORKER);
}
