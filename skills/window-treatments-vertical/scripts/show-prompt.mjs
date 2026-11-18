#!/usr/bin/env node
/**
 * Usage: node skills/window-treatments-vertical/scripts/show-prompt.mjs
 * Prints the standing prompt JSON for the blinds vertical skill.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXIT, EXIT_HELP, parseArgs, printErr, printJson } from "./lib/cli.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const promptPath = path.join(__dirname, "..", "references", "standing-prompt.md");

const USAGE = `Usage:
  node skills/window-treatments-vertical/scripts/show-prompt.mjs

Options:
  --help  Show this help

${EXIT_HELP}`;

const { flags } = parseArgs(process.argv.slice(2));
if (flags.help === true) {
  printErr(USAGE);
  process.exit(EXIT.OK);
}

if (!fs.existsSync(promptPath)) {
  printErr(`Error: standing prompt missing at ${promptPath}`);
  process.exit(EXIT.DATA);
}

const livePrompt = fs.readFileSync(promptPath, "utf8").trim();
if (!livePrompt) {
  printErr("Error: standing prompt is empty");
  process.exit(EXIT.DATA);
}

printJson({
  ok: true,
  skillId: "vertical.window-treatments.guide",
  livePrompt,
});
process.exit(EXIT.OK);
