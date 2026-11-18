/**
 * Force Neo Digital external claim links to ≤5-word natural anchors.
 * Sentence-spanning nofollow links become short woven phrases; surrounding text stays.
 *
 * Usage:
 *   node scripts/neo-digital-fact-check/dump-all-posts-sap.mjs
 *   node scripts/neo-digital-fact-check/shorten-claim-anchors.mjs --apply
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SEED = join(ROOT, "src/components/integrations/default-properties-seed.json");
const DIR = join(ROOT, "scripts/_tmp-nd-fact");
const LIVE = join(DIR, "live-contents.json");
const OUT = join(DIR, "updates-short-anchors.json");
const REPORT = join(DIR, "short-anchors-report.json");
const MAX_WORDS = 5;

function loadSite() {
  const seed = JSON.parse(readFileSync(SEED, "utf8"));
  const site = (seed.sites || []).find((s) => String(s.siteUrl || "").includes("neodigital.ca"));
  if (!site?.username || !site?.appPassword) throw new Error("Neo Digital seed credentials missing");
  return site;
}

function authHeader(site) {
  return `Basic ${Buffer.from(`${site.username}:${site.appPassword.replace(/\s+/g, "")}`).toString("base64")}`;
}

function decodeEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#8217;|&rsquo;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wordCount(s) {
  return String(s || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function clampWords(phrase, max = MAX_WORDS) {
  const words = String(phrase || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "";
  return words.slice(0, max).join(" ");
}

/** Pick a ≤5-word natural claim phrase from long link text (mid-sentence noun phrase). */
function pickShortAnchor(label) {
  const text = decodeEntities(label).replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (wordCount(text) <= MAX_WORDS) return text;

  // Prefer plan / product noun phrases woven mid-sentence (not "Brand verb a…")
  const plan = text.match(
    /\b((?:free|pro|annual|lifetime|paid)\s+(?:version|plan|plans|subscription|membership|access|license|licence)(?:\s+[A-Za-z0-9+.-]+){0,2})\b/i,
  );
  if (plan?.[1]) return clampWords(plan[1]);

  const feature = text.match(
    /\b((?:visual\s+drag-and-drop|drag-and-drop|page\s+builder|theme\s+builder|visual\s+editor|lifetime\s+access|annual\s+membership|front-end\s+editing|back-end\s+editing|granular\s+control|integrated\s+solution|hundreds\s+of\s+layouts)(?:\s+[A-Za-z0-9+.-]+){0,2})\b/i,
  );
  if (feature?.[1]) return clampWords(feature[1]);

  const named = text.match(
    /\b((?:Elementor(?:\s+Pro)?|Divi(?:\s+Builder)?|WordPress|Google(?:\s+(?:Analytics|Search\s+Console|Ads))?|Elegant\s+Themes|Yoast|Rank\s+Math|WooCommerce|Shopify|Semrush|OpenAI)(?:\s+[A-Za-z0-9+.-]+){0,3})\b/i,
  );
  if (named?.[1] && wordCount(named[1]) <= MAX_WORDS) {
    // Avoid linking "Elementor provides a free" — brand alone is fine when plan phrase missing
    const brandOnly = named[1].trim().split(/\s+/).slice(0, 2).join(" ");
    return brandOnly;
  }

  // Skip leading filler / verb openers, then take ≤5 words
  const cleaned = text
    .replace(
      /^(?:the|a|an|this|that|these|those|its|their|our|elementor|divi)\s+(?:provides?|offers?|allows?|includes?|is|are)\s+(?:a|an|the)?\s*/i,
      "",
    )
    .replace(/^(?:the|a|an|this|that|these|those|its|their|our)\s+/i, "");
  return clampWords(cleaned);
}

