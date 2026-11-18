import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HUB = "https://pulse-host-wp-hub.onrender.com";
const id = process.argv[2] || "9a94ee76-436b-402d-8eb8-3582e83900e2";
const siteId = process.argv[3] || "wp-1791924906059-0";

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

const params = new URLSearchParams({ deckId: id, siteId });
const u = `${HUB}/api/organic-dashboard/client-report/load?${params}`;
const res = await fetch(u, { headers, cache: "no-store" });
const data = await res.json();
const p = data.payload || {};
const scans = Array.isArray(p.localGridScans) ? p.localGridScans : [];
const vm = p.viewModel || {};
const hl = p.highlights || {};

const gridSummary = scans.map((s) => {
  const points = Array.isArray(s.points) ? s.points : [];
  const filled = points.filter((pt) => Array.isArray(pt.items) && pt.items.length > 0).length;
  return {
    keyword: s.keyword || s.query || s.label,
    location: s.locationLabel || s.address || s.centerLabel,
    points: points.length,
    filled,
  };
});

console.log(
  JSON.stringify(
    {
      site: p.siteName,
      deck: id,
      bytes: JSON.stringify(p).length,
      scans: scans.length,
      gridSummary,
      hasGa4: !!vm.hasGa4,
      hasGsc: !!vm.hasGsc,
      hasSemrush: !!vm.hasSemrush,
      hasAds: !!vm.hasGoogleAds || !!vm.hasAds,
      gaRows: (vm.ga4MonthlyRows || vm.analyticsMonthlyRows || []).length,
      gscRows: (vm.gscQueryRows || vm.searchConsoleRows || []).length,
      highlightKeys: Object.keys(hl).slice(0, 20),
      takeaways: Array.isArray(hl.keyTakeaways) ? hl.keyTakeaways.length : 0,
      opportunities: Array.isArray(hl.topOpportunities) ? hl.topOpportunities.length : 0,
      preparedOn: p.preparedOn,
    },
    null,
    2,
  ),
);
