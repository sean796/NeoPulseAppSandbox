import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "b:/Neo Pulse/scripts/neo-digital-fact-check";
const pairs = [
  ["kwb-fact-check", "neo-digital-fact-check"],
  ["_tmp-kwb-fact", "_tmp-nd-fact"],
  ["KWB_FACT_", "ND_FACT_"],
  ["KWB_EEAT_", "ND_EEAT_"],
  ["KWB_BLOG_SINGLE_ID", "ND_BLOG_SINGLE_ID"],
  ["kwbllp.com", "neodigital.ca"],
  ["KWB", "Neo Digital"],
  ["kwb-shield", "nd-shield"],
  ["The KWB Team", "The Neo Digital Team"],
];

for (const name of readdirSync(DIR)) {
  if (!name.endsWith(".mjs")) continue;
  const path = join(DIR, name);
  let text = readFileSync(path, "utf8");
  for (const [from, to] of pairs) text = text.split(from).join(to);
  writeFileSync(path, text);
  console.log("retargeted", name);
}
