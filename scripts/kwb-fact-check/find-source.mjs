/**
 * Resolve needs-search claims via OpenRouter web search.
 * Column I external URLs are left untouched.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = join(ROOT, "scripts/_tmp-kwb-fact");
const IN = join(OUT_DIR, "posts.json");
const OUT = join(OUT_DIR, "posts-resolved.json");
const CACHE = join(OUT_DIR, "source-cache.json");
const MODEL =
  process.env.OPENROUTER_MODEL?.trim() ||
  process.env.NEO_PULSE_AGENT_RESEARCH_MODEL?.trim() ||
  "google/gemini-2.5-flash";
const CONCURRENCY = Math.max(1, Number(process.env.BM_SEARCH_CONCURRENCY || 8));
const LIMIT = Number(process.env.BM_SEARCH_LIMIT || 0);

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

function isExternalUrl(url) {
  const u = String(url || "").trim();
  if (!/^https?:\/\//i.test(u)) return false;
  try {
    const host = new URL(u).hostname.replace(/^www\./, "").toLowerCase();
    return host !== "kwbllp.com" && !host.endsWith(".kwbllp.com");
  } catch {
    return false;
  }
}

function cacheKey(claim) {
  return String(claim.suggested || claim.claim || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

const SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "claim_source",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        source_url: { type: "string" },
        source_title: { type: "string" },
        quote: { type: "string" },
        supports: { type: "boolean" },
      },
      required: ["source_url", "source_title", "quote", "supports"],
    },
  },
};

async function openRouterFind(apiKey, claim) {
  const wording = (claim.suggested || claim.claim).trim();
  const system = `You find one primary external source URL that supports a window-covering claim.
Return JSON only matching the schema.
Rules:
- source_url must be https and must NOT be on kwbllp.com
- Prefer manufacturer docs (hunterdouglas.com / hunterdouglas.ca), government pages, or standards pages
- quote must be a short excerpt from that page that supports the claim
- supports=true only when the page actually states the claim; otherwise supports=false and leave source_url empty
- Do not invent URLs`;
  const user = JSON.stringify({
    claim: claim.claim,
    suggested_wording: wording,
    category: claim.category,
    product: claim.product,
    qualification: claim.qualification,
  });

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://neodigital.ca",
      "X-Title": "KWB fact-check",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      plugins: [{ id: "web", max_results: 5 }],
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
  return parsed;
}

async function fetchPageText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "NeoPulseFactCheck/1.0" },
      redirect: "follow",
    });
    if (!res.ok) return "";
    const ct = String(res.headers.get("content-type") || "");
    if (!/text|html|json|xml|pdf/i.test(ct) && ct) {
      // still try text for unknown
    }
    const buf = await res.arrayBuffer();
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    return text.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 40000);
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}

async function confirmSupports(apiKey, wording, quote, pageText, sourceUrl) {
  if (!isExternalUrl(sourceUrl)) return false;
  if (!quote || !pageText) return false;
  const quoteNorm = quote.toLowerCase().slice(0, 120);
  if (quoteNorm.length > 20 && !pageText.toLowerCase().includes(quoteNorm.slice(0, 40))) {
    // quote not found verbatim; still ask model with page excerpt
  }
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://neodigital.ca",
      "X-Title": "KWB fact-check confirm",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            'Decide if the page text supports the claim. Return JSON {"supports":boolean,"reason":"short"}. supports=true only when the page states the same fact.',
        },
        {
          role: "user",
          content: JSON.stringify({
            claim_wording: wording,
            quote,
            source_url: sourceUrl,
            page_excerpt: pageText.slice(0, 12000),
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "confirm_support",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              supports: { type: "boolean" },
              reason: { type: "string" },
            },
            required: ["supports", "reason"],
          },
        },
      },
    }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  const parsed = JSON.parse(typeof content === "string" ? content : JSON.stringify(content));
  return Boolean(parsed.supports);
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

async function main() {
  const apiKey = loadOpenRouterKey();
  const data = JSON.parse(readFileSync(IN, "utf8"));
  /** @type {Record<string, any>} */
  const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};

  const jobs = [];
  for (const post of data.posts) {
    for (const claim of post.claims) {
      if (claim.mode !== "needs-search") continue;
      jobs.push({ post, claim });
    }
  }
  const work = LIMIT > 0 ? jobs.slice(0, LIMIT) : jobs;
  console.log(`needs-search jobs: ${jobs.length}; running: ${work.length}; concurrency=${CONCURRENCY}`);

  let done = 0;
  let resolved = 0;
  let failed = 0;

  await mapPool(work, CONCURRENCY, async ({ claim }) => {
    const key = cacheKey(claim);
    if (cache[key]?.resolvedUrl && isExternalUrl(cache[key].resolvedUrl)) {
      claim.resolvedUrl = cache[key].resolvedUrl;
      claim.sourceTitle = claim.sourceTitle || cache[key].sourceTitle || "";
      claim.sourceOrigin = "search-cache";
      claim.mode = "resolved-search";
      claim.quote = cache[key].quote || "";
      resolved += 1;
      done += 1;
      return;
    }
    try {
      const found = await openRouterFind(apiKey, claim);
      const wording = (claim.suggested || claim.claim).trim();
      if (!found.supports || !isExternalUrl(found.source_url)) {
        claim.mode = "unresolved";
        claim.resolveError = "no supporting external url";
        failed += 1;
      } else {
        const pageText = await fetchPageText(found.source_url);
        const quoteBit = String(found.quote || "")
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 48);
        const quoteOnPage =
          quoteBit.length >= 20 && pageText.toLowerCase().includes(quoteBit);
        const ok = quoteOnPage
          ? true
          : await confirmSupports(apiKey, wording, found.quote, pageText, found.source_url);
        if (!ok) {
          claim.mode = "unresolved";
          claim.resolveError = "confirm failed";
          failed += 1;
        } else {
          claim.resolvedUrl = found.source_url;
          claim.sourceTitle = found.source_title || claim.sourceTitle || new URL(found.source_url).hostname;
          claim.quote = found.quote || "";
          claim.sourceOrigin = "search";
          claim.mode = "resolved-search";
          cache[key] = {
            resolvedUrl: claim.resolvedUrl,
            sourceTitle: claim.sourceTitle,
            quote: claim.quote,
          };
          resolved += 1;
        }
      }
    } catch (err) {
      claim.mode = "unresolved";
      claim.resolveError = String(err?.message || err).slice(0, 300);
      failed += 1;
    }
    done += 1;
    if (done % 25 === 0 || done === work.length) {
      writeFileSync(CACHE, JSON.stringify(cache, null, 2), "utf8");
      console.log(`progress ${done}/${work.length} resolved=${resolved} failed=${failed}`);
    }
  });

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(CACHE, JSON.stringify(cache, null, 2), "utf8");
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        ...data,
        resolvedAt: new Date().toISOString(),
        resolveStats: { jobs: jobs.length, ran: work.length, resolved, failed },
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(JSON.stringify({ out: OUT, resolved, failed, ran: work.length }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
