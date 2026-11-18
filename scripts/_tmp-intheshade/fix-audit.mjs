/**
 * Apply the Nov 2026 In The Shade content audit.
 * Takedown: draft or trash pages the audit says to unpublish or delete, and 301 them home.
 * Rewrite: OpenRouter applies each remaining page's fixes. Research model only.
 *
 * node scripts/_tmp-intheshade/fix-audit.mjs --takedown-only
 * node scripts/_tmp-intheshade/fix-audit.mjs --rewrite-only --limit=2
 * node scripts/_tmp-intheshade/fix-audit.mjs --rewrite-only
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { openRouterKey } = require("../load-root-openrouter-env.cjs");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = join(ROOT, "src/components/integrations/default-properties-seed.json");
const SITE_URL = "https://intheshadeflorida.com";
const MCP_URL = `${SITE_URL}/wp-json/neo-mcp/v1/mcp`;
const MODEL = "deepseek/deepseek-v4.1-flash";
const STATE = join(DIR, "state");
const args = process.argv.slice(2);
const TAKEDOWN_ONLY = args.includes("--takedown-only");
const REWRITE_ONLY = args.includes("--rewrite-only");
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : 0;
const slugArg = args.find((arg) => arg.startsWith("--slug="));
const ONLY_SLUG = slugArg ? slugArg.split("=")[1] : "";

const SYSTEM = `You correct one page on intheshadeflorida.com for In The Shade, a Hunter Douglas dealer.
Return a JSON object with keys title, content_html, meta_description, focus_keyword, faqs.
faqs is an array of {question, answer}.

Facts you must follow:
- Public name is In The Shade. The only allowed alternate is In the Shade Window Coverings. Never write "In the Shade Window Coverings & Interiors".
- Showrooms: 2460 SE Federal Hwy, Stuart, FL 34994, (772) 223-1212, Mon-Fri 10am-5pm, Sat 10am-3pm, Sun closed. And 860 SE Becker Rd, Port St. Lucie, FL 34984, (772) 607-9911, Mon-Fri 9am-5pm, weekends closed. No other showroom.
- Phone numbers are only those two. 772-220-4949 is wrong.
- Service area is the Treasure Coast around Stuart and Port St. Lucie, including Palm City, Jensen Beach, Hobe Sound, Hutchinson Island, Rio (the Stuart neighborhood), Ocean Breeze, Port Salerno, Sewall's Point, and St. Lucie West. Do not claim Miami-Dade, Broward, Orlando, Tampa, the Panhandle, or other distant cities.
- Ocean Breeze is on the Indian River Lagoon, not the Atlantic. Rio is not Rio Vista Isles in Fort Lauderdale. Snug Harbor in Stuart uses Harbor, not Harbour.
- Products sold are Hunter Douglas. SoftTouch is a push-button wand, not an app, Alexa, or remote-from-anywhere system. PowerView is the app and smart-home system. It can be scheduled. It does not by itself control lights or climate.
- LightLock is a side channel on select Hunter Douglas shades such as Duette, not its own shade line and not a roller-shade feature.
- Silhouette is a shading, not a blind. Do not mention discontinued Applause or Solera. Do not say the company sells Graber, Norman, Levolor, Somfy, or Polybilt.
- Do not invent warranty year counts. Say Hunter Douglas Limited Lifetime Warranty, and that terms vary by component.
- Repair is not a service In The Shade offers. Do not say the company provides, performs, prices, or assesses repairs. Do not include a professional repair-services section or a repair price table. When the topic is repair, tell the reader to replace the treatment with a new Hunter Douglas product from In The Shade.
- Do not offer motor retrofits on existing blinds, ready-made curtains, whole-home automation, exterior shutters, or hurricane protection from interior shutters. When the audit says to confirm or remove, remove the claim.
- Top-Down/Bottom-Up is a lift style for fabric shades, not a motor and not a drapery feature. Faux wood is not a top-down/bottom-up material.
- Do not invent installation counts, energy percentages, lifespans, or local history. Remove unsourced statistics.
- FAQs are for Treasure Coast homeowners. Answer the question. Do not repeat the question. Do not mention the United States, Canada, Mexico, or North America as the audience.
- The live URL decides the topic. If the body is about a different topic than the slug, rewrite the body so it matches the slug. Do not change the slug.
- Internal links must use a path from allowed_paths, or an href already in the original HTML. If nothing matches, keep the words and remove the link.
- Keep every original img tag, including its src, alt, and surrounding figure if present.
- Change the sentences the audit flags. Keep the rest of the page.
- content_html is the post body only. No html, head, body, script, or JSON-LD.
- meta_description is one plain sentence of 150 to 160 characters and includes the focus keyword.
- focus_keyword stays the same unless the audit says it is wrong.
- Do not use an em dash.`;

function loadShade() {
  const seed = JSON.parse(readFileSync(SEED_PATH, "utf8"));
  const sites = Array.isArray(seed.sites) ? seed.sites : Object.values(seed.sites || seed);
  const site = sites.find((row) => String(row.siteUrl || "").includes("intheshadeflorida.com"));
  if (!site?.username || !site?.appPassword) throw new Error("In The Shade credentials missing from seed");
  return site;
}

function authHeader(site) {
  return `Basic ${Buffer.from(`${site.username}:${site.appPassword}`, "utf8").toString("base64")}`;
}

function loadKey() {
  const direct = String(openRouterKey || process.env.OPENROUTER_API_KEY || "").trim();
  if (direct) return direct;
  const dataRoot =
    process.env.NEO_PULSE_DATA_DIR ||
    "C:\\Users\\Sean Craig\\wpstaging\\sites\\neopulse.local\\data\\php\\neo-pulse-data";
  const emailPath = join(dataRoot, "email-worker-keys.json");
  if (existsSync(emailPath)) {
    const emailKey = String(JSON.parse(readFileSync(emailPath, "utf8")).openRouterApiKey || "").trim();
    if (emailKey) return emailKey;
  }
  const managerPath = join(dataRoot, "manager-settings.json");
  if (existsSync(managerPath)) {
    const manager = JSON.parse(readFileSync(managerPath, "utf8"));
    const managerKey = String(manager?.snapshot?.keys?.["openrouter-api-key"] || "").trim();
    if (managerKey) return managerKey;
  }
  throw new Error("OPENROUTER_API_KEY is missing");
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
    signal: AbortSignal.timeout(180000),
  });
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Neo MCP non-JSON ${res.status}: ${raw.slice(0, 240)}`);
  }
  if (data.error) throw new Error(`Neo MCP error: ${JSON.stringify(data.error).slice(0, 400)}`);
  const text = (data.result?.content || [])
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
  if (data.result?.isError) throw new Error(`Neo MCP tool error: ${text.slice(0, 500)}`);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function php(auth, code) {
  const result = await neoMcp(auth, "neo-mcp_php", {
    operation: "run",
    arguments: { code },
  });
  if (result && typeof result === "object" && result.error) {
    throw new Error(String(result.error).slice(0, 500));
  }
  if (result && typeof result === "object" && "return" in result) return result.return;
  return result;
}

function b64(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function pageAction(page) {
  const fixes = page.issues.map((issue) => issue.fix).join("\n");
  if (/delete (it|the draft)|delete this draft/i.test(fixes)) return "trash";
  if ((/do not publish|don't publish/i.test(fixes) && !/repurpose/i.test(fixes)) || /unpublish/i.test(fixes)) {
    return "draft";
  }
  return "rewrite";
}

function slugFromUrl(url) {
  const parsed = new URL(url);
  const id = parsed.searchParams.get("p");
  if (id && /^\d+$/.test(id)) return { id: Number(id), slug: "", type: parsed.searchParams.get("post_type") || "post" };
  const parts = parsed.pathname.split("/").filter(Boolean);
  const type = parts[0] === "service-area" ? "service-area" : "post";
  return { id: 0, slug: parts[parts.length - 1] || "", type };
}

function pathFromUrl(url) {
  const path = new URL(url).pathname.replace(/\/+$/, "");
  return path || "/";
}

function decodeTitle(title) {
  return String(title || "")
    .replace(/&#038;|&amp;/g, "&")
    .replace(/&#8217;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function faqText(faqs) {
  return faqs.map((row) => `Q: ${row.question.replace(/\s+/g, " ").trim()}\nA: ${row.answer.replace(/\s+/g, " ").trim()}`).join("\n");
}

function hrefsOf(html) {
  return [...String(html || "").matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
}

function imgSrcs(html) {
  return [...String(html || "").matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
}

function internalPath(href) {
  try {
    const url = new URL(href, SITE_URL);
    const host = url.hostname.replace(/^www\./, "");
    if (host !== "intheshadeflorida.com") return null;
    return url.pathname.replace(/\/+$/, "") || "/";
  } catch {
    return null;
  }
}

function isEcho(question, answer) {
  const norm = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const q = norm(question);
  const a = norm(answer);
  if (!q || !a) return true;
  if (a.startsWith("for expert guidance")) return true;
  if (a.includes(q) && a.length < q.length + 40) return true;
  return false;
}

function validate(page, original, next, allowed) {
  const errors = [];
  const html = String(next.content_html || "");
  const title = String(next.title || "").trim();
  const faqs = Array.isArray(next.faqs) ? next.faqs : [];
  if (title.length < 8) errors.push("title is empty");
  if (html.length < 400) errors.push("content is too short");
  if (/<script|```/i.test(html)) errors.push("content includes a script or markdown fence");
  if (/Window Coverings\s*&\s*Interiors/i.test(`${title}\n${html}`)) errors.push("bad business name");
  if (/772-220-4949|220-4949/.test(html)) errors.push("wrong phone number");
  if (/For expert guidance on/i.test(html)) errors.push("template FAQ phrase left in the body");
  const stuffed = page.issues.some((issue) => /place name|pasted|substituted|stuffed/i.test(`${issue.fix} ${issue.before}`));
  const oldTitle = decodeTitle(original.title);
  if (stuffed && oldTitle && title !== oldTitle && html.includes(oldTitle)) {
    errors.push("old title is still used as a place name");
  }
  for (const src of imgSrcs(original.content)) {
    if (!html.includes(src)) errors.push(`missing image ${src}`);
  }
  const originalHrefs = new Set(hrefsOf(original.content));
  for (const href of hrefsOf(html)) {
    if (originalHrefs.has(href) || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    const path = internalPath(href);
    if (path === null) errors.push(`new external link ${href}`);
    else if (!allowed.has(path)) errors.push(`unknown internal link ${path}`);
  }
  if (faqs.length < 2 || faqs.length > 6) errors.push(`faq count ${faqs.length}`);
  for (const row of faqs) {
    if (!row?.question || !row?.answer) errors.push("faq row missing text");
    else if (isEcho(row.question, row.answer)) errors.push(`faq echo: ${String(row.question).slice(0, 80)}`);
    if (/canada|mexico|north america/i.test(`${row.question} ${row.answer}`)) errors.push("faq mentions Canada, Mexico, or North America");
  }
  const desc = String(next.meta_description || "").trim();
  if (desc.length < 80 || desc.length > 180) errors.push(`meta description length ${desc.length}`);
  return errors;
}

async function rewritePage(apiKey, page, original, allowedPaths) {
  const issues = page.issues.map((issue) => ({
    severity: issue.sev,
    finding: issue.before.slice(0, 700),
    fix: issue.fix.slice(0, 500),
  }));
  const user = {
    url: page.url,
    slug: original.slug,
    current_title: decodeTitle(original.title),
    focus_keyword: original.keyword,
    meta_description: original.description || original.acf_description,
    faq_field: String(original.faq || "").slice(0, 6000),
    content_html: original.content,
    issues,
    allowed_paths: allowedPaths.filter(
      (path) => !path.startsWith("/service-area/") && !path.startsWith("/videos/") && !path.startsWith("/thank-you"),
    ),
  };
  const messages = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `${JSON.stringify(user)}\n\nApply every fix. Return only the JSON object.` },
  ];
  let lastError = "";
  let lastJson = "";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://neodigital.ca/neo-pulse/",
        "X-Title": "NEO Pulse In The Shade audit fixes",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.1,
        max_tokens: 24000,
        reasoning: { max_tokens: 400 },
        response_format: { type: "json_object" },
        messages:
          attempt === 1
            ? messages
            : [
                ...messages,
                { role: "assistant", content: lastJson || "{}" },
                {
                  role: "user",
                  content: `That JSON failed validation: ${lastError}. Fix those problems and return the full JSON object again.`,
                },
              ],
      }),
      signal: AbortSignal.timeout(180000),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 300)}`);
    const parsed = JSON.parse(body);
    const message = parsed?.choices?.[0]?.message || {};
    const content = Array.isArray(message.content)
      ? message.content.map((part) => part?.text || part?.content || "").join("")
      : message.content;
    if (!content || typeof content !== "string") {
      const finish = parsed?.choices?.[0]?.finish_reason || "";
      const usage = parsed?.usage ? JSON.stringify(parsed.usage) : "";
      throw new Error(
        `Empty model content for ${page.url} finish=${finish} usage=${usage} error=${parsed?.error?.message || ""} body=${body.slice(0, 400)}`,
      );
    }
    lastJson = content.slice(0, 20000);
    let next;
    try {
      next = JSON.parse(content);
    } catch {
      lastError = "response was not JSON";
      continue;
    }
    const errors = validate(page, original, next, new Set(allowedPaths));
    if (errors.length === 0) return next;
    lastError = errors.join("; ");
    if (attempt === 3) {
      const error = new Error(`${page.url}: ${lastError}`);
      error.result = next;
      throw error;
    }
  }
  throw new Error(`${page.url}: ${lastError}`);
}

async function main() {
  mkdirSync(join(STATE, "originals"), { recursive: true });
  mkdirSync(join(STATE, "done"), { recursive: true });
  mkdirSync(join(STATE, "errors"), { recursive: true });
  const pages = JSON.parse(readFileSync(join(DIR, "pages.json"), "utf8"));
  const site = loadShade();
  const auth = authHeader(site);
  const targets = pages.map((page) => ({ ...page, ...slugFromUrl(page.url), action: pageAction(page) }));

  const resolved = await php(
    auth,
    `$rows = json_decode(base64_decode('${b64(
      targets.map((page) => ({ url: page.url, id: page.id, slug: page.slug, type: page.type })),
    )}'), true);
$out = array();
foreach ($rows as $row) {
  $id = (int) ($row['id'] ?? 0);
  if (!$id && !empty($row['slug'])) {
    $found = get_posts(array(
      'name' => $row['slug'],
      'post_type' => $row['type'] === 'service-area' ? 'service-area' : 'post',
      'post_status' => 'any',
      'posts_per_page' => 1,
      'suppress_filters' => true,
    ));
    if ($found) $id = (int) $found[0]->ID;
  }
  $post = $id ? get_post($id) : null;
  $out[] = array(
    'url' => $row['url'],
    'id' => $id,
    'status' => $post ? $post->post_status : '',
    'slug' => $post ? $post->post_name : '',
    'type' => $post ? $post->post_type : '',
  );
}
return $out;`,
  );
  if (!Array.isArray(resolved)) throw new Error(`Resolve failed: ${JSON.stringify(resolved).slice(0, 300)}`);
  const byUrl = new Map(resolved.map((row) => [row.url, row]));
  const missing = targets.filter((page) => !byUrl.get(page.url)?.id);
  if (missing.length) {
    writeFileSync(join(STATE, "missing.json"), JSON.stringify(missing.map((page) => page.url), null, 2));
    throw new Error(`${missing.length} audit URLs did not resolve. See state/missing.json`);
  }
  for (const page of targets) {
    const row = byUrl.get(page.url);
    page.postId = row.id;
    page.liveStatus = row.status;
    page.liveSlug = row.slug;
  }
  console.log(`resolved ${targets.length}`);

  if (!REWRITE_ONLY) {
    const plugin = await php(
      auth,
      `$dir = WP_CONTENT_DIR . '/mu-plugins';
if (!is_dir($dir)) mkdir($dir, 0755, true);
$file = $dir . '/intheshade-audit-redirects.php';
$php = <<<'PHP'
<?php
/**
 * 301s for In The Shade pages unpublished by the Nov 2026 content audit.
 */
