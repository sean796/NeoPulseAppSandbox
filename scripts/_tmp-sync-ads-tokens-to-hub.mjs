import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HUB = "https://pulse-host-wp-hub.onrender.com";
const cfg = JSON.parse(fs.readFileSync(path.join(REPO, "scripts/local-wp-staging.config.json"), "utf8"));
const dataRoot = path.join(path.dirname(cfg.wpRoot), "data", "php", "neo-pulse-data");

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

const keys = ["google-ads-tokens", "google-ads-api", "gmb-oauth"];
for (const key of keys) {
  const file = path.join(dataRoot, `${key}.json`);
  if (!fs.existsSync(file)) {
    console.log(`[skip] missing ${file}`);
    continue;
  }
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const res = await fetch(`${HUB}/api/integrations/hub-data-import`, {
    method: "POST",
    headers,
    body: JSON.stringify({ key, data }),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`[${key}] ${res.status} ${body.ok === false ? body.error : "ok"}`);
}
