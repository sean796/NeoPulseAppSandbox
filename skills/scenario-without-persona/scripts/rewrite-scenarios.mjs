/**
 * OpenRouter rewrites ONLY the case-study / illustrative scenario HTML block
 * (intro + blockquote + Recommendation). Never rewrites the rest of the page.
 *
 * Usage:
 *   node skills/scenario-without-persona/scripts/rewrite-scenarios.mjs --site host --confirm
 *   node skills/scenario-without-persona/scripts/rewrite-scenarios.mjs --all-sites --confirm --skip blindmagic.com
 *
 * Writes go through WP REST with Integrations credentials. Prefer Neo MCP when
 * the agent is applying fragments site-by-site.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT_DIR = join(ROOT, "scripts/_tmp-scenario-without-persona");
const MODEL =
  process.env.OPENROUTER_MODEL?.trim() ||
  process.env.NEO_PULSE_AGENT_RESEARCH_MODEL?.trim() ||
  "google/gemini-2.5-flash";
const CONCURRENCY = Math.max(1, Number(process.env.SCENARIO_REWRITE_CONCURRENCY || 3));

const KNOWN_FICTIONAL_NAMES = [
  "Nadia", "Arthur", "Anya", "Maya", "Olivia", "Quinn", "Elena", "Eleanor",
  "Clara", "Liam", "Chloe", "Evelyn", "Morgan", "Casey", "Finley", "Jordan",
  "Riley", "Alex", "Sam", "Taylor", "Jamie", "Avery", "Harper", "Noah", "Emma",
  "Sophia", "Lucas", "Mia", "Ethan", "Isabella", "Amelia", "Benjamin",
  "Charlotte", "Henry", "Grace", "Owen", "Nora", "Leo", "Zoe", "Nathan",
  "Sarah", "Daniel", "Rachel", "Michael", "Jennifer", "David", "Emily",
];

const PRODUCT_PRESERVE = [
  "Hunter Douglas", "Alta", "Duette", "PowerView", "SoftTouch", "Silhouette",
  "Luminette", "Pirouette", "Solera", "Mark Outside-Mount", "Paul Kane Park",
  "James Macdonald Bridge",
];

const args = process.argv.slice(2);
function flag(name) {
  return args.includes(name);
}
function opt(name, fallback = "") {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
function optList(name) {
  return (opt(name, "") || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const ALL_SITES = flag("--all-sites");
const DRY_RUN = flag("--dry-run") || !flag("--confirm");
const LIMIT = Math.max(0, Number(opt("--limit", "0") || 0));
const OFFSET = Math.max(0, Number(opt("--offset", "0") || 0));
const SKIP_HOSTS = new Set(optList("--skip"));
const ONLY_IDS = new Set(
  (opt("--ids", "") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0),
);

function loadOpenRouterKey() {
  const fromEnv =
    process.env.OPENROUTER_API_KEY?.trim() ||
    process.env.OPEN_ROUTER_API_KEY?.trim() ||
    process.env.VITE_OPENROUTER_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const keysPath =
    process.env.EMAIL_WORKER_KEYS_PATH?.trim() ||
    "C:\\Users\\Sean Craig\\wpstaging\\sites\\neopulse.local\\data\\php\\neo-pulse-data\\email-worker-keys.json";
  if (existsSync(keysPath)) {
    const keys = JSON.parse(readFileSync(keysPath, "utf8"));
    const k = String(keys.openRouterApiKey || "").trim();
    if (k) return k;
  }
  throw new Error("OPENROUTER_API_KEY missing");
}

function loadSeedSites() {
  const seed = JSON.parse(
    readFileSync(join(ROOT, "src/components/integrations/default-properties-seed.json"), "utf8"),
  );
  return (seed.sites || [])
    .map((site) => {
      let host = "";
      try {
        host = new URL(site.siteUrl).hostname.replace(/^www\./, "").toLowerCase();
      } catch {
        return null;
      }
      if (!site.username || !site.appPassword) return null;
      return {
        host,
        name: site.name,
        base: String(site.siteUrl).replace(/\/$/, ""),
        auth: Buffer.from(`${site.username}:${site.appPassword}`).toString("base64"),
      };
    })
    .filter(Boolean);
}

function resolveSites() {
  const all = loadSeedSites();
  if (ALL_SITES) return all.filter((s) => !SKIP_HOSTS.has(s.host));
  const host = (opt("--site", "") || "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .replace(/^www\./, "")
    .toLowerCase();
  if (!host) throw new Error("Pass --site <host> or --all-sites");
  const hit = all.find((s) => s.host === host);
  if (!hit) throw new Error(`No Integrations credentials for ${host}`);
  return [hit];
}

async function wpGet(creds, path) {
  const res = await fetch(`${creds.base}${path}`, {
    headers: { Authorization: `Basic ${creds.auth}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

async function wpUpdate(creds, restBase, id, content) {
  const res = await fetch(`${creds.base}/wp-json/wp/v2/${restBase}/${id}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds.auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`POST ${restBase}/${id} → ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function listAll(creds, restBase) {
  const out = [];
  let page = 1;
  for (;;) {
    const rows = await wpGet(
      creds,
      `/wp-json/wp/v2/${restBase}?per_page=100&page=${page}&status=publish,future&context=edit&_fields=id,link,title,content,status`,
    );
    if (!Array.isArray(rows) || rows.length === 0) break;
    out.push(...rows);
    if (rows.length < 100) break;
    page += 1;
  }
  return out;
}

function pageHtml(page) {
  const c = page.content;
  if (!c) return "";
  if (typeof c === "string") return c;
  return String(c.raw || c.rendered || "");
}

function namesIn(html) {
  return KNOWN_FICTIONAL_NAMES.filter((n) => new RegExp(`\\b${n}\\b`).test(html));
}

/**
 * Case study ONLY: nearest H2 before a named blockquote, through Recommendation.
 * Never spans multiple H2 sections.
 */
