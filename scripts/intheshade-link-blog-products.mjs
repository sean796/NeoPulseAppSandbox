/**
 * Link relevant hunter-douglas products on every In The Shade blog post.
 * Matching: OpenRouter JSON schema. Writes: Neo MCP custom-fields update-values.
 *
 * Usage: node scripts/intheshade-link-blog-products.mjs
 * Dry run: DRY_RUN=1 node scripts/intheshade-link-blog-products.mjs
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { openRouterKey } = require("./load-root-openrouter-env.cjs");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEED_PATH = join(ROOT, "src/components/integrations/default-properties-seed.json");
const OUT_DIR = join(ROOT, "test-output");
const DATA_ROOT =
  process.env.NEO_PULSE_DATA_DIR ||
  "C:\\Users\\Sean Craig\\wpstaging\\sites\\neopulse.local\\data\\php\\neo-pulse-data";
const MANAGER_SETTINGS_PATH = join(DATA_ROOT, "manager-settings.json");
const EMAIL_KEYS_PATH = join(DATA_ROOT, "email-worker-keys.json");
const SITE_HOST = "intheshadeflorida.com";
const SITE_URL = "https://intheshadeflorida.com";
const MCP_URL = `${SITE_URL}/wp-json/neo-mcp/v1/mcp`;
const CONN_KEY = "conn_686ecda76f2d2";
const HUB_PRODUCT_IDS = new Set([1138, 912, 913, 1137]); // Shades, Blinds, Shutters, Drapery
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const MODEL =
  process.env.OPENROUTER_MODEL?.trim() ||
  process.env.NEO_PULSE_AGENT_RESEARCH_MODEL?.trim() ||
  "google/gemini-3.8-flash";

const SYSTEM = `You match blog posts to Hunter Douglas product pages for In The Shade (Florida).
Return JSON only:
{"productIds":[number,...],"rationale":"one short sentence"}

Rules:
- productIds must be a subset of the catalog ids provided in the user message. Never invent ids.
- Pick only products clearly related to the post topic (named products, fabric types, or categories the post discusses).
- Prefer specific product pages over generic hubs (Shades, Blinds, Shutters, Drapery) unless the post is clearly about that whole category.
- Target 3 to 6 products when good matches exist. Fewer is fine. Empty array is fine when nothing fits.
- Do not pick products only because they are popular. Relevance only.`;

function loadDotEnv() {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
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

function loadOpenRouterKey() {
  const dotenv = loadDotEnv();
  const fromEnv =
    process.env.OPENROUTER_API_KEY?.trim() ||
    process.env.OPEN_ROUTER_API_KEY?.trim() ||
    process.env.VITE_OPENROUTER_API_KEY?.trim() ||
    dotenv.OPENROUTER_API_KEY?.trim() ||
    dotenv.OPEN_ROUTER_API_KEY?.trim() ||
    dotenv.VITE_OPENROUTER_API_KEY?.trim() ||
    (typeof openRouterKey === "string" ? openRouterKey.trim() : "");
  if (fromEnv) return fromEnv;
  if (existsSync(EMAIL_KEYS_PATH)) {
    const keys = JSON.parse(readFileSync(EMAIL_KEYS_PATH, "utf8"));
    const k = String(keys.openRouterApiKey || "").trim();
    if (k) return k;
  }
  if (existsSync(MANAGER_SETTINGS_PATH)) {
    const mgr = JSON.parse(readFileSync(MANAGER_SETTINGS_PATH, "utf8"));
    const k = String(mgr?.snapshot?.keys?.["openrouter-api-key"] || "").trim();
    if (k) return k;
  }
  throw new Error("OPENROUTER_API_KEY is required (env, email-worker-keys, or manager-settings)");
}

function loadShadeSite() {
  const seed = JSON.parse(readFileSync(SEED_PATH, "utf8"));
  const sites = seed.sites || seed;
  const list = Array.isArray(sites)
    ? sites
    : Object.values(sites).filter((s) => s && typeof s === "object" && s.siteUrl);
  const shade = list.find((s) => String(s.siteUrl || "").includes(SITE_HOST));
  if (!shade?.username || !shade?.appPassword) {
    throw new Error(`Missing In The Shade credentials in ${SEED_PATH}`);
  }
  return shade;
}

function basicAuthHeader(username, appPassword) {
  return `Basic ${Buffer.from(`${username}:${appPassword}`, "utf8").toString("base64")}`;
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function wpFetchJson(auth, path) {
  const res = await fetch(`${SITE_URL}${path}`, {
    headers: { Authorization: auth, Accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`WP ${path} ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function fetchAllPosts(auth) {
  const out = [];
  let page = 1;
  for (;;) {
    const batch = await wpFetchJson(
      auth,
      `/wp-json/wp/v2/posts?per_page=100&page=${page}&status=publish&_fields=id,slug,title,link,content,excerpt`,
    );
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const p of batch) {
      out.push({
        id: p.id,
        slug: p.slug,
        title: p.title?.rendered || "",
        link: p.link,
        text: stripHtml(`${p.title?.rendered || ""}. ${p.excerpt?.rendered || ""} ${p.content?.rendered || ""}`).slice(
          0,
          12000,
        ),
      });
    }
    if (batch.length < 100) break;
    page += 1;
  }
  return out;
}

async function fetchProducts(auth) {
  const batch = await wpFetchJson(
    auth,
    `/wp-json/wp/v2/hunter-douglas?per_page=100&status=publish&_fields=id,slug,title,link`,
  );
  return (batch || []).map((p) => ({
    id: p.id,
    slug: p.slug,
    title: stripHtml(p.title?.rendered || ""),
    link: p.link,
  }));
}

async function neoMcp(auth, tool, argumentsObj) {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: tool, arguments: argumentsObj },
    }),
  });
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Neo MCP non-JSON ${res.status}: ${raw.slice(0, 300)}`);
  }
  if (data.error) throw new Error(`Neo MCP error: ${JSON.stringify(data.error)}`);
  const text = (data.result?.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  if (data.result?.isError) throw new Error(`Neo MCP tool error: ${text.slice(0, 500)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function currentLinksForPosts(auth, postIds) {
  const php = await neoMcp(auth, "neo-mcp_php", {
    operation: "run",
    arguments: {
      code: `
global $wpdb;
$ids = json_decode('${JSON.stringify(postIds)}', true);
$map = array();
foreach ($ids as $id) {
  $id = (int) $id;
  $rows = $wpdb->get_col($wpdb->prepare(
    "SELECT b_id FROM {$wpdb->prefix}ndet_links WHERE type=%s AND a_id=%d ORDER BY a_order",
    '${CONN_KEY}',
    $id
  ));
  $map[$id] = array_map('intval', $rows ?: array());
}
return $map;
`,
    },
  });
  const raw = php?.return || php || {};
  const map = {};
  for (const id of postIds) {
    map[id] = Array.isArray(raw[id]) ? raw[id].map(Number) : Array.isArray(raw[String(id)]) ? raw[String(id)].map(Number) : [];
  }
  return map;
}

async function matchProducts(apiKey, post, catalog) {
  const catalogRows = catalog.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    hub: HUB_PRODUCT_IDS.has(p.id),
  }));
  const allowed = new Set(catalog.map((p) => p.id));
  const user = JSON.stringify({
    post: { id: post.id, title: post.title, slug: post.slug, text: post.text },
    catalog: catalogRows,
    constraints: {
      min: 0,
      max: 6,
      preferSpecificOverHub: true,
      hubIds: [...HUB_PRODUCT_IDS],
    },
  });
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://neodigital.ca/neo-pulse/",
      "X-Title": "NEO Pulse In The Shade blog product links",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `${user}\n\nReturn only the JSON object with productIds and rationale.`,
        },
      ],
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 400)}`);
  const parsed = JSON.parse(body);
  const content = parsed?.choices?.[0]?.message?.content;
  const raw = typeof content === "string" ? JSON.parse(content) : content;
  if (!raw || typeof raw !== "object") throw new Error(`Empty match for post ${post.id}`);
  const ids = Array.isArray(raw.productIds) ? raw.productIds.map(Number) : [];
  const valid = [...new Set(ids.filter((id) => allowed.has(id)))].slice(0, 6);
  const rejected = ids.filter((id) => !allowed.has(id));
  if (rejected.length) {
    throw new Error(`Post ${post.id}: invented product ids ${rejected.join(",")}`);
  }
  return {
    productIds: valid,
    rationale: String(raw.rationale || "").trim(),
  };
}

async function writeLinks(auth, postId, productIds) {
  return neoMcp(auth, "neo-mcp_custom-fields", {
    operation: "update-values",
    arguments: {
      post_id: postId,
      values: {
        show_products_on_page: "Yes",
        blinds_mentioned_in_post: productIds,
      },
    },
  });
}

async function main() {
  const shade = loadShadeSite();
  const auth = basicAuthHeader(shade.username, shade.appPassword);
  const apiKey = loadOpenRouterKey();
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`[intheshade] site=${SITE_HOST} dryRun=${DRY_RUN} model=${MODEL}`);

  const [posts, products] = await Promise.all([fetchAllPosts(auth), fetchProducts(auth)]);
  console.log(`[intheshade] posts=${posts.length} products=${products.length}`);
  if (!posts.length) throw new Error("No published posts");
  if (!products.length) throw new Error("No hunter-douglas products");

  console.log("[intheshade] reading existing links…");
  const beforeLinks = await currentLinksForPosts(
    auth,
    posts.map((p) => p.id),
  );
  const beforeLinked = posts.filter((p) => (beforeLinks[p.id] || []).length > 0).length;
  console.log(`[intheshade] before: ${beforeLinked}/${posts.length} posts already linked`);

  const results = [];
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    process.stdout.write(`[match ${i + 1}/${posts.length}] ${post.id} ${post.slug}… `);
    try {
      const match = await matchProducts(apiKey, post, products);
      const row = {
        id: post.id,
        slug: post.slug,
        title: stripHtml(post.title),
        link: post.link,
        beforeIds: beforeLinks[post.id] || [],
        productIds: match.productIds,
        rationale: match.rationale,
        status: "matched",
      };
      if (!match.productIds.length) {
        row.status = "skipped_empty";
        console.log("skip (no match)");
      } else if (DRY_RUN) {
        row.status = "dry_run";
        console.log(`dry-run ids=${match.productIds.join(",")}`);
      } else {
        const written = await writeLinks(auth, post.id, match.productIds);
        row.status = "written";
        row.historyId = written?.history_id ?? null;
        console.log(`wrote ids=${match.productIds.join(",")} history=${row.historyId ?? "-"}`);
      }
      results.push(row);
    } catch (err) {
      const msg = err?.message || String(err);
      console.log(`ERROR ${msg}`);
      results.push({
        id: post.id,
        slug: post.slug,
        title: stripHtml(post.title),
        link: post.link,
        beforeIds: beforeLinks[post.id] || [],
        productIds: [],
        status: "error",
        error: msg,
      });
    }
  }

  const afterLinks = DRY_RUN
    ? beforeLinks
    : await currentLinksForPosts(
        auth,
        posts.map((p) => p.id),
      );
  const afterLinked = posts.filter((p) => (afterLinks[p.id] || []).length > 0).length;
  const written = results.filter((r) => r.status === "written").length;
  const skipped = results.filter((r) => r.status === "skipped_empty").length;
  const errors = results.filter((r) => r.status === "error").length;

  const summary = {
    site: SITE_HOST,
    dryRun: DRY_RUN,
    model: MODEL,
    posts: posts.length,
    products: products.length,
    beforeLinked,
    afterLinked,
    written,
    skipped,
    errors,
    generatedAt: new Date().toISOString(),
    results,
  };

  const outPath = join(OUT_DIR, "intheshade-blog-product-links.json");
  writeFileSync(outPath, JSON.stringify(summary, null, 2), "utf8");

  console.log("\n=== coverage ===");
  console.log(`beforeLinked=${beforeLinked}/${posts.length}`);
  console.log(`afterLinked=${afterLinked}/${posts.length}`);
  console.log(`written=${written} skipped=${skipped} errors=${errors}`);
  console.log(`report=${outPath}`);

  if (errors) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
