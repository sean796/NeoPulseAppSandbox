/**
 * Rank Blind Magic top GSC blogs, rewrite for Custom Shades of London (London/Exeter ON),
 * publish 2 posts for the current month via Pulse WordPress API (no Neo MCP, no CSOL GSC/Semrush).
 *
 * Usage:
 *   node scripts/custom-shades-of-london/seed-blogs-from-blind-magic.mjs --dry-run
 *   node scripts/custom-shades-of-london/seed-blogs-from-blind-magic.mjs
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { openRouterKey } = require("../load-root-openrouter-env.cjs");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = join(ROOT, "test-output");
const MANIFEST_PATH = join(OUT_DIR, "csol-blind-magic-blog-seed-manifest.json");
const DATA_ROOT =
  process.env.NEO_PULSE_DATA_DIR ||
  "C:\\Users\\Sean Craig\\wpstaging\\sites\\neopulse.local\\data\\php\\neo-pulse-data";
const WORKSPACE_PATH = join(DATA_ROOT, "teams", "1", "workspace.json");
const MANAGER_SETTINGS_PATH = join(DATA_ROOT, "manager-settings.json");
const EMAIL_KEYS_PATH = join(DATA_ROOT, "email-worker-keys.json");
const ENV_PATH = join(ROOT, ".env");

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const eq = t.indexOf("=");
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const DOTENV = loadDotEnv(ENV_PATH);

const BLIND_MAGIC_HOST = "blindmagic.com";
const CSOL_HOST = "customshadesoflondon.ca";
const CSOL_NAME = "Custom Shades of London";
const DEFAULT_LIMIT = 2;

const BANNED = ["blind magic", "blindmagic", "edmonton", "alberta", "blindmagic.com"];

const SYSTEM = `You rewrite one Blind Magic blog into a NEW blog for ${CSOL_NAME}.
Return JSON only:
{"title":"...","slug":"kebab-case-slug","excerpt":"...","focusKeyword":"...","html":"..."}

Rules:
- Brand everywhere: ${CSOL_NAME}. Market: London and Exeter, Ontario (Canada). Not Edmonton, not Alberta, not Blind Magic.
- COMPLETE FROM-SCRATCH REWRITE. Fresh structure, sentences, and headings. Do not paraphrase sentence-by-sentence.
- Crawlable HTML: h2, p, ul/ol, table, a. No script tags. No Blind Magic URLs.
- Keep useful product/education facts that still fit window treatments / custom shades, reframed for London and Exeter Ontario homeowners.
- focusKeyword: natural local or product phrase (no Blind Magic).
- slug: lowercase kebab-case, no brand spam.
- Never invent rankings, review counts, or GSC stats.`;

const DRY = process.argv.includes("--dry-run");
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice(8) || DEFAULT_LIMIT) || DEFAULT_LIMIT;
const API_BASE = (
  process.argv.find((a) => a.startsWith("--api-base="))?.slice(11) ||
  process.env.NEO_PULSE_API_BASE ||
  "http://127.0.0.1:8080"
)
  .trim()
  .replace(/\/+$/, "");

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Trailing N full calendar months ending at the last completed month (GSC rejects future endDate). */
function trailingMonths(monthCount, reference = new Date()) {
  const end = new Date(reference.getFullYear(), reference.getMonth(), 0);
  const start = new Date(end.getFullYear(), end.getMonth() - (monthCount - 1), 1);
  return { startDate: ymd(start), endDate: ymd(end) };
}

function normalizeHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function isBlogUrl(url) {
  try {
    const p = new URL(url).pathname.toLowerCase();
    return p.includes("/blog/") || p.includes("/posts/") || p.includes("/article/");
  } catch {
    return false;
  }
}