export function extractCaseStudyBlock(html) {
  if (!html || !/<blockquote[\s>]/i.test(html)) return null;

  const bqRe = /<blockquote[\s>][\s\S]*?<\/blockquote>/gi;
  let bqMatch;
  while ((bqMatch = bqRe.exec(html)) !== null) {
    const bqStart = bqMatch.index;
    const bqEnd = bqStart + bqMatch[0].length;
    if (!namesIn(bqMatch[0]).length) continue;

    const before = html.slice(0, bqStart);
    const h2Matches = [...before.matchAll(/<h2\b[^>]*>[\s\S]*?<\/h2>/gi)];
    if (!h2Matches.length) continue;
    const lastH2 = h2Matches[h2Matches.length - 1];
    const start = lastH2.index;
    const between = html.slice(start + lastH2[0].length, bqStart);
    if (/<h2\b/i.test(between)) continue;

    let end = bqEnd;
    const afterBq = html.slice(end);
    const nextH2 = afterBq.search(/<h2\b/i);
    const recWindow = nextH2 >= 0 ? afterBq.slice(0, nextH2) : afterBq;
    const recH3 = recWindow.match(
      /^(\s|<!--[\s\S]*?-->)*<h3[^>]*>[\s\S]*?Recommendation:[\s\S]*?<\/h3>/i,
    );
    if (recH3) {
      end += recH3[0].length;
      const afterRec = html.slice(end);
      const cut = afterRec.search(/<h2\b/i);
      const beforeNextH2 = cut >= 0 ? afterRec.slice(0, cut) : afterRec;
      const recP = beforeNextH2.match(/^(\s|<!--[\s\S]*?-->)*<p[\s>][\s\S]*?<\/p>/i);
      if (recP) end += recP[0].length;
    }

    const block = html.slice(start, end);
    if ((block.match(/<h2\b/gi) || []).length !== 1) continue;
    if (!namesIn(block).length) continue;
    return { start, end, block };
  }
  return null;
}

