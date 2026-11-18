/**
 * Parse KWB fact-checker CSV → posts.json grouped by Page URL.
 * Marks each claim: use-column-i | needs-search | skip-mundane
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const IN =
  process.env.KWB_FACT_CSV?.trim() ||
  join(ROOT, "scripts/_tmp-kwb-fact/fact-checker.csv");
const OUT_DIR = join(ROOT, "scripts/_tmp-kwb-fact");
const OUT = join(OUT_DIR, "posts.json");
const URLS_OUT = join(OUT_DIR, "urls.json");

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

/** Homepage / root-only URLs are not valid citation targets. */
function isRootOnlyUrl(url) {
  try {
    const u = new URL(String(url || "").trim());
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return path === "/";
  } catch {
    return true;
  }
}

function looksNonMundane(text) {
  const t = String(text || "");
  if (/\d/.test(t)) return true;
  if (/\$|%|CAD|USD/i.test(t)) return true;
  if (/\b(mm|cm|inch|inches|decibel|dB|SOR\/|regulation|warranty)\b/i.test(t)) return true;
  if (/[®™]|&reg;|&trade;/i.test(t)) return true;
  if (
    /\b(PowerView|SoftTouch|Duette|Architella|EverWood|LightLock|Duolite|Pirouette|Vignette|Alustra|Honeycomb|Polysatin|Hunter Douglas)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  return false;
}

/** Minimal RFC4180 CSV parser */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;
  const s = text.replace(/^\uFEFF/, "");
  while (i < s.length) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (!rows.length) return [];
  const header = rows[0].map((h) => String(h || "").trim());
  return rows.slice(1).map((cols) => {
    /** @type {Record<string, string>} */
    const obj = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]] = cols[c] == null ? "" : String(cols[c]);
    }
    return obj;
  });
}

function main() {
  const raw = readFileSync(IN, "utf8");
  const rows = parseCsv(raw);
  /** @type {Map<string, any>} */
  const byUrl = new Map();
  const stats = {
    rows: 0,
    useColumnI: 0,
    homepageSource: 0,
    needsSearch: 0,
    skipMundane: 0,
    skipEmptyClaim: 0,
  };

  for (const row of rows) {
    const pageUrl = String(row["Page URL"] || "").trim();
    const claim = String(row.Claim || "").trim();
    if (!pageUrl || !pageUrl.includes("kwbllp.com")) continue;
    if (!claim || claim.toLowerCase() === "none") {
      stats.skipEmptyClaim += 1;
      continue;
    }
    stats.rows += 1;

    const sourceUrl = String(row["Source URL"] || "").trim();
    const suggested = String(row["Suggested wording"] || "").trim();
    const qualification = String(row.Qualification || "").trim();
    const verdict = String(row.Verdict || "").trim().toLowerCase();
    const sourceTitle = String(row["Source title"] || "").trim();
    const category = String(row.Category || "").trim();
    const product = String(row.Product || "").trim();

    let mode = "needs-search";
    let resolvedUrl = "";
    let sourceNote = "";
    if (isExternalUrl(sourceUrl) && isRootOnlyUrl(sourceUrl)) {
      mode = "use-column-i";
      resolvedUrl = "";
      sourceNote = "homepage-source";
      stats.homepageSource += 1;
    } else if (isExternalUrl(sourceUrl)) {
      mode = "use-column-i";
      resolvedUrl = sourceUrl;
      stats.useColumnI += 1;
    } else if (
      (verdict === "no product claims" || verdict === "no product claim") &&
      !looksNonMundane(suggested || claim)
    ) {
      mode = "skip-mundane";
      stats.skipMundane += 1;
    } else {
      stats.needsSearch += 1;
    }

    const entry = {
      claim,
      suggested,
      qualification,
      verdict,
      category,
      product,
      sourceTitle,
      sheetSourceUrl: sourceUrl,
      mode,
      resolvedUrl,
      sourceNote,
      sourceOrigin: mode === "use-column-i" ? "column-i" : "",
    };

    if (!byUrl.has(pageUrl)) {
      byUrl.set(pageUrl, {
        pageUrl,
        pageTitle: String(row["Page title"] || "").trim(),
        claims: [],
      });
    }
    byUrl.get(pageUrl).claims.push(entry);
  }

  const posts = [...byUrl.values()].sort((a, b) => a.pageUrl.localeCompare(b.pageUrl));
  const urls = posts.map((p) => p.pageUrl);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), stats, posts }, null, 2),
    "utf8",
  );
  writeFileSync(URLS_OUT, JSON.stringify(urls, null, 2), "utf8");
  console.log(
    JSON.stringify({ out: OUT, urls: URLS_OUT, posts: posts.length, urlCount: urls.length, stats }, null, 2),
  );
}

main();
