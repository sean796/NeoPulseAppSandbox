/**
 * Push local staging GA + GSC service-account JSON onto pulse-host-wp-hub disk.
 * Usage: node scripts/render-sync-ga-gsc-credentials-to-hub.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const HUB_API = (process.env.NEO_PULSE_HUB_API_BASE || "https://pulse-host-wp-hub.onrender.com").replace(
  /\/+$/,
  "",
);

function loadDotEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, eq).trim()] = v;
  }
  return out;
}

function dataDir() {
  if (process.env.NEO_PULSE_DATA_DIR) return process.env.NEO_PULSE_DATA_DIR;
  const cfgPath = path.join(REPO_ROOT, "scripts", "local-wp-staging.config.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const wpRoot = String(cfg.wpRoot || "").trim();
  return path.join(path.dirname(wpRoot), "data", "php", "neo-pulse-data");
}

async function loginBearer() {
  const email = (process.env.NEO_PULSE_SMOKE_EMAIL || "sean@neodigital.ca").trim();
  const res = await fetch(`${HUB_API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.sessionToken) {
    throw new Error(`Login failed ${res.status}: ${data.error || "no token"}`);
  }
  return data.sessionToken;
}

function hubHeaders(token) {
  const env = { ...loadDotEnv(path.join(REPO_ROOT, ".env")), ...loadDotEnv(path.join(REPO_ROOT, ".env.local")) };
  const host = (process.env.PULSE_HOST_API_TOKEN || env.PULSE_HOST_API_TOKEN || "").trim();
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    ...(host ? { "X-Pulse-Host-Api-Token": host } : {}),
  };
}

async function save(endpoint, raw, headers) {
  const res = await fetch(`${HUB_API}/api/${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ serviceAccountJson: raw }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(`${endpoint}: ${data.error || `HTTP ${res.status}`}`);
  }
  return data;
}

async function main() {
  const root = dataDir();
  const gaPath = path.join(root, "ga-service-account.json");
  const gscPath = path.join(root, "gsc-service-account.json");
  if (!fs.existsSync(gaPath)) throw new Error(`Missing ${gaPath}`);
  if (!fs.existsSync(gscPath)) throw new Error(`Missing ${gscPath}`);

  const token = await loginBearer();
  const headers = hubHeaders(token);

  const ga = await save("ga/test-and-save", fs.readFileSync(gaPath, "utf8"), headers);
  console.log(`[ok] GA credentials on hub: ${ga.client_email || ga.email || "saved"}`);

  const gsc = await save("gsc/test-and-save", fs.readFileSync(gscPath, "utf8"), headers);
  console.log(`[ok] GSC credentials on hub: ${gsc.client_email || "saved"} (sites=${gsc.siteCount ?? "?"})`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