function normKey(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasBanned(text) {
  const t = String(text || "").toLowerCase();
  return BANNED.find((b) => t.includes(b)) || null;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function loadWorkspaceSites() {
  if (!existsSync(WORKSPACE_PATH)) return [];
  const doc = readJson(WORKSPACE_PATH);
  const raw = doc?.snapshot?.keys?.wordpress_sites ?? doc?.keys?.wordpress_sites;
  if (typeof raw !== "string" || !raw.trim()) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function loadSitesWithPasswords() {
  const local = loadWorkspaceSites().filter((s) => String(s.appPassword || "").trim());
  if (local.length) return { source: "workspace.json", sites: local };
  try {
    const { loadHubSites } = await import("../../wordpress-plugins/deploy/lib/hub-sites.js");
    const hub = await loadHubSites();
    const list = Array.isArray(hub) ? hub : hub.sites || [];
    return { source: "hub-sites", sites: list };
  } catch (err) {
    throw new Error(
      `No WordPress credentials in ${WORKSPACE_PATH} and hub sites unavailable: ${err?.message || err}`,
    );
  }
}

function loadOpenRouterKey() {
  const fromEnv =
    process.env.OPENROUTER_API_KEY?.trim() ||
    process.env.OPEN_ROUTER_API_KEY?.trim() ||
    process.env.VITE_OPENROUTER_API_KEY?.trim() ||
    (typeof openRouterKey === "string" ? openRouterKey.trim() : "");
  if (fromEnv) return fromEnv;
  if (existsSync(EMAIL_KEYS_PATH)) {
    const keys = readJson(EMAIL_KEYS_PATH);
    const k = String(keys.openRouterApiKey || "").trim();
    if (k) return k;
  }
  if (existsSync(MANAGER_SETTINGS_PATH)) {
    const mgr = readJson(MANAGER_SETTINGS_PATH);
    const k = String(mgr?.snapshot?.keys?.["openrouter-api-key"] || "").trim();
    if (k) return k;
  }
  throw new Error("OPENROUTER_API_KEY is required (env, email-worker-keys, or manager-settings)");
}

function pulseHostToken() {
  return (
    process.env.PULSE_HOST_API_TOKEN?.trim() ||
    DOTENV.PULSE_HOST_API_TOKEN?.trim() ||
    ""
  );
}

async function apiJson(path, body) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const hostToken = pulseHostToken();
  if (hostToken) headers["X-Pulse-Host-Api-Token"] = hostToken;
  const res = await fetch(`${API_BASE}/api${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${path} non-JSON ${res.status}: ${text.slice(0, 300)}`);
  }
  if (!res.ok || data.success === false || (data.error && data.ok === false)) {
    throw new Error(`${path} failed: ${data.error || data.message || res.status}`);
  }
  if (data.error && !data.success && !data.pages && !data.posts && !data.resolved) {
    throw new Error(`${path} failed: ${data.error}`);
  }
  return data;
}

function pickSite(sites, hostNeedle) {
  const hit = sites.find((s) => normalizeHost(s.siteUrl || "").includes(hostNeedle));
  if (!hit) throw new Error(`Site not found in hub sites.json for host ${hostNeedle}`);
  if (!String(hit.appPassword || "").trim()) {
    throw new Error(`Missing appPassword for ${hit.name || hostNeedle} (${hit.siteUrl})`);
  }
  if (!String(hit.username || "").trim()) {
    throw new Error(`Missing username for ${hit.name || hostNeedle}`);
  }
  return hit;
}

function novemberSchedule(now = new Date()) {
  if (now.getMonth() !== 10) {
    // Script is for this November package; still schedule second post ~14d ahead inside calendar month when possible.
  }
  const post1 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 15, 0, 0));
  let post2Day = now.getUTCDate() + 14;
  const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  if (post2Day > lastDay) post2Day = lastDay;
  if (post2Day <= now.getUTCDate()) post2Day = Math.min(lastDay, now.getUTCDate() + 1);
  const post2 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), post2Day, 15, 0, 0));
  return [
    { status: "publish", date_gmt: post1.toISOString() },
    { status: "future", date_gmt: post2.toISOString() },
  ];
}

