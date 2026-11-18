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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    o[t.slice(0, eq).trim()] = v;
  }
  return o;
}
const env = { ...loadEnv(path.join(REPO, ".env")), ...loadEnv(path.join(REPO, ".env.local")) };
const HUB = "https://pulse-host-wp-hub.onrender.com";
const LOCAL = "http://127.0.0.1:8080";
const host = (env.PULSE_HOST_API_TOKEN || "").trim();

const login = await fetch(`${HUB}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "sean@neodigital.ca" }),
});
const { sessionToken } = await login.json();
const headers = {
  Authorization: `Bearer ${sessionToken}`,
  ...(host ? { "X-Pulse-Host-Api-Token": host } : {}),
};

const sites = (
  await (await fetch(`${HUB}/api/manager-wordpress-properties/load`, { headers })).json()
).sites;
const siteId = sites.find((s) => /advance/i.test(s.name))?.id;

async function hist(base) {
  try {
    const r = await fetch(`${base}/api/local-grid/history?siteId=${encodeURIComponent(siteId)}`, {
      headers,
    });
    const j = await r.json().catch(() => ({}));
    const scans = Array.isArray(j.scans) ? j.scans : Array.isArray(j) ? j : [];
    return {
      base,
      status: r.status,
      count: scans.length,
      sample: scans.slice(0, 5).map((s) => ({
        id: s.scanId || s.id,
        keyword: s.keyword,
        points: s.pointCount || s.points?.length,
      })),
    };
  } catch (e) {
    return { base, error: String(e.message || e) };
  }
}

async function workspace(base) {
  try {
    const r = await fetch(`${base}/api/local-grid/workspace?siteId=${encodeURIComponent(siteId)}`, {
      headers,
    });
    const j = await r.json().catch(() => ({}));
    const panels = j.panels || j.workspace?.panels || [];
    return {
      base,
      status: r.status,
      panels: Array.isArray(panels)
        ? panels.map((p) => ({
            id: p.id,
            activeScanId: p.layoutSnapshot?.activeScanId,
            keyword: p.layoutSnapshot?.keyword || p.keyword,
          }))
        : [],
    };
  } catch (e) {
    return { base, error: String(e.message || e) };
  }
}

console.log(
  JSON.stringify(
    {
      siteId,
      hubHist: await hist(HUB),
      localHist: await hist(LOCAL),
      hubWs: await workspace(HUB),
      localWs: await workspace(LOCAL),
    },
    null,
    2,
  ),
);
