#!/usr/bin/env node
/**
 * Count money pages from inventory JSON (utilities removed).
 *
 * Usage: node skills/money-page-internal-links/scripts/count.mjs --site-id SITE_ID --inventory inventory.json
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
import { isUtilityPageUrl } from "./lib/utility-pages.mjs";

const USAGE = `Usage: scripts/count.mjs --site-id SITE_ID [--inventory PATH]

Count page-sitemap money pages for one Integrations site. Primary path is hub Property Skills Run
(live page inventory). For unit tests, pass --inventory JSON with a moneyUrls array.

Options:
  --site-id     Integrations site id (required)
  --inventory   Path to inventory JSON with moneyUrls (required for CLI count today)
  --help        Show this help

Inventory JSON shape (minimal):
  { "moneyUrls": ["https://example.com/window-treatments/"] }

Examples:
  node skills/money-page-internal-links/scripts/count.mjs --site-id blind-magic --inventory inventory.json

${EXIT_HELP}`;

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  if (flags.help || flags.h) {
    printErr(USAGE);
    process.exit(EXIT.OK);
  }

  const siteId = typeof flags["site-id"] === "string" ? flags["site-id"].trim() : "";
  if (!siteId) {
    failUsage("--site-id is required.", USAGE);
  }

  const inventoryPath =
    typeof flags.inventory === "string"
      ? flags.inventory.trim()
      : typeof flags.count === "string"
        ? flags.count.trim()
        : "";

  if (!inventoryPath) {
    printErr(
      "Error: --inventory is required. Hub Property Skills Run provides live money page and blog URLs.",
    );
    process.exit(EXIT.COUNTS);
  }

  let inventory;
  try {
    inventory = readJsonFileSync(inventoryPath);
  } catch (err) {
    printErr(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(EXIT.USAGE);
  }

  const rawMoney = Array.isArray(inventory.moneyUrls) ? inventory.moneyUrls : [];
  const moneyUrls = [
    ...new Set(
      rawMoney
        .map((u) => String(u).trim())
        .filter((u) => u && !isUtilityPageUrl(u)),
    ),
  ];

  const moneyPageCount = moneyUrls.length;
  const goalMet = moneyPageCount === 0;

  printJson({
    siteId,
    moneyPageCount,
    moneyUrls,
    goalMet,
    message: goalMet
      ? "No money pages after utility filter; stop without planning links."
      : `${moneyPageCount} money page(s) ready for internal link planning.`,
  });
  process.exit(EXIT.OK);
}

main();