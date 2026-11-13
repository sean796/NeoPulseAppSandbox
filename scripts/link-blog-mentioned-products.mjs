/**
 * Link relevant hunter-douglas products on every published blog post for a Neo Pulse site.
 * Matching: OpenRouter JSON schema. Writes: Neo MCP custom-fields update-values.
 *
 * Usage:
 *   node scripts/link-blog-mentioned-products.mjs --host=advanceblindsanddrapery.com
 *   node scripts/link-blog-mentioned-products.mjs --host=intheshadeflorida.com
 * Dry run: DRY_RUN=1 node scripts/link-blog-mentioned-products.mjs --host=...
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
const CONN_KEY = "conn_686ecda76f2d2";
const HUB_SLUGS = new Set(["shades", "blinds", "shutters", "drapery"]);
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const MODEL =
  process.env.OPENROUTER_MODEL?.trim() ||
  process.env.NEO_PULSE_AGENT_RESEARCH_MODEL?.trim() ||
  "google/gemini-3.8-flash";

function parseHostArg() {
  const fromEnv = process.env.SITE_HOST?.trim() || process.env.SITE_URL?.trim();
  if (fromEnv) {
    try {
      return new URL(fromEnv.includes("://") ? fromEnv : `https://${fromEnv}`).hostname.replace(/^www\./, "");
    } catch {
      return fromEnv.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    }
  }
  const arg = process.argv.find((a) => a.startsWith("--host="));
  if (arg) return arg.slice("--host=".length).replace(/^www\./, "").split("/")[0];
  throw new Error("Pass --host=example.com or SITE_HOST=example.com");
}

function parseOnlyFuture() {
  return (
    process.env.ONLY_FUTURE === "1" ||
    process.env.ONLY_FUTURE === "true" ||
    process.argv.includes("--only-future")
  );
}

function brandLabel(host) {
  if (host.includes("intheshade")) return "In The Shade (Florida)";
  if (host.includes("advanceblinds")) return "Advance Blinds & Drapery";
  if (host.includes("blindmagic")) return "Blind Magic";
  if (host.includes("blindswest")) return "Blinds West";
  if (host.includes("dminteriors")) return "DM Interiors";
  if (host.includes("eliteshadings")) return "Elite Shutters & Shadings";
  if (host.includes("interiorsbylaura")) return "Interiors by Laura";
  if (host.includes("lindseyblinds")) return "Lindsey Blinds";
  if (host.includes("shutterspot")) return "Shutter Spot";
  if (host.includes("superiorblinds") && !host.includes("tent")) return "Superior Blinds";
  return host;
}

function systemPrompt(brand) {
  return `You match blog posts to Hunter Douglas product pages for ${brand}.
Return JSON only:
{"productIds":[number,...],"rationale":"one short sentence"}

Rules:
- productIds must be a subset of the catalog ids provided in the user message. Never invent ids.
- Pick only products clearly related to the post topic (named products, fabric types, or categories the post discusses).
- Prefer specific product pages over generic hubs (Shades, Blinds, Shutters, Drapery) unless the post is clearly about that whole category.
- Target 3 to 6 products when good matches exist. Fewer is fine. Empty array is fine when nothing fits.
- Do not pick products only because they are popular. Relevance only.`;
}

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

function loadSite(host) {
  const seed = JSON.parse(readFileSync(SEED_PATH, "utf8"));
  const sites = seed.sites || seed;
  const list = Array.isArray(sites)
    ? sites
    : Object.values(sites).filter((s) => s && typeof s === "object" && s.siteUrl);
  const site = list.find((s) => String(s.siteUrl || "").includes(host));
  if (!site?.username || !site?.appPassword) {
    throw new Error(`Missing credentials for ${host} in ${SEED_PATH}`);
  }
  const siteUrl = String(site.siteUrl).replace(/\/$/, "");
  return { ...site, siteUrl, host };
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

async function wpFetchJson(siteUrl, auth, path) {
  const res = await fetch(`${siteUrl}${path}`, {
    headers: { Authorization: auth, Accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`WP ${path} ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function fetchAllPosts(siteUrl, auth) {
  const out = [];
  // Auth REST accepts comma statuses; include scheduled (future) as well as publish.
  const statuses = "publish,future";
  let page = 1;
  for (;;) {
    const batch = await wpFetchJson(
      siteUrl,
      auth,
      `/wp-json/wp/v2/posts?per_page=100&page=${page}&status=${encodeURIComponent(statuses)}&_fields=id,slug,title,link,content,excerpt,status,date`,
    );
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const p of batch) {
      out.push({
        id: p.id,
        slug: p.slug,
        title: p.title?.rendered || "",
        link: p.link,
        status: p.status || "",
        date: p.date || "",
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

async function fetchProducts(siteUrl, auth) {
  const batch = await wpFetchJson(
    siteUrl,
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

function hubIdsFromCatalog(catalog) {
  return new Set(catalog.filter((p) => HUB_SLUGS.has(String(p.slug || "").toLowerCase())).map((p) => p.id));
}

async function neoMcp(mcpUrl, auth, tool, argumentsObj) {
  const res = await fetch(mcpUrl, {
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

async function currentLinksForPosts(mcpUrl, auth, postIds) {
  const php = await neoMcp(mcpUrl, auth, "neo-mcp_php", {
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
    map[id] = Array.isArray(raw[id])
      ? raw[id].map(Number)
      : Array.isArray(raw[String(id)])
        ? raw[String(id)].map(Number)
        : [];
  }
  return map;
}

async function matchProducts(apiKey, brand, post, catalog, hubIds) {
  const catalogRows = catalog.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    hub: hubIds.has(p.id),
  }));
  const allowed = new Set(catalog.map((p) => p.id));
  const user = JSON.stringify({
    post: { id: post.id, title: post.title, slug: post.slug, text: post.text },
    catalog: catalogRows,
    constraints: {
      min: 0,
      max: 6,
      preferSpecificOverHub: true,
      hubIds: [...hubIds],
    },
  });
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://neodigital.ca/neo-pulse/",
      "X-Title": `NEO Pulse ${brand} blog product links`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt(brand) },
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

async function writeLinks(mcpUrl, auth, postId, productIds) {
  return neoMcp(mcpUrl, auth, "neo-mcp_custom-fields", {
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
  const host = parseHostArg();
  const brand = brandLabel(host);
  const site = loadSite(host);
  const mcpUrl = `${site.siteUrl}/wp-json/neo-mcp/v1/mcp`;
  const auth = basicAuthHeader(site.username, site.appPassword);
  const apiKey = loadOpenRouterKey();
  mkdirSync(OUT_DIR, { recursive: true });
  const tag = host.replace(/\./g, "-");

  console.log(`[link-products] site=${host} brand=${brand} dryRun=${DRY_RUN} model=${MODEL}`);

  const onlyFuture = parseOnlyFuture();
  const [allPosts, products] = await Promise.all([
    fetchAllPosts(site.siteUrl, auth),
    fetchProducts(site.siteUrl, auth),
  ]);
  const posts = onlyFuture ? allPosts.filter((p) => p.status === "future") : allPosts;
  const hubIds = hubIdsFromCatalog(products);
  const futureCount = posts.filter((p) => p.status === "future").length;
  const publishCount = posts.filter((p) => p.status === "publish").length;
  console.log(
    `[link-products] posts=${posts.length} (publish=${publishCount} future=${futureCount}${onlyFuture ? " only-future" : ""}) products=${products.length} hubs=${[...hubIds].join(",") || "none"}`,
  );
  if (!posts.length) throw new Error(onlyFuture ? "No scheduled (future) posts" : "No publish/future posts");
  if (!products.length) throw new Error("No hunter-douglas products");

  console.log("[link-products] reading existing links…");
  const beforeLinks = await currentLinksForPosts(
    mcpUrl,
    auth,
    posts.map((p) => p.id),
  );
  const beforeLinked = posts.filter((p) => (beforeLinks[p.id] || []).length > 0).length;
  console.log(`[link-products] before: ${beforeLinked}/${posts.length} posts already linked`);

  const results = [];
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    process.stdout.write(`[match ${i + 1}/${posts.length}] ${post.id} ${post.slug}… `);
    try {
      const match = await matchProducts(apiKey, brand, post, products, hubIds);
      const row = {
        id: post.id,
        slug: post.slug,
        title: stripHtml(post.title),
        link: post.link,
        postStatus: post.status,
        date: post.date,
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
        const written = await writeLinks(mcpUrl, auth, post.id, match.productIds);
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
        mcpUrl,
        auth,
        posts.map((p) => p.id),
      );
  const afterLinked = posts.filter((p) => (afterLinks[p.id] || []).length > 0).length;
  const written = results.filter((r) => r.status === "written").length;
  const skipped = results.filter((r) => r.status === "skipped_empty").length;
  const errors = results.filter((r) => r.status === "error").length;

  const summary = {
    site: host,
    brand,
    dryRun: DRY_RUN,
    model: MODEL,
    posts: posts.length,
    publishCount,
    futureCount,
    products: products.length,
    beforeLinked,
    afterLinked,
    written,
    skipped,
    errors,
    generatedAt: new Date().toISOString(),
    results,
  };

  const outPath = join(OUT_DIR, `${tag}-blog-product-links.json`);
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
