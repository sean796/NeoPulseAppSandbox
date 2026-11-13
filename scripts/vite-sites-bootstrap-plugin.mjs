/**
 * Embed the local server sites.json roster into the Vite client bundle so
 * Properties paints with sites on first frame (no empty flash waiting on /api).
 */
import fs from "node:fs";
import path from "node:path";

const VIRTUAL_ID = "virtual:neo-pulse-sites-bootstrap";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

function resolveSitesJsonPath(repoRoot) {
  const fromEnv = String(process.env.NEO_PULSE_DATA_DIR || "").trim();
  if (fromEnv) {
    return path.join(fromEnv, "sites.json");
  }
  try {
    const configPath = path.join(repoRoot, "scripts", "local-wp-staging.config.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      const wpRoot = String(config.wpRoot || "").replace(/\//g, path.sep);
      if (wpRoot) {
        const siteDir = path.dirname(wpRoot);
        return path.join(siteDir, "data", "php", "neo-pulse-data", "sites.json");
      }
    }
  } catch {
    /* fall through */
  }
  return path.join(
    process.env.USERPROFILE || process.env.HOME || "",
    "wpstaging",
    "sites",
    "neopulse.local",
    "data",
    "php",
    "neo-pulse-data",
    "sites.json",
  );
}

function readBootstrapSites(repoRoot) {
  const candidates = [
    resolveSitesJsonPath(repoRoot),
    path.join(repoRoot, "src", "components", "integrations", "default-properties-seed.json"),
  ];
  for (const filePath of candidates) {
    try {
      if (!filePath || !fs.existsSync(filePath)) continue;
      const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const sites = Array.isArray(raw?.sites) ? raw.sites : Array.isArray(raw) ? raw : [];
      if (sites.length > 0) {
        return { sites, source: filePath };
      }
    } catch {
      /* try next */
    }
  }
  return { sites: [], source: null };
}

export function sitesBootstrapPlugin(repoRoot = process.cwd()) {
  return {
    name: "neo-pulse-sites-bootstrap",
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
      return undefined;
    },
    load(id) {
      if (id !== RESOLVED_ID) return undefined;
      // Snapshot once for first paint only. Do NOT watch/full-reload when sites.json
      // updates — storage sync writes that file constantly and was blanking Chrome.
      const { sites, source } = readBootstrapSites(repoRoot);
      return `export const BOOTSTRAP_SITES = ${JSON.stringify(sites)};\nexport const BOOTSTRAP_SOURCE = ${JSON.stringify(source)};\n`;
    },
  };
}