add_action('template_redirect', function () {
  if (!is_404()) {
    return;
  }
  $map = get_option('intheshade_audit_redirects');
  if (!is_array($map) || !$map) {
    return;
  }
  $path = trim((string) parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH), '/');
  $target = $map[$path] ?? '';
  if (!is_string($target) || $target === '') {
    return;
  }
  wp_safe_redirect(home_url($target), 301);
  exit;
}, 0);
PHP;
$bytes = file_put_contents($file, $php);
return array('bytes' => $bytes, 'file' => $file);`,
    );
    console.log("redirect plugin", JSON.stringify(plugin));

    const takedown = targets.filter((page) => page.action !== "rewrite");
    const taken = await php(
      auth,
      `$items = json_decode(base64_decode('${b64(
        takedown.map((page) => ({
          id: page.postId,
          mode: page.action,
          path: pathFromUrl(page.url).replace(/^\//, ""),
        })),
      )}'), true);
$map = get_option('intheshade_audit_redirects', array());
if (!is_array($map)) $map = array();
$done = array();
foreach ($items as $item) {
  $id = (int) $item['id'];
  if ($item['mode'] === 'trash') wp_trash_post($id);
  else wp_update_post(array('ID' => $id, 'post_status' => 'draft'));
  $path = trim((string) $item['path'], '/');
  if ($path !== '') $map[$path] = '/';
  $done[] = array('id' => $id, 'status' => get_post_status($id), 'path' => $path);
}
update_option('intheshade_audit_redirects', $map, false);
return array('count' => count($done), 'rows' => $done);`,
    );
    writeFileSync(join(STATE, "takedown.json"), JSON.stringify(taken, null, 2));
    console.log(`takedown ${taken?.count ?? "?"} pages`);
  }

  if (TAKEDOWN_ONLY) return;

  const catalog = await php(
    auth,
    `$types = get_post_types(array('public' => true), 'names');
$ids = get_posts(array(
  'post_type' => array_values($types),
  'post_status' => 'publish',
  'posts_per_page' => -1,
  'fields' => 'ids',
  'suppress_filters' => true,
));
$paths = array('/');
foreach ($ids as $id) {
  $path = wp_parse_url(get_permalink($id), PHP_URL_PATH);
  $path = trim((string) $path, '/');
  if ($path !== '') $paths[] = '/' . $path;
}
$paths = array_values(array_unique($paths));
sort($paths);
return $paths;`,
  );
  if (!Array.isArray(catalog)) throw new Error("Link catalog failed");
  const blocked = new Set(
    targets.filter((page) => page.action !== "rewrite").map((page) => pathFromUrl(page.url)),
  );
  const allowedPaths = catalog.filter((path) => !blocked.has(path));
  writeFileSync(join(STATE, "allowed-paths.json"), JSON.stringify(allowedPaths, null, 2));
  console.log(`allowed paths ${allowedPaths.length}`);

  let queue = targets.filter((page) => page.action === "rewrite");
  if (ONLY_SLUG) queue = queue.filter((page) => page.liveSlug === ONLY_SLUG || page.slug === ONLY_SLUG);
  queue = queue.filter((page) => !existsSync(join(STATE, "done", `${page.postId}.json`)));
  if (LIMIT > 0) queue = queue.slice(0, LIMIT);
  console.log(`rewrite queue ${queue.length}`);

  const apiKey = loadKey();
  let cursor = 0;
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (cursor < queue.length) {
      const index = cursor;
      cursor += 1;
      const page = queue[index];
      try {
        const original = await php(
          auth,
          `$id = ${Number(page.postId)};
$p = get_post($id);
if (!$p) return null;
return array(
  'id' => $id,
  'status' => $p->post_status,
  'title' => $p->post_title,
  'slug' => $p->post_name,
  'content' => $p->post_content,
  'description' => (string) get_post_meta($id, 'neo_pulse_seo_description', true),
  'acf_description' => (string) get_post_meta($id, 'meta_description', true),
  'keyword' => (string) (get_post_meta($id, 'neo_pulse_seo_focus_keyword', true) ?: get_post_meta($id, 'keyword_focus', true)),
  'faq' => (string) get_post_meta($id, 'faq', true),
  'seo_faq' => (string) get_post_meta($id, 'seo_faq', true),
);`,
        );
        if (!original?.content) throw new Error("empty original content");
        writeFileSync(join(STATE, "originals", `${page.postId}.json`), JSON.stringify(original));
        const next = await rewritePage(apiKey, page, original, allowedPaths);
        const forceDraft = /do not publish|don't publish/i.test(page.issues.map((issue) => issue.fix).join("\n"));
        const status = forceDraft ? "draft" : "";
        const payload = {
          id: page.postId,
          title: String(next.title).trim(),
          content_html: String(next.content_html),
          meta_description: String(next.meta_description).replace(/\s+/g, " ").trim(),
          focus_keyword: String(next.focus_keyword || original.keyword || "").trim(),
          faqs: next.faqs,
          faq_text: faqText(next.faqs),
          status,
        };
        const saved = await php(
          auth,
          `$payload = json_decode(base64_decode('${b64(payload)}'), true);
$id = (int) $payload['id'];
$post = get_post($id);
if (!$post) return array('ok' => false, 'error' => 'missing');
$update = array(
  'ID' => $id,
  'post_title' => $payload['title'],
  'post_content' => $payload['content_html'],
);
if (!empty($payload['status'])) $update['post_status'] = $payload['status'];
$result = wp_update_post(wp_slash($update), true);
if (is_wp_error($result)) return array('ok' => false, 'error' => $result->get_error_message());
$desc = sanitize_text_field($payload['meta_description']);
$title = sanitize_text_field($payload['title']);
$keyword = sanitize_text_field($payload['focus_keyword']);
foreach (array('neo_pulse_seo_description', 'meta_description', 'seo_meta_description', 'rank_math_description') as $key) {
  update_post_meta($id, $key, $desc);
}
update_post_meta($id, 'neo_pulse_seo_title', $title);
if ($keyword !== '') {
  foreach (array('neo_pulse_seo_focus_keyword', 'keyword_focus', 'rank_math_focus_keyword') as $key) {
    update_post_meta($id, $key, $keyword);
  }
}
update_post_meta($id, 'faq', $payload['faq_text']);
update_post_meta($id, 'seo_faq', $payload['faq_text']);
if (function_exists('update_field')) {
  update_field('faq', $payload['faq_text'], $id);
  update_field('seo_faq', $payload['faq_text'], $id);
  update_field('meta_description', $desc, $id);
  update_field('seo_meta_description', $desc, $id);
  if ($keyword !== '') update_field('keyword_focus', $keyword, $id);
}
$entities = array();
foreach ($payload['faqs'] as $row) {
  $q = trim(wp_strip_all_tags((string) ($row['question'] ?? '')));
  $a = trim(wp_strip_all_tags((string) ($row['answer'] ?? '')));
  if ($q === '' || $a === '') continue;
  $entities[] = array(
    '@type' => 'Question',
    'name' => $q,
    'acceptedAnswer' => array('@type' => 'Answer', 'text' => $a),
  );
}
update_post_meta($id, 'neo_pulse_seo_schema_FAQPage', array(
  '@type' => 'FAQPage',
  'metadata' => array('title' => 'FAQ', 'type' => 'template', 'isPrimary' => false),
  'mainEntity' => $entities,
));
clean_post_cache($id);
return array('ok' => true, 'id' => $id, 'status' => get_post_status($id), 'title' => get_the_title($id));`,
        );
        if (!saved?.ok) throw new Error(`save failed ${JSON.stringify(saved).slice(0, 300)}`);
        writeFileSync(join(STATE, "done", `${page.postId}.json`), JSON.stringify({ url: page.url, saved, title: payload.title }));
        const errorPath = join(STATE, "errors", `${page.postId}.json`);
        if (existsSync(errorPath)) unlinkSync(errorPath);
        console.log(`saved ${page.postId} ${page.liveSlug}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        writeFileSync(join(STATE, "errors", `${page.postId}.json`), JSON.stringify({ url: page.url, message }));
        console.log(`error ${page.postId} ${message.slice(0, 240)}`);
      }
    }
  });
  await Promise.all(workers);
  const done = targets.filter((page) => existsSync(join(STATE, "done", `${page.postId}.json`))).length;
  const failed = targets.filter((page) => existsSync(join(STATE, "errors", `${page.postId}.json`))).length;
  console.log(`finished done=${done} errors=${failed}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