async function rewritePost(apiKey, model, source) {
  const user = JSON.stringify({
    targetBrand: CSOL_NAME,
    market: "London and Exeter, Ontario",
    source: {
      url: source.url,
      title: source.title,
      excerpt: source.excerpt,
      html: String(source.content || "").slice(0, 28000),
    },
  });
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://neodigital.ca/neo-pulse/",
      "X-Title": "NEO Pulse CSOL Blind Magic blog seed",
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 400)}`);
  const parsed = JSON.parse(body);
  const content = parsed?.choices?.[0]?.message?.content;
  const raw = typeof content === "string" ? JSON.parse(content) : content;
  const title = String(raw?.title || "").trim();
  const slug = String(raw?.slug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const excerpt = String(raw?.excerpt || "").trim();
  const focusKeyword = String(raw?.focusKeyword || "").trim();
  const html = String(raw?.html || "").trim();
  if (!title || !slug || !excerpt || !focusKeyword || !html) {
    throw new Error(`Rewrite missing fields for ${source.url}`);
  }
  for (const field of [title, slug, excerpt, focusKeyword, html]) {
    const hit = hasBanned(field);
    if (hit) throw new Error(`Rewrite leaked banned token "${hit}" for ${source.url}`);
  }
  return { title, slug, excerpt, focusKeyword, html };
}

async function main() {
  const { source: sitesSource, sites: list } = await loadSitesWithPasswords();
  const blind = pickSite(list, BLIND_MAGIC_HOST);
  const csol = pickSite(list, CSOL_HOST);

  const range = trailingMonths(12);
  const top = await apiJson("/gsc/top-pages", {
    siteUrl: blind.siteUrl,
    startDate: range.startDate,
    endDate: range.endDate,
    limit: 100,
  });
  const pages = Array.isArray(top.pages) ? top.pages : [];
  const ranked = pages
    .filter((p) => isBlogUrl(p.url))
    .sort((a, b) => (Number(b.clicks) || 0) - (Number(a.clicks) || 0) || (Number(b.impressions) || 0) - (Number(a.impressions) || 0));
  if (!ranked.length) throw new Error("No Blind Magic blog URLs in GSC top-pages");

  const schedule = novemberSchedule(new Date());

  const inventory = await apiJson("/wordpress/get-published-posts", {
    siteUrl: csol.siteUrl,
    username: csol.username,
    appPassword: csol.appPassword,
    limit: 100,
    offset: 0,
  });
  const existing = Array.isArray(inventory.posts) ? inventory.posts : [];
  const existingKeys = new Set(
    existing.flatMap((p) => [normKey(p.slug), normKey(p.title?.rendered || p.title)]).filter(Boolean),
  );

  const orKey = loadOpenRouterKey();
  const model = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";
  const rows = [];
  const skipped = [];
  let accepted = 0;

  for (const pick of ranked) {
    if (accepted >= LIMIT) break;

    const resolved = await apiJson("/wordpress/resolve-urls", {
      siteUrl: blind.siteUrl,
      username: blind.username,
      appPassword: blind.appPassword,
      urls: [pick.url],
      knownEndpoint: "posts",
    });
    const obj = (resolved.resolved || [])[0];
    if (!obj?.id) throw new Error(`Could not resolve Blind Magic URL ${pick.url}`);

    const contentRes = await apiJson("/wordpress/get-post-content", {
      siteUrl: blind.siteUrl,
      username: blind.username,
      appPassword: blind.appPassword,
      resolvedObjects: [{ id: obj.id, subtype: obj.subtype || "post" }],
    });
    const post = (contentRes.posts || [])[0];
    if (!post?.content) throw new Error(`Empty content for ${pick.url}`);

    const sourceSlugKey = normKey(post.slug);
    const sourceTitleKey = normKey(post.title);
    if (existingKeys.has(sourceSlugKey) || existingKeys.has(sourceTitleKey)) {
      skipped.push({ sourceUrl: pick.url, clicks: pick.clicks, skipped: "csol_inventory_duplicate" });
      continue;
    }

    const rewrite = await rewritePost(orKey, model, {
      url: pick.url,
      title: post.title,
      excerpt: post.excerpt,
      content: post.content,
    });
    if (existingKeys.has(normKey(rewrite.slug)) || existingKeys.has(normKey(rewrite.title))) {
      skipped.push({
        sourceUrl: pick.url,
        clicks: pick.clicks,
        skipped: "csol_rewrite_duplicate",
        rewrite: { title: rewrite.title, slug: rewrite.slug },
      });
      continue;
    }

    const sched = schedule[accepted] || schedule[schedule.length - 1];
    let upload = null;
    if (!DRY) {
      upload = await apiJson("/wordpress/create-post", {
        siteUrl: csol.siteUrl,
        username: csol.username,
        appPassword: csol.appPassword,
        title: rewrite.title,
        content: rewrite.html,
        excerpt: rewrite.excerpt,
        status: sched.status,
        date_gmt: sched.date_gmt,
        slug: rewrite.slug,
        postTypeEndpoint: "posts",
      });
      if (!upload?.success || !(upload.postId || upload.id || upload.link)) {
        throw new Error(`create-post failed for ${rewrite.slug}: ${JSON.stringify(upload).slice(0, 400)}`);
      }
      existingKeys.add(normKey(rewrite.slug));
      existingKeys.add(normKey(rewrite.title));
    }

    rows.push({
      sourceUrl: pick.url,
      clicks: pick.clicks,
      impressions: pick.impressions,
      schedule: sched,
      rewrite: { title: rewrite.title, slug: rewrite.slug, excerpt: rewrite.excerpt, focusKeyword: rewrite.focusKeyword },
      upload: DRY
        ? { dryRun: true }
        : {
            id: upload.postId || upload.id,
            link: upload.link,
            status: upload.status || sched.status,
            date_gmt: sched.date_gmt,
          },
    });
    accepted += 1;
  }

  if (accepted < LIMIT) {
    throw new Error(`Only produced ${accepted} of ${LIMIT} CSOL posts (check inventory duplicates / GSC blogs)`);
  }

  const manifest = {
    ok: true,
    dryRun: DRY,
    apiBase: API_BASE,
    sitesSource,
    range,
    limit: LIMIT,
    blindMagic: { name: blind.name, siteUrl: blind.siteUrl },
    csol: { name: csol.name, siteUrl: csol.siteUrl },
    model,
    rows,
    skipped,
    generatedAt: new Date().toISOString(),
  };
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.message || err) }, null, 2));
  process.exit(1);
});
