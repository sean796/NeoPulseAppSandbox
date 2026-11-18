import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HUB = "https://pulse-host-wp-hub.onrender.com";
const DECK = "61a3b1ff-686a-4096-8502-b682a02705df";
const SITE_ID = "wp-1791924906059-1";

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
  "Content-Type": "application/json",
  Accept: "application/json",
  ...(host ? { "X-Pulse-Host-Api-Token": host } : {}),
};

const loadRes = await fetch(`${HUB}/api/manager-wordpress-properties/load?_=${Date.now()}`, {
  headers,
  cache: "no-store",
});
const loadData = await loadRes.json();
const sites = Array.isArray(loadData.sites) ? loadData.sites : [];
const idx = sites.findIndex((s) => s.id === SITE_ID || /blind magic/i.test(s.name));
if (idx < 0) throw new Error("Blind Magic site not found on hub");
const before = sites[idx].clientLogoBoxTheme;
console.log("before", { name: sites[idx].name, clientLogoBoxTheme: before });

sites[idx] = { ...sites[idx], clientLogoBoxTheme: "white" };
const saveRes = await fetch(`${HUB}/api/manager-wordpress-properties/save`, {
  method: "POST",
  headers,
  body: JSON.stringify({ sites }),
});
const saveBody = await saveRes.json().catch(() => ({}));
console.log("save", saveRes.status, saveBody.ok ?? saveBody.error ?? "ok");

const deckRes = await fetch(
  `${HUB}/api/organic-dashboard/client-report/load?deckId=${DECK}&siteId=${SITE_ID}`,
  { headers, cache: "no-store" },
);
const deck = await deckRes.json();
const payload = deck.payload || {};
console.log("deckBranding", {
  clientLogoBoxTheme: payload.clientLogoBoxTheme,
  hasLogo: !!payload.clientLogoUrl,
});
