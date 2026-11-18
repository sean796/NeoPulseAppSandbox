/**
 * Push every local-grid workspace + scan from local staging data (or local API)
 * onto pulse-host-wp-hub, then exit. Used so live client reports include grids.
 */
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

function dataRoot() {
  const cfg = JSON.parse(fs.readFileSync(path.join(REPO, "scripts/local-wp-staging.config.json"), "utf8"));
  return path.join(path.dirname(cfg.wpRoot), "data", "php", "neo-pulse-data", "local-grid");
}

async function authHeaders() {
  const env = { ...loadEnv(path.join(REPO, ".env")), ...loadEnv(path.join(REPO, ".env.local")) };
  const host = (process.env.PULSE_HOST_API_TOKEN || env.PULSE_HOST_API_TOKEN || "").trim();
  const login = await fetch(`${HUB}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "sean@neodigital.ca" }),
  });
  const lj = await login.json();
  if (!lj.sessionToken) throw new Error(`login failed ${login.status}`);
  return {
    Authorization: `Bearer ${lj.sessionToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(host ? { "X-Pulse-Host-Api-Token": host } : {}),
  };
}

async function post(headers, route, body) {
  const res = await fetch(`${HUB}/api/${route}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false || data.ok === false) {
    throw new Error(`${route}: ${data.error || res.status}`);
  }
  return data;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  const root = dataRoot();
  if (!fs.existsSync(root)) throw new Error(`missing ${root}`);
  const headers = await authHeaders();
  const siteDirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("wp-"))
    .map((d) => d.name);

  let workspaces = 0;
  let scans = 0;
  let failures = 0;

  for (const siteId of siteDirs) {
    const dir = path.join(root, siteId);
    const workspace = readJson(path.join(dir, "workspace.json"));
    if (workspace && Array.isArray(workspace.panels) && workspace.panels.length > 0) {
      try {
        await post(headers, "organic-dashboard/local-grid/workspace", { siteId, workspace });
        workspaces += 1;
        console.log(`[ws] ${siteId} panels=${workspace.panels.length}`);
      } catch (err) {
        failures += 1;
        console.error(`[ws FAIL] ${siteId}: ${err.message || err}`);
      }
    }

    const scanFiles = fs.readdirSync(dir).filter((f) => /^scan_.+\.json$/i.test(f));
    for (const file of scanFiles) {
      const scan = readJson(path.join(dir, file));
      if (!scan?.scanId || !Array.isArray(scan.points) || scan.points.length === 0) continue;
      try {
        await post(headers, "organic-dashboard/local-grid/save", { siteId, scan });
        scans += 1;
        console.log(`[scan] ${siteId} ${scan.scanId} points=${scan.points.length}`);
      } catch (err) {
        failures += 1;
        console.error(`[scan FAIL] ${siteId} ${file}: ${err.message || err}`);
      }
    }
  }

  console.log(`\nDone workspaces=${workspaces} scans=${scans} failures=${failures}`);
  if (workspaces === 0 && scans === 0) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
