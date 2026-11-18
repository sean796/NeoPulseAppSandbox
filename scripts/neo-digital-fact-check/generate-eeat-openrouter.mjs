/**
 * OpenRouter EEAT research paragraphs for Neo Digital posts + service-areas.
 * Model writes lead + review sentences; code only validates and wraps HTML.
 *
 * Usage:
 *   node scripts/neo-digital-fact-check/generate-eeat-openrouter.mjs
 *   node scripts/neo-digital-fact-check/generate-eeat-openrouter.mjs --apply
 *   node scripts/neo-digital-fact-check/dump-live-via-rest.mjs   # refresh live first if needed
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SEED = join(ROOT, "src/components/integrations/default-properties-seed.json");
const DIR = join(ROOT, "scripts/_tmp-nd-fact");
const LIVE = join(DIR, "live-contents.json");
const URLS = join(DIR, "urls.json");
const OUT_UPDATES = join(DIR, "updates-eeat-or.json");
const OUT_REPORT = join(DIR, "eeat-or-report.json");
const CACHE = join(DIR, "eeat-or-cache.json");

const MODEL =
  process.env.OPENROUTER_MODEL?.trim() ||
  process.env.NEO_PULSE_AGENT_RESEARCH_MODEL?.trim() ||
  "google/gemini-2.5-flash";
const CONCURRENCY = Math.max(1, Number(process.env.ND_EEAT_CONCURRENCY || 6));
const LIMIT = Number(process.env.ND_EEAT_LIMIT || 0);
const OFFSET = Number(process.env.ND_EEAT_OFFSET || 0);

const CITIES = "Edmonton and the Alberta businesses Neo Digital serves";
const TEAM = "The Neo Digital Team";
const ROLE = "SEO and WordPress specialists";

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

function loadSite() {
  const seed = JSON.parse(readFileSync(SEED, "utf8"));
  const site = (seed.sites || []).find((s) => String(s.siteUrl || "").includes("neodigital.ca"));
  if (!site?.username || !site?.appPassword) throw new Error("Neo Digital seed credentials missing");
  return site;
}

function authHeader(site) {
  return `Basic ${Buffer.from(`${site.username}:${site.appPassword.replace(/\s+/g, "")}`).toString("base64")}`;
}

function restBase(type, site) {
  const root = site.siteUrl.replace(/\/$/, "");
  if (type === "page") return `${root}/wp-json/wp/v2/pages`;
  if (type === "service-area") return `${root}/wp-json/wp/v2/service-area`;
  if (type === "insight") return `${root}/wp-json/wp/v2/insight`;
  return `${root}/wp-json/wp/v2/posts`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractResearchList(html) {
  const start = html.search(/id=["']research-and-fact-checking["']/i);
  if (start < 0) return "";
  const open = html.lastIndexOf("<", start);
  const cut = open >= 0 ? open : start;
  const after = html.slice(cut + 1);
  const next = after.search(/<h2\b|<div\b[^>]*class=["'][^"']*flo-faq/i);
  const block = next < 0 ? html.slice(cut) : html.slice(cut, cut + 1 + next);
  const m = block.match(/<ul\b[^>]*>[\s\S]*?<\/ul>/i);
  return m ? m[0].trim() : "";
}

function extractSourceHints(html) {
  const list = extractResearchList(html);
  if (!list) return [];
  const out = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(list))) {
    out.push({
      url: m[1],
      title: stripHtml(m[2]).slice(0, 160),
    });
  }
  return out.slice(0, 12);
}

function findResearchBounds(html) {
  const idIdx = html.search(/id=["']research-and-fact-checking["']/i);
  if (idIdx < 0) return null;
  const start = html.lastIndexOf("<", idIdx);
  const cut = start >= 0 ? start : idIdx;
  const after = html.slice(cut + 1);
  const next = after.search(/<h2\b|<div\b[^>]*class=["'][^"']*flo-faq/i);
  const end = next < 0 ? html.length : cut + 1 + next;
  return { start: cut, end };
}

function buildBlockHtml(lead, review, listHtml) {
  const list = String(listHtml || "").trim();
  return `<h2 id="research-and-fact-checking">Technical Review &amp; Local Standards</h2>
<p>${escapeHtml(lead)}</p>
<p>${escapeHtml(review)}</p>${list ? `\n${list}\n` : ""}`;
}

function applyBlock(html, blockHtml) {
  const bounds = findResearchBounds(html);
  if (bounds) {
    return `${html.slice(0, bounds.start)}${blockHtml}${html.slice(bounds.end)}`;
  }
  if (/<div[^>]*class=["'][^"']*flo-faq/i.test(html)) {
    return html.replace(/<div[^>]*class=["'][^"']*flo-faq/i, `${blockHtml}\n$&`);
  }
  if (/<h2[^>]*>\s*FAQ\b/i.test(html)) {
    return html.replace(/<h2[^>]*>\s*FAQ\b/i, `${blockHtml}\n$&`);
  }
  if (/<h2[^>]*\bid=["']faq["']/i.test(html)) {
    return html.replace(/<h2[^>]*\bid=["']faq["'][^>]*>/i, `${blockHtml}\n$&`);
  }
  return `${html.trim()}\n\n${blockHtml}`;
}

function assertParagraph(label, text) {
  const t = String(text || "").replace(/\u2014/g, "-").replace(/\u2013/g, "-").trim();
  if (!t) throw new Error(`${label} empty`);
  if (/\s+\./.test(t) || /^\./.test(t) || /\bat\s*\./i.test(t) || /\bacross\s*\./i.test(t)) {
    throw new Error(`${label} has spaced/fragment punctuation`);
  }
  if (/\bthe\s+at\b/i.test(t) || /\bby the\s+at\b/i.test(t)) {
    throw new Error(`${label} has sentence fragment`);
  }
  if (t.length < 40) throw new Error(`${label} too short`);
  return t;
}

const SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "nd_eeat_research",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        lead_paragraph: { type: "string" },
        review_paragraph: { type: "string" },
      },
      required: ["lead_paragraph", "review_paragraph"],
    },
  },
};

const SYSTEM = `You write the E-E-A-T research disclosure for Neo Digital (neodigital.ca), an Edmonton digital marketing and WordPress agency.

Return JSON only matching the schema.

Hard rules:
- lead_paragraph and review_paragraph must be complete, grammatical English sentences. No blanks. No placeholders.
- Never end a clause with a bare preposition then period (forbidden: "across .", "at .", "by the at .").
- No em dashes. Use commas, periods, or hyphens.
- Do not mention window coverings, blinds, shades, CRA tax filings, or accounting products.
- Ground authority in SEO, WordPress, Elementor/Divi, Google platforms, and Neo Digital client work.
- lead_paragraph: one or two sentences. Name the article topic naturally. State that platform details / SEO guidance / implementation notes were verified against official documentation and applied on live client sites across: ${CITIES}.
- review_paragraph: one or two sentences. Cover SEO, WordPress, and digital marketing recommendations reflecting current docs and real client websites. End with: Written and reviewed by the ${ROLE} at ${TEAM}. Last reviewed: November 2026.
- Do not invent source titles. Do not paste raw URLs into the paragraphs.
- Keep each paragraph under 320 characters when possible, but never sacrifice complete sentences.`;

async function openRouterEeat(apiKey, payload) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://neodigital.ca",
      "X-Title": "Neo Digital EEAT research paragraphs",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: JSON.stringify(payload) },
      ],
      response_format: SCHEMA,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 400)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  const raw = typeof content === "string" ? content : JSON.stringify(content);
  const parsed = JSON.parse(raw);
  return {
    lead: assertParagraph("lead_paragraph", parsed.lead_paragraph),
    review: assertParagraph("review_paragraph", parsed.review_paragraph),
  };
}

async function mapPool(items, concurrency, fn) {
  let i = 0;
  const out = new Array(items.length);
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return out;
}

async function ensureLive() {
  if (existsSync(LIVE)) return;
  if (!existsSync(URLS)) {
    throw new Error(`Missing ${LIVE} and ${URLS}. Run fetch/parse/dump first.`);
  }
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, [join(ROOT, "scripts/neo-digital-fact-check/dump-live-via-rest.mjs")], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) throw new Error("dump-live-via-rest failed");
}

async function applyUpdates(updates) {
  const site = loadSite();
  const auth = authHeader(site);
  const results = await mapPool(updates, 4, async (u) => {
    const url = `${restBase(u.type || "post", site)}/${u.id}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify({ content: u.content }),
      });
      const text = await res.text();
      if (!res.ok) return { id: u.id, pageUrl: u.pageUrl, ok: false, status: res.status, error: text.slice(0, 300) };
      return { id: u.id, pageUrl: u.pageUrl, ok: true, status: res.status };
    } catch (err) {
      return { id: u.id, pageUrl: u.pageUrl, ok: false, error: String(err?.message || err).slice(0, 300) };
    }
  });
  const ok = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok);
  writeFileSync(join(DIR, "eeat-or-apply-report.json"), JSON.stringify({ ok, fail: fail.length, results }, null, 2));
  console.log(JSON.stringify({ applyOk: ok, applyFail: fail.length, sampleFail: fail.slice(0, 5) }, null, 2));
}

async function main() {
  mkdirSync(DIR, { recursive: true });
  await ensureLive();
  const apiKey = loadOpenRouterKey();
  const live = JSON.parse(readFileSync(LIVE, "utf8"));
  let rows = (live.posts || []).filter((p) => p?.id && p.content);
  const onlyMissing = process.argv.includes("--missing-only");
  if (onlyMissing) {
    rows = rows.filter((p) => !/id=["']research-and-fact-checking["']/i.test(String(p.content || "")));
  }
  if (OFFSET) rows = rows.slice(OFFSET);
  if (LIMIT > 0) rows = rows.slice(0, LIMIT);

  /** @type {Record<string, any>} */
  let cache = {};
  if (existsSync(CACHE)) {
    try {
      cache = JSON.parse(readFileSync(CACHE, "utf8"));
    } catch {
      cache = {};
    }
  }

  const reports = [];
  const updates = [];

  const generated = await mapPool(rows, CONCURRENCY, async (row) => {
    const title = String(row.title || row.pageTitle || "").trim() || "Canadian tax and accounting";
    const cacheKey = `${row.id}:${title}`.slice(0, 240);
    const sources = extractSourceHints(String(row.content));
    const excerpt = stripHtml(String(row.content)).slice(0, 1200);
    try {
      let paras = cache[cacheKey];
      if (!paras?.lead || !paras?.review) {
        paras = await openRouterEeat(apiKey, {
          page_title: title,
          page_url: row.pageUrl,
          post_type: row.type || "post",
          sources,
          content_excerpt: excerpt,
          required_cities: CITIES,
          required_team: TEAM,
          required_role: ROLE,
        });
        cache[cacheKey] = paras;
      } else {
        paras = {
          lead: assertParagraph("lead_paragraph", paras.lead),
          review: assertParagraph("review_paragraph", paras.review),
        };
      }
      const list = extractResearchList(String(row.content));
      const block = buildBlockHtml(paras.lead, paras.review, list);
      const next = applyBlock(String(row.content), block);
      if (/\bacross\s*\.|\bthe\s+at\s*\.|\s+\.\s*Written/i.test(next)) {
        throw new Error("assembled HTML still has fragment punctuation");
      }
      return {
        ok: true,
        id: row.id,
        pageUrl: row.pageUrl,
        type: row.type || "post",
        content: next,
        lead: paras.lead,
        review: paras.review,
      };
    } catch (err) {
      return {
        ok: false,
        id: row.id,
        pageUrl: row.pageUrl,
        error: String(err?.message || err).slice(0, 400),
      };
    }
  });

  writeFileSync(CACHE, JSON.stringify(cache, null, 2), "utf8");

  for (const g of generated) {
    reports.push(g);
    if (g.ok) {
      updates.push({
        id: g.id,
        pageUrl: g.pageUrl,
        type: g.type,
        content: g.content,
      });
    }
  }

  writeFileSync(OUT_UPDATES, JSON.stringify({ updates }, null, 2), "utf8");
  writeFileSync(OUT_REPORT, JSON.stringify({ model: MODEL, reports }, null, 2), "utf8");
  console.log(
    JSON.stringify(
      {
        model: MODEL,
        scanned: rows.length,
        updates: updates.length,
        failed: reports.filter((r) => !r.ok).length,
        sampleFail: reports.filter((r) => !r.ok).slice(0, 5),
      },
      null,
      2,
    ),
  );

  if (process.argv.includes("--apply") && updates.length) {
    await applyUpdates(updates);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
