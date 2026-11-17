#!/usr/bin/env node
/**
 * Count next-month published + scheduled SAP pages vs site SAP quota.
 *
 * Usage: node skills/entities-content-gap-check/scripts/count.mjs --site-id SITE_ID
 */

import {
  EXIT,
  EXIT_HELP,
  failUsage,
  parseArgs,
  printErr,
  printJson,
} from "./lib/cli.mjs";
import { nextMonthKey } from "./lib/calendar.mjs";
import { buildCountResult } from "./lib/build-count.mjs";
import { fetchNextMonthEntityStats } from "./lib/fetch-counts.mjs";
import { findSiteById, loadSites, resolveSitesPath } from "./lib/sites.mjs";

const USAGE = `Usage: scripts/count.mjs --site-id SITE_ID [--sites-path PATH] [--api-base URL] [--month YYYY-MM]

Count next month published + scheduled service-area pages for one Integrations site.

Options:
  --site-id     Integrations site id (required)
  --sites-path  Path to sites.json
  --api-base    Pulse API base (default NEO_PULSE_API_BASE or http://127.0.0.1:8080)
  --month       Override month key YYYY-MM (default: next month America/Edmonton)
  --help        Show this help

Examples:
  node skills/entities-content-gap-check/scripts/count.mjs --site-id advance-blinds

${EXIT_HELP}`;

async function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (flags.help || flags.h) {
    printErr(USAGE);
    process.exit(EXIT.OK);
  }

  const siteId = typeof flags["site-id"] === "string" ? flags["site-id"].trim() : "";
  if (!siteId) {
    failUsage("--site-id is required.", USAGE);
  }

  let sites;
  try {
    sites = loadSites(resolveSitesPath(flags));
  } catch (err) {
    printErr(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(EXIT.SITE);
  }

  const site = findSiteById(sites, siteId);
  if (!site) {
    printErr(`Error: site id "${siteId}" not found in sites.json.`);
    process.exit(EXIT.SITE);
  }

  try {
    const stats = await fetchNextMonthEntityStats(site, flags);
    const result = buildCountResult(site, stats, stats.monthKey || nextMonthKey());
    printJson(result);
    process.exit(EXIT.OK);
  } catch (err) {
    const code = err?.code;
    printErr(`Error: ${err instanceof Error ? err.message : String(err)}`);
    if (code === "SITE") process.exit(EXIT.SITE);
    if (code === "USAGE") process.exit(EXIT.USAGE);
    process.exit(EXIT.COUNTS);
  }
}

main();