function shortenHtml(html) {
  let out = String(html || "");
  let shortened = 0;
  // Text-only anchors (no nested tags). Process from the end.
  const re = /<a\b([^>]*)>([^<]+)<\/a>/gi;
  const matches = [...out.matchAll(re)];
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    const attrs = m[1] || "";
    const label = String(m[2] || "");
    const hrefM = attrs.match(/href=["']([^"']+)["']/i);
    const href = hrefM ? hrefM[1] : "";
    if (!/^https?:/i.test(href)) continue;
    if (/neodigital\.ca/i.test(href)) continue;
    if (!/rel=["'][^"']*nofollow/i.test(attrs)) continue;
    const plain = decodeEntities(label).replace(/\s+/g, " ").trim();
    if (wordCount(plain) <= MAX_WORDS) continue;

    const phrase = pickShortAnchor(plain);
    if (!phrase || wordCount(phrase) > MAX_WORDS) continue;
    if (phrase.length >= plain.length) continue;

    let at = plain.indexOf(phrase);
    if (at < 0) {
      // case-insensitive locate
      const li = plain.toLowerCase().indexOf(phrase.toLowerCase());
      if (li < 0) {
        // fallback: first N words of original label
        const first = clampWords(plain);
        at = 0;
        const beforePhrase = "";
        const afterPhrase = plain.slice(first.length);
        const start = m.index || 0;
        const end = start + m[0].length;
        const replacement =
          beforePhrase +
          `<a href="${href.replace(/"/g, "&quot;")}" rel="nofollow" target="_blank">${escapeHtml(first)}</a>` +
          afterPhrase;
        out = out.slice(0, start) + replacement + out.slice(end);
        shortened += 1;
        continue;
      }
      at = li;
    }
    const matchedPhrase = plain.slice(at, at + phrase.length);
    const beforePhrase = plain.slice(0, at);
    const afterPhrase = plain.slice(at + matchedPhrase.length);
    const start = m.index || 0;
    const end = start + m[0].length;
    const replacement =
      beforePhrase +
      `<a href="${href.replace(/"/g, "&quot;")}" rel="nofollow" target="_blank">${escapeHtml(matchedPhrase)}</a>` +
      afterPhrase;
    out = out.slice(0, start) + replacement + out.slice(end);
    shortened += 1;
  }
  return { html: out, shortened };
}

function restBase(type, site) {
  const root = site.siteUrl.replace(/\/$/, "");
  if (type === "service-area") return `${root}/wp-json/wp/v2/service-area`;
  if (type === "page") return `${root}/wp-json/wp/v2/pages`;
  return `${root}/wp-json/wp/v2/posts`;
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

async function applyUpdates(updates) {
  const site = loadSite();
  const auth = authHeader(site);
  const results = await mapPool(updates, 3, async (u) => {
    try {
      const res = await fetch(`${restBase(u.type || "post", site)}/${u.id}`, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify({ content: u.content }),
      });
      const text = await res.text();
      if (!res.ok) return { id: u.id, pageUrl: u.pageUrl, ok: false, status: res.status, error: text.slice(0, 200) };
      return { id: u.id, pageUrl: u.pageUrl, ok: true, status: res.status };
    } catch (err) {
      return { id: u.id, pageUrl: u.pageUrl, ok: false, error: String(err?.message || err).slice(0, 200) };
    }
  });
  return results;
}

async function main() {
  mkdirSync(DIR, { recursive: true });
  if (!existsSync(LIVE)) throw new Error(`Missing ${LIVE}. Run dump-all-posts-sap.mjs first.`);
  const live = JSON.parse(readFileSync(LIVE, "utf8"));
  const posts = (live.posts || []).filter((p) => p?.id && p.content);
  const updates = [];
  const reports = [];
  for (const row of posts) {
    const { html, shortened } = shortenHtml(String(row.content));
    reports.push({ id: row.id, pageUrl: row.pageUrl, type: row.type, shortened });
    if (shortened > 0 && html !== row.content) {
      updates.push({ id: row.id, pageUrl: row.pageUrl, type: row.type || "post", content: html, shortened });
    }
  }
  writeFileSync(OUT, JSON.stringify({ updates }, null, 2), "utf8");
  writeFileSync(
    REPORT,
    JSON.stringify(
      {
        scanned: posts.length,
        changed: updates.length,
        totalShortened: updates.reduce((n, u) => n + u.shortened, 0),
        reports: reports.filter((r) => r.shortened > 0),
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(
    JSON.stringify(
      {
        scanned: posts.length,
        changed: updates.length,
        totalShortened: updates.reduce((n, u) => n + u.shortened, 0),
      },
      null,
      2,
    ),
  );

  if (process.argv.includes("--apply") && updates.length) {
    const results = await applyUpdates(updates);
    const ok = results.filter((r) => r.ok).length;
    const fail = results.filter((r) => !r.ok);
    writeFileSync(join(DIR, "short-anchors-apply.json"), JSON.stringify({ ok, fail: fail.length, results }, null, 2));
    console.log(JSON.stringify({ applyOk: ok, applyFail: fail.length, sampleFail: fail.slice(0, 5) }, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
