import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HUB = "https://pulse-host-wp-hub.onrender.com";

function loadEnv(p) {
  const o = {};
  if (!fs.existsSync(p)) return o;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    o[t.slice(0, eq).trim()] = v;
  }
  return o;
}
const env = { ...loadEnv(path.join(REPO, ".env")), ...loadEnv(path.join(REPO, ".env.local")) };
const host = (process.env.PULSE_HOST_API_TOKEN || env.PULSE_HOST_API_TOKEN || "").trim();
const login = await fetch(`${HUB}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "sean@neodigital.ca" }),
});
const { sessionToken } = await login.json();
const headers = {
  Authorization: `Bearer ${sessionToken}`,
  Accept: "application/json",
  ...(host ? { "X-Pulse-Host-Api-Token": host } : {}),
};
const params = new URLSearchParams({
  deckId: "9a94ee76-436b-402d-8eb8-3582e83900e2",
  siteId: "wp-1791924906059-0",
});
const data = await (
  await fetch(`${HUB}/api/organic-dashboard/client-report/load?${params}`, { headers, cache: "no-store" })
).json();
const vm = data.payload.viewModel;
const keys = Object.keys(vm);
const arrayish = {};
for (const k of keys) {
  const v = vm[k];
  if (Array.isArray(v)) arrayish[k] = v.length;
  else if (v && typeof v === "object") {
    const nested = Object.keys(v).filter((nk) => Array.isArray(v[nk]));
    if (nested.length) arrayish[k] = Object.fromEntries(nested.map((nk) => [nk, v[nk].length]));
  }
}
console.log(JSON.stringify({ keys: keys.slice(0, 60), arrayish, flags: {
  hasGa4: vm.hasGa4, hasGsc: vm.hasGsc, hasSemrush: vm.hasSemrush, hasGoogleAds: vm.hasGoogleAds, hasGbp: vm.hasGbp, hasLocalGrid: vm.hasLocalGrid
}}, null, 2));