function preserveIn(block, businessName) {
  const tokens = [...PRODUCT_PRESERVE];
  if (businessName?.trim()) tokens.unshift(businessName.trim());
  if (block.includes("Blind Spot")) tokens.push("Blind Spot");
  return tokens.filter((t) => block.includes(t));
}

const SYSTEM = `You rewrite ONLY a case-study / illustrative scenario HTML fragment for a local business article.

Return JSON only: { "html": string, "removedFirstNames": string[] }.

Rules:
- Rewrite this fragment only. Return the full fragment HTML with the same structure (headings, <p>, <blockquote>, Recommendation <h3>, recommendation <p>, links).
- Remove invented homeowner first names. Use situation openers that vary: "In this scenario", "Consider a common situation", "For example", "In most cases", plus "a homeowner" / "their" / "the household".
- Keep product brands, place names, the connected business name, and every href/class/id intact.
- Forbidden: placeholders like [NAME] or {{homeowner}}; inventing a new first name; returning the whole page; omitting the Recommendation block when it was present.
- html must be the rewritten fragment only — never surrounding article sections.`;

async function openRouterRewriteCaseStudy(apiKey, block, title, businessName, detectedNames) {
  const preserve = preserveIn(block, businessName);
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://neodigital.ca",
      "X-Title": "Neo Pulse scenario-without-persona case-study-only",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            `Connected business name: ${businessName}`,
            `Page title: ${title}`,
            `Detected first names in this fragment: ${detectedNames.join(", ")}`,
            `Preserve verbatim if present: ${preserve.join(", ") || "(none)"}`,
            "Case-study HTML fragment only:",
            block,
          ].join("\n\n"),
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return JSON.parse(data.choices?.[0]?.message?.content || "");
}

function validateFragment(originalBlock, parsed, businessName, detectedNames) {
  const next = typeof parsed?.html === "string" ? parsed.html : "";
  if (!next.trim()) return { ok: false, reason: "empty-html" };
  if (next === originalBlock) return { ok: false, reason: "identical" };
  if (!/<blockquote[\s>]/i.test(next)) return { ok: false, reason: "lost-blockquote" };
  if (/\[NAME\]|\{\{[^}]+\}\}|\[homeowner\]|\[persona\]/i.test(next)) {
    return { ok: false, reason: "placeholder-leak" };
  }
  // Reject accidental full-page dumps
  if ((next.match(/<h2[\s>]/gi) || []).length > 2) {
    return { ok: false, reason: "too-many-h2" };
  }
  const checkNames = [
    ...new Set([
      ...detectedNames,
      ...(Array.isArray(parsed.removedFirstNames) ? parsed.removedFirstNames : []),
    ]),
  ].filter((n) => /^[A-Z][a-z]{2,20}$/.test(String(n || "").trim()));
  for (const name of checkNames) {
    if (new RegExp(`\\b${name}\\b`).test(next)) {
      return { ok: false, reason: `name-remains:${name}` };
    }
  }
  for (const token of preserveIn(originalBlock, businessName)) {
    if (!next.includes(token)) return { ok: false, reason: `lost-token:${token}` };
  }
  return { ok: true, reason: "accepted", html: next, removedNames: checkNames };
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function processSite(apiKey, creds) {
  const posts = await listAll(creds, "posts");
  let areas = [];
  try {
    areas = await listAll(creds, "service-area");
  } catch (e) {
    console.error(JSON.stringify({ site: creds.host, warn: String(e.message || e) }));
  }

  let pages = [
    ...posts.map((p) => ({ ...p, restBase: "posts", kind: "post" })),
    ...areas.map((p) => ({ ...p, restBase: "service-area", kind: "service-area" })),
  ].filter((p) => namesIn(pageHtml(p)).length > 0);

  if (ONLY_IDS.size) pages = pages.filter((p) => ONLY_IDS.has(Number(p.id)));
  if (OFFSET) pages = pages.slice(OFFSET);
  if (LIMIT) pages = pages.slice(0, LIMIT);

  const report = {
    site: creds.host,
    businessName: creds.name,
    dryRun: DRY_RUN,
    model: MODEL,
    openRouter: true,
    scope: "case-study-block-only",
    total: pages.length,
    accepted: [],
    skipped: [],
    failed: [],
  };

  const results = await mapPool(pages, CONCURRENCY, async (page) => {
    const id = page.id;
    const title = page.title?.raw || page.title?.rendered || page.title || String(id);
    const link = page.link || "";
    const html = pageHtml(page);
    const extracted = extractCaseStudyBlock(html);
    if (!extracted) {
      return { id, title, link, status: "skipped", reason: "no-case-study-block", kind: page.kind };
    }
    const detected = namesIn(extracted.block);
    try {
      const parsed = await openRouterRewriteCaseStudy(
        apiKey,
        extracted.block,
        title,
        creds.name,
        detected,
      );
      const validated = validateFragment(extracted.block, parsed, creds.name, detected);
      if (!validated.ok) {
        return { id, title, link, status: "skipped", reason: validated.reason, kind: page.kind };
      }
      const nextHtml =
        html.slice(0, extracted.start) + validated.html + html.slice(extracted.end);
      if (namesIn(nextHtml.slice(extracted.start, extracted.start + validated.html.length)).length) {
        return { id, title, link, status: "skipped", reason: "name-in-fragment", kind: page.kind };
      }
      if (!DRY_RUN) {
        await wpUpdate(creds, page.restBase, id, nextHtml);
      }
      return {
        id,
        title,
        link,
        status: "accepted",
        reason: validated.reason,
        kind: page.kind,
        removedNames: validated.removedNames || [],
        saved: !DRY_RUN,
        fragmentChars: validated.html.length,
      };
    } catch (e) {
      return {
        id,
        title,
        link,
        status: "failed",
        reason: String(e.message || e),
        kind: page.kind,
      };
    }
  });

  for (const row of results) {
    if (row.status === "accepted") report.accepted.push(row);
    else if (row.status === "failed") report.failed.push(row);
    else report.skipped.push(row);
  }
  return report;
}

