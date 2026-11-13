/**
 * Add Custom Shades of London to local neopulse property mirror + team workspace snapshot.
 * Usage: node scripts/add-custom-shades-of-london-property.mjs [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry-run");
const DATA_ROOT = path.join(
  process.env.NEO_PULSE_DATA_DIR || "C:\\Users\\Sean Craig\\wpstaging\\sites\\neopulse.local\\data\\php\\neo-pulse-data",
);
const SITES_PATH = path.join(DATA_ROOT, "sites.json");
const WORKSPACE_PATH = path.join(DATA_ROOT, "teams", "1", "workspace.json");
const MANAGER_SETTINGS_PATH = path.join(DATA_ROOT, "manager-settings.json");

const SITE_ID = "wp-1791924906059-17";
const SITE_URL = "https://www.customshadesoflondon.ca/";
const POST_SITEMAP = "https://www.customshadesoflondon.ca/post-sitemap.xml";
const PAGE_SITEMAP = "https://www.customshadesoflondon.ca/page-sitemap.xml";
const ENTITY_SITEMAP = "https://www.customshadesoflondon.ca/location-sitemap.xml";
const OTHER_SITEMAPS = [
  "https://www.customshadesoflondon.ca/hunter-douglas-sitemap.xml",
  "https://www.customshadesoflondon.ca/promotion-sitemap.xml",
  "https://www.customshadesoflondon.ca/shop-by-room-sitemap.xml",
  "https://www.customshadesoflondon.ca/window-shape-sitemap.xml",
];

function mainSitemaps() {
  const childSitemaps = [POST_SITEMAP, PAGE_SITEMAP, ENTITY_SITEMAP, ...OTHER_SITEMAPS];
  return {
    type: "index",
    mainSitemapUrl: "https://www.customshadesoflondon.ca/sitemap_index.xml",
    childSitemaps,
    endpoints: {
      [ENTITY_SITEMAP]: "location",
      [POST_SITEMAP]: "posts",
      [PAGE_SITEMAP]: "pages",
    },
    // Location CPT pages are tagged Locations (+ entity role for editorial/SAP counts).
    childTagsByUrl: {
      [POST_SITEMAP]: { roles: ["posts"], custom: [] },
      [PAGE_SITEMAP]: { roles: ["pages"], custom: [] },
      [ENTITY_SITEMAP]: { roles: ["entity"], custom: ["Locations"] },
    },
  };
}

function buildSite(appPassword) {
  const now = Date.now();
  return {
    id: SITE_ID,
    name: "Custom Shades of London",
    siteUrl: SITE_URL,
    username: "sean@neodigital.ca",
    appPassword,
    connectedAt: now,
    lastTested: now,
    connectionStatus: "success",
    enabled: true,
    entitySitemapUrl: ENTITY_SITEMAP,
    manualEndpoint: "location",
    customSitemapTagLabels: ["Locations"],
    editorialContentPackage: "standard",
    benchmarkCustomTag: "Window treatments",
    optimizationPackage: "basic",
    wpEngineAccountId: "ed80c554-dc67-4796-a9b8-805665019c16",
    primaryLocalKeyword: "blinds near me",
    serviceCity: "London",
    serviceState: "Ontario",
    serviceCountry: "Canada",
    sitemaps: mainSitemaps(),
    locations: [
      {
        id: `loc-${SITE_ID}-default`,
        name: "Custom Shades of London - London Showroom",
        address: "1422 Fanshawe Park Rd W #3A",
        city: "London",
        state: "Ontario",
        country: "Canada",
        zip: "N6G 0A4",
        phone: "(519) 601-4443",
        isDefault: true,
      },
      {
        id: `loc-${SITE_ID}-extra-1`,
        name: "Custom Shades of London - Exeter Showroom",
        address: "415 Main St S",
        city: "Exeter",
        state: "Ontario",
        country: "Canada",
        zip: "N0M 1S1",
        phone: "(519) 235-2444",
        isDefault: false,
      },
    ],
    napInfo: {
      name: "Custom Shades of London",
      address: "1422 Fanshawe Park Rd W #3A, London, Ontario N6G 0A4",
      phone: "(519) 601-4443",
      locations: [
        {
          id: `loc-${SITE_ID}-default`,
          name: "London Showroom",
          address: "1422 Fanshawe Park Rd W #3A",
          city: "London",
          state: "Ontario",
          country: "Canada",
          zip: "N6G 0A4",
          phone: "(519) 601-4443",
          isDefault: true,
        },
        {
          id: `loc-${SITE_ID}-extra-1`,
          name: "Exeter Showroom",
          address: "415 Main St S",
          city: "Exeter",
          state: "Ontario",
          country: "Canada",
          zip: "N0M 1S1",
          phone: "(519) 235-2444",
          isDefault: false,
        },
      ],
    },
    clientLogoUrl: "https://www.customshadesoflondon.ca/wp-content/uploads/2026/10/CSOO-Favicon-300x300.png",
    clientLogoSource: "og:image",
    clientLogoFetchedAt: now,
  };
}

function stripSecrets(site) {
  const { appPassword, pluginAccessToken, slackIncomingWebhookUrl, ...rest } = site;
  return rest;
}

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function saveJson(p, data) {
  fs.writeFileSync(p, `${JSON.stringify(data, null, 4)}\n`, "utf8");
}

async function verifyAppPassword(appPassword) {
  const token = Buffer.from(`sean@neodigital.ca:${appPassword.replace(/\s+/g, "")}`, "utf8").toString("base64");
  const res = await fetch(`${SITE_URL}wp-json/wp/v2/users/me`, {
    headers: { Authorization: `Basic ${token}` },
  });
  return res.ok;
}

async function resolveAppPassword(workspaceSites) {
  const fromEnv = String(process.env.CSOL_APP_PASSWORD || process.env.APP_PASSWORD || "").trim();
  if (fromEnv) {
    if (await verifyAppPassword(fromEnv)) return fromEnv.replace(/\s+/g, " ").trim();
    // WP app passwords are often stored with spaces; try as provided too.
    if (await verifyAppPassword(fromEnv.replace(/\s+/g, " "))) return fromEnv.replace(/\s+/g, " ").trim();
  }

  const existing = workspaceSites.find((s) => (s.siteUrl || "").includes("customshadesoflondon"));
  if (existing?.appPassword?.trim()) return existing.appPassword.trim();

  for (const row of workspaceSites) {
    const pw = row.appPassword?.trim();
    if (!pw) continue;
    if (await verifyAppPassword(pw)) {
      console.log(`Using verified app password already on file (${row.name}).`);
      return pw;
    }
  }
  throw new Error(
    "No working app password for customshadesoflondon.ca. Set CSOL_APP_PASSWORD or add an Application Password for sean@neodigital.ca, then re-run.",
  );
}

function loadWorkspaceSites(wsDoc) {
  const raw = wsDoc?.snapshot?.keys?.wordpress_sites ?? wsDoc?.keys?.wordpress_sites;
  if (typeof raw !== "string" || !raw.trim()) return [];
  return JSON.parse(raw);
}

function writeWorkspaceSites(wsDoc, sites) {
  if (!wsDoc.snapshot) wsDoc.snapshot = { version: 1, collectedAt: new Date().toISOString(), keys: {} };
  if (!wsDoc.snapshot.keys) wsDoc.snapshot.keys = {};
  wsDoc.snapshot.keys.wordpress_sites = JSON.stringify(sites);
  wsDoc.updatedAt = new Date().toISOString();
}

function upsertByIdOrHost(list, site) {
  const idx = list.findIndex(
    (s) => s.id === SITE_ID || (s.siteUrl || "").includes("customshadesoflondon"),
  );
  if (idx >= 0) {
    const prev = list[idx];
    list[idx] = {
      ...prev,
      ...site,
      id: prev.id || site.id,
      appPassword: site.appPassword || prev.appPassword,
    };
    return "updated";
  }
  list.push(site);
  return "added";
}

async function run() {
  if (!fs.existsSync(SITES_PATH)) throw new Error(`Missing ${SITES_PATH}`);
  const sitesDoc = loadJson(SITES_PATH);
  const sites = Array.isArray(sitesDoc.sites) ? sitesDoc.sites : [];

  let workspaceSites = [];
  if (fs.existsSync(WORKSPACE_PATH)) {
    workspaceSites = loadWorkspaceSites(loadJson(WORKSPACE_PATH));
  }

  const appPassword = await resolveAppPassword(workspaceSites);
  const site = buildSite(appPassword);

  if (DRY) {
    console.log("DRY RUN would upsert", site.name, site.id);
    return;
  }

  const publicAction = upsertByIdOrHost(sites, stripSecrets(site));
  saveJson(SITES_PATH, { ...sitesDoc, sites });
  console.log(`${publicAction} public mirror`, SITES_PATH);

  if (fs.existsSync(WORKSPACE_PATH)) {
    const ws = loadJson(WORKSPACE_PATH);
    const list = loadWorkspaceSites(ws);
    const action = upsertByIdOrHost(list, site);
    writeWorkspaceSites(ws, list);
    saveJson(WORKSPACE_PATH, ws);
    console.log(`${action} teams/1/workspace.json wordpress_sites`);
  }

  if (fs.existsSync(MANAGER_SETTINGS_PATH)) {
    const mgr = loadJson(MANAGER_SETTINGS_PATH);
    const list = loadWorkspaceSites(mgr);
    if (list.length > 0) {
      const action = upsertByIdOrHost(list, site);
      writeWorkspaceSites(mgr, list);
      saveJson(MANAGER_SETTINGS_PATH, mgr);
      console.log(`${action} manager-settings.json wordpress_sites`);
    }
  }

  const ok = await verifyAppPassword(appPassword);
  console.log(ok ? "WP REST auth OK" : "WP REST auth failed after save");
}

run().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
