import { existsSync, readFileSync } from "fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { openRouterKey } = require("../load-root-openrouter-env.cjs");
const paths = [
  "B:/Neo Pulse/.env",
  "B:/Neo Pulse/.env.local",
  "B:/Neo Pulse/.env.development",
  "C:/Users/Sean Craig/wpstaging/sites/neopulse.local/data/php/neo-pulse-data/email-worker-keys.json",
  "C:/Users/Sean Craig/wpstaging/sites/neopulse.local/data/php/neo-pulse-data/manager-settings.json",
];
console.log("cjs", Boolean(String(openRouterKey || "").trim()));
for (const path of paths) {
  if (!existsSync(path)) {
    console.log("missing", path);
    continue;
  }
  const text = readFileSync(path, "utf8");
  const has =
    /OPENROUTER_API_KEY=\s*\S/.test(text) ||
    /VITE_OPENROUTER_API_KEY=\s*\S/.test(text) ||
    /"openRouterApiKey"\s*:\s*"\S/.test(text) ||
    /openrouter-api-key"\s*:\s*"\S/.test(text);
  console.log(has ? "has" : "no", path.split("/").slice(-1)[0]);
}
