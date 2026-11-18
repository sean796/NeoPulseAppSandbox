import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function loadEnv(p) {
  const o = {};
  if (!fs.existsSync(p)) return o;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    o[t.slice(0, eq).trim()] = v;
  }
  return o;
}
const env = { ...loadEnv(path.join(REPO, ".env")), ...loadEnv(path.join(REPO, ".env.local")) };
const HUB = "https://pulse-host-wp-hub.onrender.com";
const hostToken = (process.env.PULSE_HOST_API_TOKEN || env.PULSE_HOST_API_TOKEN || "").trim();

const login = await fetch(`${HUB}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "sean@neodigital.ca" }),
});
const lj = await login.json();
const bearer = lj.sessionToken || "";
console.log("login", login.status, Boolean(bearer), "hostToken", Boolean(hostToken));

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${bearer}`,
};
if (hostToken) headers["X-Pulse-Host-Api-Token"] = hostToken;

const sitesJson = await (
  await fetch(`${HUB}/api/manager-wordpress-properties/load?_=${Date.now()}`, { headers })
).json();
const site = (sitesJson.sites || []).find((s) => /advance/i.test(s.name));
const interesting = Object.keys(site || {})
  .filter((k) => /ga4|gsc|search|ads|gbp|console/i.test(k))
  .map((k) => `${k}=${String(site[k] ?? "").slice(0, 80)}`);
console.log("site", site?.name);
console.log(interesting.join("\n"));

const body = {
  siteUrl: site.siteUrl,
  ga4PropertyId: site.ga4PropertyId || "",
  googleAdsCustomerId: String(site.googleAdsCustomerId || "").replace(/\D/g, ""),
  gbpLocationId: "",
  reportStructure: "period_progress",
  startDate: "2026-08-01",
  endDate: "2026-10-31",
  compareStartDate: "2026-08-01",
  compareEndDate: "2026-10-31",
};
const res = await fetch(`${HUB}/api/organic-dashboard/fetch`, {
  method: "POST",
  headers,
  body: JSON.stringify(body),
});
const data = await res.json().catch(() => ({}));
fs.writeFileSync(path.join(REPO, "tmp/probe-organic-advance.json"), JSON.stringify(data, null, 2));
console.log(
  JSON.stringify(
    {
      status: res.status,
      success: data.success,
      sources: data.sources,
      error: data.error || null,
      ga4Reason: data.ga4?.reason || data.ga4?.error || null,
      gscReason: data.gsc?.reason || data.gsc?.error || null,
      hasGa4Rows: Array.isArray(data.ga4?.rows) ? data.ga4.rows.length : null,
      hasGscQueries: Array.isArray(data.gsc?.queries) ? data.gsc.queries.length : null,
    },
    null,
    2,
  ),
);
