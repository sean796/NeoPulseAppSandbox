/**
 * Backfill primaryLocalKeyword (short-tail "near me"), locations, and sitemaps
 * for every Integrations property in seed + local sites.json.
 *
 * Usage: node scripts/backfill-property-profile-fields.mjs [--dry-run]
 */
import fs from "node:fs";
import https from "node:https";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry-run");
const SEED_PATH = path.join(REPO_ROOT, "src/components/integrations/default-properties-seed.json");
const SITES_PATH = path.join(
  process.env.NEO_PULSE_DATA_DIR ||
    "C:\\Users\\Sean Craig\\wpstaging\\sites\\neopulse.local\\data\\php\\neo-pulse-data",
  "sites.json",
);

const REGION_ABBR = {
  AB: "Alberta",
  BC: "British Columbia",
  MB: "Manitoba",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  NT: "Northwest Territories",
  NS: "Nova Scotia",
  NU: "Nunavut",
  ON: "Ontario",
  PE: "Prince Edward Island",
  QC: "Quebec",
  SK: "Saskatchewan",
  YT: "Yukon",
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

const KEYWORD_BY_HOST = {
  advanceblindsanddrapery: "blinds near me",
  blindmagic: "blinds near me",
  blindswest: "blinds near me",
  customshadesoflondon: "blinds near me",
  dminteriorsanddesign: "blinds near me",
  eliteshadings: "blinds near me",
  intheshadeflorida: "blinds near me",
  interiorsbylaura: "interior designer near me",
  kwbllp: "tax advisors near me",
  lindseyblindsetc: "blinds near me",
  neodigital: "digital marketing near me",
  phoenixpainting: "painters near me",
  "posh-outdoors": "glamping near me",
  shutterspot: "blinds near me",
  superiorblinds: "blinds near me",
  superiortentrentals: "tent rental near me",
  tailoredinteriors: "interior designer near me",
  youjunkit: "junk removal near me",
};

function hostLabel(siteUrl) {
  try {
    return new URL(siteUrl).hostname.replace(/^www\./, "").split(".")[0].toLowerCase();
  } catch {
    return "";
  }
}

function shortTailNearMeKeyword(site) {
  const existing = String(site.primaryLocalKeyword || "").trim();
  if (existing) return existing;
  const host = hostLabel(site.siteUrl);
  if (KEYWORD_BY_HOST[host]) return KEYWORD_BY_HOST[host];
  const hay = `${site.name || ""} ${site.siteUrl || ""}`.toLowerCase();
  if (/blind|shade|shutter|drapery|window/.test(hay)) return "blinds near me";
  if (/paint/.test(hay)) return "painters near me";
  if (/junk|dump/.test(hay)) return "junk removal near me";
  if (/tent|rental/.test(hay)) return "tent rental near me";
  if (/kwb|account|cpa|tax/.test(hay)) return "tax advisors near me";
  if (/interior/.test(hay)) return "interior designer near me";
  if (/outdoor|patio|furniture/.test(hay)) return "outdoor furniture near me";
  if (/neo digital|marketing|seo/.test(hay)) return "digital marketing near me";
  return "blinds near me";
}

function normalizeCountry(raw, region) {
  const c = String(raw || "").trim().toUpperCase();
  if (c === "CA" || c === "CANADA") return "Canada";
  if (c === "US" || c === "USA" || c === "UNITED STATES") return "United States";
  const r = String(region || "").trim().toUpperCase();
  if (REGION_ABBR[r] && ["AB", "BC", "MB", "NB", "NL", "NT", "NS", "NU", "ON", "PE", "QC", "SK", "YT"].includes(r)) {
    return "Canada";
  }
  if (REGION_ABBR[r]) return "United States";
  return "";
}

function normalizeRegion(raw, country) {
  const r = String(raw || "").trim();
  if (!r) return "";
  const upper = r.toUpperCase();
  if (REGION_ABBR[upper]) return REGION_ABBR[upper];
  return r;
}

function requestJson(url, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "http:" ? http : https;
    const payload = body == null ? null : Buffer.from(body);
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "http:" ? 80 : 443),
        path: `${u.pathname}${u.search}`,
        method,
        headers: {
          "User-Agent": "NeoPulse-ProfileBackfill",
          Accept: "application/json, text/xml, */*",
          ...headers,
          ...(payload ? { "Content-Length": String(payload.length) } : {}),
        },
        timeout: 25000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({ status: res.statusCode || 0, text });
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error(`timeout ${url}`)));
    if (payload) req.write(payload);
    req.end();
  });
}

function basicAuth(site) {
  const user = String(site.username || "").trim();
  const pass = String(site.appPassword || "").replace(/\s+/g, "");
  if (!user || !pass) return null;
  return Buffer.from(`${user}:${pass}`).toString("base64");
}