async function main() {
  if (flag("--help")) {
    console.log(
      JSON.stringify(
        {
          usage:
            "node skills/scenario-without-persona/scripts/rewrite-scenarios.mjs (--site host | --all-sites) [--confirm] [--skip host]",
          model: MODEL,
          openRouter: true,
          scope: "case-study-block-only",
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const apiKey = loadOpenRouterKey();
  const sites = resolveSites();
  const portfolio = { dryRun: DRY_RUN, model: MODEL, openRouter: true, scope: "case-study-block-only", sites: [] };

  for (const site of sites) {
    console.error(JSON.stringify({ phase: "site-start", site: site.host, name: site.name }));
    const report = await processSite(apiKey, site);
    const outPath = join(OUT_DIR, `${site.host.replace(/\./g, "-")}-report.json`);
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    const summary = {
      site: site.host,
      total: report.total,
      accepted: report.accepted.length,
      skipped: report.skipped.length,
      failed: report.failed.length,
      report: outPath,
      changedUrls: report.accepted.map((r) => r.link).filter(Boolean),
    };
    portfolio.sites.push(summary);
    console.log(JSON.stringify(summary, null, 2));
  }

  const portfolioPath = join(OUT_DIR, "portfolio-report.json");
  writeFileSync(portfolioPath, JSON.stringify(portfolio, null, 2));
  const failed = portfolio.sites.reduce((n, s) => n + s.failed, 0);
  console.log(
    JSON.stringify(
      {
        ok: failed === 0,
        dryRun: DRY_RUN,
        openRouter: true,
        scope: "case-study-block-only",
        siteCount: portfolio.sites.length,
        accepted: portfolio.sites.reduce((n, s) => n + s.accepted, 0),
        failed,
        portfolio: portfolioPath,
      },
      null,
      2,
    ),
  );
  process.exit(failed ? 2 : 0);
}

main().catch((e) => {
  console.error(String(e.stack || e));
  process.exit(1);
});
