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
const res = await fetch(`${HUB}/api/manager-wordpress-properties/load?_=${Date.now()}`, {
  headers,
  cache: "no-store",
});
const { sites } = await res.json();
const advance = sites.find((s) => /advance/i.test(s.name));
const phoenix = sites.find((s) => /phoenix/i.test(s.name));
for (const s of [advance, phoenix]) {
  if (!s) continue;
  console.log({
    name: s.name,
    id: s.id,
    googleAdsCustomerId: s.googleAdsCustomerId || null,
    ga4PropertyId: s.ga4PropertyId || null,
    gscSiteUrl: s.gscSiteUrl || s.searchConsoleSiteUrl || null,
    semrushDomain: s.semrushDomain || s.domain || null,
    siteUrl: s.siteUrl,
  });
}