async function neoPulseRead(site, operation) {
  const auth = basicAuth(site);
  if (!auth) return null;
  const base = String(site.siteUrl || "").replace(/\/$/, "");
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "neo-pulse_read", arguments: { operation } },
  });
  const res = await requestJson(`${base}/wp-json/neo-mcp/v1/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body,
  });
  if (res.status < 200 || res.status >= 300) return null;
  let parsed;
  try {
    parsed = JSON.parse(res.text);
  } catch {
    return null;
  }
  const text = parsed?.result?.content?.[0]?.text;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function fetchChildSitemaps(siteUrl) {
  const base = String(siteUrl || "").replace(/\/$/, "");
  const indexUrl = `${base}/sitemap_index.xml`;
  const res = await requestJson(indexUrl);
  if (res.status < 200 || res.status >= 300 || !res.text.includes("<loc>")) {
    return { mainSitemapUrl: indexUrl, childSitemaps: [] };
  }
  const childSitemaps = [...res.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
  return { mainSitemapUrl: indexUrl, childSitemaps };
}

function pickEntitySitemap(childSitemaps, siteName) {
  const kids = childSitemaps || [];
  const serviceArea = kids.find((u) => /service-area-sitemap/i.test(u));
  if (serviceArea) return serviceArea;
  // Custom Shades of London rule: prefer service-area; do not force location CPT as entity when service-area exists.
  if (/custom shades of london/i.test(siteName || "")) {
    const loc = kids.find((u) => /location-sitemap/i.test(u));
    return loc || "";
  }
  const location = kids.find((u) => /location-sitemap|locations-sitemap/i.test(u));
  if (location) return location;
  return "";
}

function buildSitemapsPayload(mainSitemapUrl, childSitemaps, entitySitemapUrl) {
  const endpoints = {};
  for (const url of childSitemaps) {
    if (/post-sitemap/i.test(url)) endpoints[url] = "posts";
    else if (/page-sitemap/i.test(url)) endpoints[url] = "pages";
    else if (/service-area-sitemap/i.test(url)) endpoints[url] = "service-area";
    else if (/location-sitemap|locations-sitemap/i.test(url)) endpoints[url] = "location";
  }
  if (entitySitemapUrl && !endpoints[entitySitemapUrl]) {
    endpoints[entitySitemapUrl] = /service-area/i.test(entitySitemapUrl) ? "service-area" : "location";
  }
  return {
    type: "index",
    mainSitemapUrl,
    childSitemaps,
    endpoints,
    detectedAt: Date.now(),
  };
}

function fixCityTypo(city) {
  const c = String(city || "").trim();
  if (/^pheonix$/i.test(c)) return "Phoenix";
  return c;
}

function locationsFromBusiness(site, business, listed) {
  const addr = business?.address || {};
  const city = fixCityTypo(addr.city || "");
  const regionRaw = addr.region || "";
  const country = normalizeCountry(addr.country, regionRaw);
  const state = normalizeRegion(regionRaw, country);
  const phone =
    (Array.isArray(business?.phones) && business.phones[0]?.number) ||
    business?.phone ||
    "";
  const street = String(addr.street || "").trim();
  const zip = String(addr.postal_code || "").trim();

  const out = [];
  if (city || state || street) {
    out.push({
      id: `loc-${site.id}-default`,
      name: business?.name || site.name,
      address: street,
      city,
      state,
      country: country || undefined,
      zip,
      phone: String(phone || "").trim(),
      isDefault: true,
    });
  }

  const rows = Array.isArray(listed?.locations) ? listed.locations : [];
  for (const row of rows) {
    if (row?.kind === "service_area") continue;
    const rowCity = fixCityTypo(row?.address?.city || "");
    const rowRegion = row?.address?.region || "";
    const rowCountry = normalizeCountry(row?.address?.country, rowRegion) || country;
    const rowState = normalizeRegion(rowRegion, rowCountry);
    if (!rowCity && !rowState && !row?.address?.street) continue;
    if (city && rowCity && rowCity.toLowerCase() === city.toLowerCase() && rowState === state) continue;
    out.push({
      id: `loc-${site.id}-${row.id || out.length}`,
      name: row.title || row.name || site.name,
      address: String(row?.address?.street || "").trim(),
      city: rowCity,
      state: rowState,
      country: rowCountry || undefined,
      zip: String(row?.address?.postal_code || "").trim(),
      phone: String(row.phone || phone || "").trim(),
      isDefault: false,
    });
  }

  // Keep existing non-empty seed locations if Neo Pulse returned nothing useful.
  if (!out.length && Array.isArray(site.locations) && site.locations.length) {
    return site.locations.map((loc, idx) => ({
      ...loc,
      city: fixCityTypo(loc.city),
      isDefault: idx === 0 ? true : Boolean(loc.isDefault),
    }));
  }
  if (out.length) out[0].isDefault = true;
  return out;
}

function hostKey(siteUrl) {
  try {
    return new URL(siteUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return String(siteUrl || "").toLowerCase();
  }
}

async function enrichSite(site) {
  const keyword = shortTailNearMeKeyword(site);
  let business = null;
  let listed = null;
  try {
    business = await neoPulseRead(site, "get-business-details");
  } catch (e) {
    console.warn(`  business details fail: ${site.name}: ${e.message}`);
  }
  try {
    listed = await neoPulseRead(site, "list-locations");
  } catch (e) {
    console.warn(`  list-locations fail: ${site.name}: ${e.message}`);
  }

  let sitemapMeta = { mainSitemapUrl: "", childSitemaps: [] };
  try {
    sitemapMeta = await fetchChildSitemaps(site.siteUrl);
  } catch (e) {
    console.warn(`  sitemap fail: ${site.name}: ${e.message}`);
  }

  const locations = locationsFromBusiness(site, business, listed);
  const entitySitemapUrl =
    site.entitySitemapUrl ||
    pickEntitySitemap(sitemapMeta.childSitemaps, site.name) ||
    undefined;
  const sitemaps =
    sitemapMeta.childSitemaps.length > 0
      ? buildSitemapsPayload(sitemapMeta.mainSitemapUrl, sitemapMeta.childSitemaps, entitySitemapUrl)
      : site.sitemaps;

  const primary = locations.find((l) => l.isDefault) || locations[0];
  const patch = {
    primaryLocalKeyword: keyword,
    locations,
    ...(primary?.city ? { serviceCity: primary.city } : {}),
    ...(primary?.state ? { serviceState: primary.state } : {}),
    ...(primary?.country ? { serviceCountry: primary.country } : {}),
    ...(entitySitemapUrl ? { entitySitemapUrl } : {}),
    ...(sitemaps ? { sitemaps } : {}),
  };

  if (business?.name || locations.length) {
    patch.napInfo = {
      ...(site.napInfo || {}),
      name: business?.name || site.napInfo?.name || site.name,
      address: primary
        ? [primary.address, primary.city, primary.state, primary.zip].filter(Boolean).join(", ")
        : site.napInfo?.address,
      phone: primary?.phone || site.napInfo?.phone || "",
      locations,
    };
  }

  return { ...site, ...patch };
}

function writeJson(filePath, data) {
  if (DRY) {
    console.log(`[dry-run] would write ${filePath}`);
    return;
  }
  fs.writeFileSync(filePath, `${JSON.stringify(data)}\n`, "utf8");
  console.log(`wrote ${filePath}`);
}

async function main() {
  const seed = JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));
  const sitesFile = JSON.parse(fs.readFileSync(SITES_PATH, "utf8"));
  const mirrorSites = Array.isArray(sitesFile) ? sitesFile : sitesFile.sites || [];

  const enrichedSeed = [];
  for (const site of seed.sites) {
    console.log(`\n=== ${site.name} ===`);
    const next = await enrichSite(site);
    console.log(
      JSON.stringify({
        keyword: next.primaryLocalKeyword,
        city: next.locations?.[0]?.city || null,
        state: next.locations?.[0]?.state || null,
        locs: next.locations?.length || 0,
        entity: next.entitySitemapUrl || null,
        children: next.sitemaps?.childSitemaps?.length || 0,
      }),
    );
    enrichedSeed.push(next);
  }

  const byHost = new Map(enrichedSeed.map((s) => [hostKey(s.siteUrl), s]));
  const enrichedMirror = mirrorSites.map((row) => {
    const src = byHost.get(hostKey(row.siteUrl));
    if (!src) return row;
    return {
      ...row,
      primaryLocalKeyword: src.primaryLocalKeyword || row.primaryLocalKeyword,
      locations: src.locations?.length ? src.locations : row.locations,
      napInfo: src.napInfo || row.napInfo,
      serviceCity: src.serviceCity || row.serviceCity,
      serviceState: src.serviceState || row.serviceState,
      serviceCountry: src.serviceCountry || row.serviceCountry,
      entitySitemapUrl: src.entitySitemapUrl || row.entitySitemapUrl,
      sitemaps: src.sitemaps || row.sitemaps,
    };
  });

  writeJson(SEED_PATH, { ...seed, sites: enrichedSeed });
  if (Array.isArray(sitesFile)) writeJson(SITES_PATH, enrichedMirror);
  else writeJson(SITES_PATH, { ...sitesFile, sites: enrichedMirror });

  const missingKw = enrichedSeed.filter((s) => !s.primaryLocalKeyword);
  const missingLoc = enrichedSeed.filter((s) => !(s.locations && s.locations.length));
  const missingSm = enrichedSeed.filter((s) => !(s.sitemaps?.childSitemaps?.length > 0));
  console.log("\nSummary");
  console.log(`keywords set: ${enrichedSeed.length - missingKw.length}/${enrichedSeed.length}`);
  console.log(`locations set: ${enrichedSeed.length - missingLoc.length}/${enrichedSeed.length}`);
  console.log(`sitemaps set: ${enrichedSeed.length - missingSm.length}/${enrichedSeed.length}`);
  if (missingLoc.length) console.log("missing locations:", missingLoc.map((s) => s.name).join(", "));
  if (missingSm.length) console.log("missing sitemaps:", missingSm.map((s) => s.name).join(", "));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
