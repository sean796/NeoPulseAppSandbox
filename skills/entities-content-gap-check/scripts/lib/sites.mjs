/** Load one Integrations site from sites.json. */

import fs from "node:fs";
import path from "node:path";

export function resolveSitesPath(flags = {}) {
  if (typeof flags["sites-path"] === "string" && flags["sites-path"].trim()) {
    return flags["sites-path"].trim();
  }
  const fromEnv = process.env.NEO_PULSE_DATA_ROOT?.trim();
  if (fromEnv) return path.join(fromEnv, "sites.json");
  const candidates = [
    path.resolve(process.cwd(), "neo-pulse-data", "sites.json"),
    path.resolve(process.cwd(), "..", "neo-pulse-data", "sites.json"),
    path.resolve(process.cwd(), "..", "..", "neo-pulse-data", "sites.json"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

export function loadSites(sitesPath) {
  if (!fs.existsSync(sitesPath)) {
    throw new Error(`sites.json not found at ${sitesPath}`);
  }
  const raw = JSON.parse(fs.readFileSync(sitesPath, "utf8"));
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.sites)) return raw.sites;
  throw new Error(`sites.json at ${sitesPath} is not a site list`);
}

export function findSiteById(sites, siteId) {
  const id = String(siteId ?? "").trim();
  if (!id) return null;
  return sites.find((site) => String(site?.id ?? "").trim() === id) ?? null;
}
