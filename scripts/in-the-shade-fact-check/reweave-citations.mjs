/**
 * Reweave unnatural external citations in In the Shade posts:
 * - Truncated source titles ("Something…") become the preceding sentence as anchor text
 * - Host-only leftovers ("hunterdouglas.com") after the same URL are removed
 * - Double closing </a></a> tags are cleaned
 *
 * Reads live-contents.json, writes updates-reweave.json, prints report.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = join(ROOT, "scripts/_tmp-itsf-fact");
const LIVE = join(DIR, "live-contents.json");
const OUT = join(DIR, "updates-reweave.json");
const REPORT = join(DIR, "reweave-report.json");

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

function isHostLabel(label) {
  return /^[a-z0-9.-]+\.(com|ca|org|net|gov|eu|uk)(\/[^\s]*)?$/i.test(String(label || "").trim());
}

function isTruncatedLabel(label) {
  const t = String(label || "").trim();
  if (!t) return false;
  if (/[…⋯]/.test(t) || /\.{2,}$/.test(t)) return true;
  // Truncated mid-word leftovers like "car…" already covered; also titles cut at ~57 chars
  if (t.endsWith("…") || t.endsWith("...")) return true;
  return false;
}

/** Page-title leftovers: "Something | Brand", "Title – Dealer", em dashes in link text. */
function isTitleStyleLabel(label) {
  const t = decodeEntities(String(label || "").trim());
  if (!t) return false;
  if (/\u2014/.test(t)) return true; // em dash never allowed in link text
  if (/\s\|\s/.test(t)) return true;
  if (/\s[\u2013\u2014]\s/.test(t)) return true; // en/em dash as title separator
  // Trailing dealer/brand after hyphen: "Aluminum Blinds in Boise - Boise Premier Blinds"
  if (/\s-\s+[A-Z][A-Za-z0-9'’&®™]*(?:\s+[A-Z][A-Za-z0-9'’&®™]*){0,4}\s*$/.test(t)) {
    return true;
  }
  return false;
}

function stripBrandSuffix(label) {
  let t = decodeEntities(String(label || "").trim());
  t = t.replace(/\u2014/g, "-"); // em dash → hyphen
  t = t.replace(/\u2013/g, "-"); // en dash → hyphen
  // Drop every " | …" segment after the primary phrase (multi-pipe titles)
  if (t.includes("|")) t = t.split("|")[0].trim();
  t = t.replace(/\s+-\s+[A-Z][A-Za-z0-9'’&®™]*(?:\s+[A-Z][A-Za-z0-9'’&®™]*){0,4}\s*$/u, "").trim();
  return t;
}

function isBadCitationLabel(label) {
  const t = String(label || "").trim();
  if (!t) return false;
  if (isHostLabel(t)) return true;
  if (isTruncatedLabel(t)) return true;
  if (isTitleStyleLabel(t)) return true;
  return false;
}

function splitResearch(html) {
  const idx = html.search(/id=["']research-and-fact-checking["']/i);
  if (idx < 0) return { body: html, research: "" };
  // include from the opening tag before the id when possible
  const open = html.lastIndexOf("<", idx);
  const cut = open >= 0 ? open : idx;
  return { body: html.slice(0, cut), research: html.slice(cut) };
}

function findSentenceStart(html, endIdx) {
  const before = html.slice(0, endIdx);
  // Prefer structural boundaries, then sentence punctuation
  const boundaries = [
    before.lastIndexOf("</p>"),
    before.lastIndexOf("</li>"),
    before.lastIndexOf("</td>"),
    before.lastIndexOf("</h2>"),
    before.lastIndexOf("</h3>"),
    before.lastIndexOf(">"),
  ];
  let start = Math.max(...boundaries.map((n) => (n < 0 ? -1 : n + (before[n] === ">" ? 1 : 0))));
  // If we landed just after a tag close like </p>, start is fine.
  // Refine with last . ! ? that is not inside a tag
  const chunk = before.slice(Math.max(0, start));
  let lastPunct = -1;
  let inTag = false;
  for (let i = 0; i < chunk.length; i++) {
    const ch = chunk[i];
    if (ch === "<") inTag = true;
    if (inTag) {
      if (ch === ">") inTag = false;
      continue;
    }
    if (ch === "." || ch === "!" || ch === "?") lastPunct = i;
  }
  if (lastPunct >= 0) {
    // start after punctuation + following space
    let s = Math.max(0, start) + lastPunct + 1;
    while (s < endIdx && /\s/.test(html[s])) s += 1;
    return s;
  }
  // after last >
  let s = Math.max(0, start);
  while (s < endIdx && /\s/.test(html[s])) s += 1;
  return s;
}

function plainLength(htmlFragment) {
  return decodeEntities(htmlFragment.replace(/<[^>]+>/g, "")).trim().length;
}

/**
 * Pick a natural anchor phrase from the plain sentence that captures the citation intent.
 */
function pickNaturalPhrase(plain, href, label) {
  const text = String(plain || "").trim();
  if (!text) return "";
  const lower = text.toLowerCase();
  const intent = String(label || "")
    .toLowerCase()
    .replace(/[…⋯].*$/, "")
    .replace(/\.{2,}.*$/, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim();

  // "like mildew growth or stretching if not..." → mildew growth or stretching
  const likeRe = /\b(?:like|such as)\s+(.+?)(?=\s+(?:if|when|while|unless)\b|[.!?]|$)/i;
  const like = lower.match(likeRe);
  if (like && like.index != null && like[1]) {
    const start = like.index + like[0].indexOf(like[1]);
    const phrase = text.slice(start, start + like[1].length).trim();
    if (phrase.split(/\s+/).length >= 2 && phrase.length <= 120) return phrase;
  }

  // Map common truncated-title intents onto body synonyms
  const synonymSets = [
    ["mould", "mold", "mildew"],
    ["energy", "insulation", "thermal", "heat loss"],
    ["uv", "ultraviolet", "fade", "fading"],
    ["automation", "motorized", "powerview", "schedule"],
    ["safety", "cordless", "cord"],
    ["humidity", "steam", "steamy", "polymer", "faux wood", "aluminum", "aluminium"],
    ["waterproof", "moisture", "vapor", "vapour"],
  ];
  for (const set of synonymSets) {
    if (!set.some((w) => intent.includes(w))) continue;
    for (const w of set) {
      const idx = lower.indexOf(w);
      if (idx < 0) continue;
      // Prefer a short noun phrase around the match
      const window = text.slice(Math.max(0, idx - 24), Math.min(text.length, idx + 48));
      const m = window.match(
        /([A-Za-z][A-Za-z0-9'’%-]*(?:\s+(?:or|and|of|to|for|in|on|with)?\s*[A-Za-z][A-Za-z0-9'’%-]*){1,6})/,
      );
      if (m && m[1] && m[1].length >= 12 && m[1].length <= 90) {
        // Prefer phrases that include the synonym
        if (m[1].toLowerCase().includes(w)) return m[1].trim();
      }
      // Fallback: 2-6 words starting at match
      const from = text.slice(idx).match(/^([A-Za-z0-9'’%-]+(?:\s+[A-Za-z0-9'’%-]+){1,5})/);
      if (from && from[1].length >= 12) return from[1].trim();
    }
  }

  // Trailing comma clause
  const parts = text.split(/,\s+/);
  if (parts.length > 1) {
    const clause = parts[parts.length - 1].trim();
    if (clause.length >= 24 && clause.length <= 140) return clause;
  }

  if (text.length <= 140) return text;
  const words = text.split(/\s+/);
  return words.slice(Math.max(0, words.length - 10)).join(" ");
}

/** Shorten overlong nofollow sentence wraps into a natural phrase. */
function shortenOverlongAnchors(html) {
  let out = html;
  const matches = [...out.matchAll(/<a\b([^>]*)>([^<]{141,})<\/a>/gi)];
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    const attrs = m[1] || "";
    const label = String(m[2] || "");
    const hrefM = attrs.match(/href="([^"]+)"/i);
    const href = hrefM ? hrefM[1] : "";
    if (!/^https?:/i.test(href) || /intheshadeflorida\.com/i.test(href)) continue;
    if (!/rel=["'][^"']*nofollow/i.test(attrs)) continue;
    const phrase = pickNaturalPhrase(decodeEntities(label), href, label);
    if (!phrase || phrase.length < 12 || phrase.length >= label.length) continue;
    const start = m.index || 0;
    const end = start + m[0].length;
    // Keep surrounding sentence text; only replace the anchor label span
    // Reconstruct: before phrase + new anchor + after phrase within old label
    const at = label.indexOf(phrase);
    if (at < 0) continue;
    const beforePhrase = label.slice(0, at);
    const afterPhrase = label.slice(at + phrase.length);
    const replacement =
      beforePhrase +
      `<a href="${href.replace(/"/g, "&quot;")}" rel="nofollow" target="_blank">${escapeHtml(phrase)}</a>` +
      afterPhrase;
    out = out.slice(0, start) + replacement + out.slice(end);
  }
  return out;
}

/** Lead product name for internal In the Shade links (short, no full sentence). */
function pickProductLead(plain) {
  const text = String(plain || "").trim();
  if (!text) return "";
  // Prefer trademarked / Proper product names at the start
  const tm = text.match(
    /^((?:[A-Z][A-Za-z0-9'’&.-]*[®™]?|(?:EverWood|Duette|LiteRise|PowerView|SoftTouch|Silhouette|Pirouette|Vignette|Solera|Modern Precious Metals)[®™]?)(?:\s+[A-Za-z0-9'’&®™.-]+){0,5})/,
  );
  if (tm && tm[1] && tm[1].length >= 8 && tm[1].length <= 80) return tm[1].trim();
  const words = text.split(/\s+/).slice(0, 5).join(" ");
  return words.length >= 8 ? words : text.slice(0, 48);
}

/** Last unclosed <a ...> open tag before idx, or -1. */
function findUnclosedAnchorOpen(html, idx) {
  const before = html.slice(0, idx);
  let depth = 0;
  let lastOpen = -1;
  const re = /<\/?a\b[^>]*>/gi;
  let m;
  while ((m = re.exec(before))) {
    const tag = m[0];
    if (/^<\/a/i.test(tag)) {
      depth = Math.max(0, depth - 1);
      if (depth === 0) lastOpen = -1;
    } else if (!/\/>$/.test(tag)) {
      depth += 1;
      lastOpen = m.index;
    }
  }
  return depth > 0 ? lastOpen : -1;
}

function externalAnchor(href, labelHtml) {
  return `<a href="${href.replace(/"/g, "&quot;")}" rel="nofollow" target="_blank">${labelHtml}</a>`;
}

/** Prefer a short in-sentence claim span (HTML substring of afterProduct). */
function findClaimSpanHtml(regionHtml, plain, href, label) {
  const candidates = [];
  const patterns = [
    /\baluminum does not absorb steam\b/i,
    /\bsteamy shower does not swell them\b/i,
    /\bslats are not wood\b/i,
    /\bdoes not absorb steam\b/i,
    /\bhumidity[^.!]{0,40}/i,
    /\bwaterproof[^.!]{0,40}/i,
    /\bmildew growth or stretching\b/i,
    /\bcordless\b[^.!]{0,40}/i,
    /\bmotorized\b[^.!]{0,40}/i,
  ];
  for (const re of patterns) {
    const m = regionHtml.match(re);
    if (m && m[0] && m[0].trim().length >= 8 && m[0].trim().length <= 90) {
      candidates.push(m[0].trim());
    }
  }
  const picked = pickNaturalPhrase(plain, href, label);
  if (picked && picked.length >= 8 && picked.length <= 90) {
    const needle = picked.slice(0, Math.min(24, picked.length));
    if (regionHtml.toLowerCase().includes(needle.toLowerCase())) candidates.push(picked);
  }
  // Prefer shortest real substring that appears verbatim in regionHtml
  for (const c of candidates.sort((a, b) => a.length - b.length)) {
    const at = regionHtml.indexOf(c);
    if (at >= 0) return { at, end: at + c.length, html: c };
    // entity-tolerant: first/last word bounds, but only if span stays short
    const words = c.split(/\s+/);
    if (words.length < 2) continue;
    const fAt = regionHtml.toLowerCase().indexOf(words[0].toLowerCase());
    const lAt = regionHtml.toLowerCase().lastIndexOf(words[words.length - 1].toLowerCase());
    if (fAt >= 0 && lAt > fAt) {
      const span = regionHtml.slice(fAt, lAt + words[words.length - 1].length);
      if (span.length >= 8 && span.length <= 100 && !/<a\b/i.test(span) && !/&(?!reg;|trade;|amp;|nbsp;|#)/i.test(span.slice(-6))) {
        return { at: fAt, end: fAt + span.length, html: span };
      }
    }
  }
  return null;
}

/**
 * Title-style cite nested inside an open product <a>: close product on a short lead,
 * move nofollow onto a natural claim phrase, drop the brand/title leftover.
 */
function repairNestedTitleCite(html, citeStart, citeEnd, href, label) {
  const openIdx = findUnclosedAnchorOpen(html, citeStart);
  if (openIdx < 0) return null;
  const openTagEnd = html.indexOf(">", openIdx);
  if (openTagEnd < 0) return null;
  const openTag = html.slice(openIdx, openTagEnd + 1);
  const outerHrefM = openTag.match(/href="([^"]+)"/i);
  const outerHref = outerHrefM ? outerHrefM[1] : "";
  const between = html.slice(openTagEnd + 1, citeStart);
  if (/<\/a>/i.test(between) || /<a\b/i.test(between)) return null;

  const plain = decodeEntities(between.replace(/<[^>]+>/g, "")).trim();
  if (plain.length < 12) return null;

  // Product lead: known lines + optional product nouns; never split &reg;
  const leadMatch = between.match(
    /^(\s*(?:Modern Precious Metals|EverWood|Duette|LiteRise|PowerView|SoftTouch|Silhouette|Pirouette|Vignette|Solera|[A-Z][A-Za-z0-9'’.-]*)(?:&reg;|®|™|&trade;)?(?:\s+(?:faux|wood|alternative|aluminum|aluminium|vinyl|polymer|honeycomb|cellular|roman|roller|blinds|shades|shutters)(?:&reg;|®|™|&trade;)?){0,4})/i,
  );
  const productHtml = leadMatch ? leadMatch[1] : between.slice(0, Math.min(48, between.length));
  // Guard: do not end mid-entity
  let productEnd = productHtml.length;
  if (/&(?:reg|trade|#\d+)?$/i.test(productHtml) || /&[a-z]*$/i.test(productHtml)) {
    const semi = between.indexOf(";", productHtml.length - 1);
    if (semi > 0) productEnd = semi + 1;
  }
  const productSlice = between.slice(0, productEnd);
  const afterProduct = between.slice(productEnd);

  const outerOpen =
    outerHref && /^https?:/i.test(outerHref)
      ? `<a href="${outerHref.replace(/"/g, "&quot;")}">`
      : openTag;

  const span = findClaimSpanHtml(afterProduct, plain, href, label);
  let rebuilt;
  if (span) {
    rebuilt =
      outerOpen +
      productSlice +
      `</a>` +
      afterProduct.slice(0, span.at) +
      externalAnchor(href, span.html) +
      afterProduct.slice(span.end);
  } else {
    const cleaned = stripBrandSuffix(label);
    const fallback =
      cleaned && cleaned.length >= 8 && cleaned.length <= 90
        ? cleaned
        : pickNaturalPhrase(plain, href, label);
    if (fallback && fallback.length >= 8 && fallback.length <= 90) {
      rebuilt =
        outerOpen +
        productSlice +
        `</a>` +
        afterProduct.replace(/\s+$/, "") +
        " " +
        externalAnchor(href, escapeHtml(fallback.replace(/\u2014|\u2013/g, "-")));
    } else {
      // Drop title cite only; still close the product link on the short lead
      rebuilt = outerOpen + productSlice + `</a>` + afterProduct;
    }
  }

  let after = html.slice(citeEnd);
  const rebuiltPlainTail = decodeEntities(rebuilt.replace(/<[^>]+>/g, "")).trimEnd();
  if (/^\s*\./.test(after) && /\.$/.test(rebuiltPlainTail)) {
    after = after.replace(/^\s*\.+/, "");
  } else {
    after = after.replace(/^\s+/, () => (/^[.,;:!?)}\]]/.test(after.trimStart()) ? "" : " "));
  }
  return html.slice(0, openIdx) + rebuilt + after;
}

function wrapSentenceAsAnchor(html, citeStart, citeEnd, href, label) {
  // Nested inside an open <a> (common In the Shade product wrap): repair that first
  if (isTitleStyleLabel(label) || isTruncatedLabel(label)) {
    const nested = repairNestedTitleCite(html, citeStart, citeEnd, href, label);
    if (nested) return nested;
  }

  let sentenceStart = findSentenceStart(html, citeStart);
  let sentenceHtml = html.slice(sentenceStart, citeStart).replace(/\s+$/, "");
  // Title leftover right after a finished sentence: pull the previous sentence
  if (!sentenceHtml || plainLength(sentenceHtml) < 12) {
    const prevEnd = sentenceStart > 0 ? sentenceStart - 1 : citeStart;
    const prevStart = findSentenceStart(html, Math.max(0, prevEnd));
    const prevHtml = html.slice(prevStart, citeStart).replace(/\s+$/, "");
    if (prevHtml && plainLength(prevHtml) >= 12 && !/<a\b/i.test(prevHtml)) {
      sentenceStart = prevStart;
      sentenceHtml = prevHtml;
    } else {
      return html.slice(0, citeStart) + html.slice(citeEnd);
    }
  }
  if (/<a\b/i.test(sentenceHtml)) {
    // Open tag may start before sentenceStart; try nested repair from cite
    const nested = repairNestedTitleCite(html, citeStart, citeEnd, href, label);
    if (nested) return nested;
    return html.slice(0, citeStart) + html.slice(citeEnd);
  }
  const plain = decodeEntities(sentenceHtml.replace(/<[^>]+>/g, "")).trim();
  const phrase = pickNaturalPhrase(plain, href, label);
  if (!phrase || phrase.length < 8) {
    return html.slice(0, citeStart) + html.slice(citeEnd);
  }

  // Locate phrase inside the sentence HTML (entity-tolerant: search first 24 plain chars)
  const needle = phrase.slice(0, Math.min(28, phrase.length));
  let rel = sentenceHtml.indexOf(needle);
  if (rel < 0) {
    const stripped = sentenceHtml.replace(/<[^>]+>/g, "");
    const decoded = decodeEntities(stripped);
    const at = decoded.indexOf(phrase);
    if (at < 0) {
      if (plain.length <= 160) {
        const anchor = externalAnchor(href, sentenceHtml);
        return html.slice(0, sentenceStart) + anchor + html.slice(citeEnd);
      }
      return html.slice(0, citeStart) + html.slice(citeEnd);
    }
    if (plain.length <= 160) {
      const anchor = externalAnchor(href, sentenceHtml);
      return html.slice(0, sentenceStart) + anchor + html.slice(citeEnd);
    }
    return html.slice(0, citeStart) + html.slice(citeEnd);
  }

  let absStart = sentenceStart + rel;
  let absEnd = absStart + phrase.length;
  const endNeedle = phrase.slice(Math.max(0, phrase.length - 24));
  const endRel = sentenceHtml.indexOf(endNeedle, rel);
  if (endRel >= 0) absEnd = sentenceStart + endRel + endNeedle.length;

  const before = html.slice(0, absStart);
  const mid = html.slice(absStart, absEnd);
  const afterSentence = html.slice(absEnd, citeStart);
  const after = html.slice(citeEnd);
  if (/<a\b/i.test(mid)) return html.slice(0, citeStart) + html.slice(citeEnd);
  return before + externalAnchor(href, mid) + afterSentence + after;
}

function reweaveBody(body) {
  let out = body;
  let removedHost = 0;
  let rewoven = 0;
  let droppedOnly = 0;

  // Iterate from the end so indexes stay valid
  const matches = [...out.matchAll(/<a\b([^>]*)>([^<]*)<\/a>/gi)];
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    const attrs = m[1] || "";
    const label = String(m[2] || "").trim();
    const hrefM = attrs.match(/href="([^"]+)"/i);
    const href = hrefM ? hrefM[1] : "";
    if (!/^https?:/i.test(href) || /intheshadeflorida\.com/i.test(href)) continue;
    if (!/rel=["'][^"']*nofollow/i.test(attrs)) continue;
    if (!isBadCitationLabel(label)) continue;

    const start = m.index || 0;
    const end = start + m[0].length;
    const beforeWindow = out.slice(Math.max(0, start - 240), start);

    // Host leftover right after another anchor to the same href: remove
    if (isHostLabel(label) && beforeWindow.includes(`href="${href}"`)) {
      out = out.slice(0, start) + out.slice(end);
      // also drop a single leftover space before if citation had leading space in match - match doesn't include leading space
      out = out.slice(0, start).replace(/\s+$/, (sp) => (sp.length ? " " : "")) + out.slice(start);
      // cleaner: trim one space immediately before removed cite when present
      if (start > 0 && /\s/.test(out[start - 1]) && out[start] !== "<") {
        // no-op; indexes already shifted by removal
      }
      const left = out.slice(0, start);
      const right = out.slice(start);
      out = left.replace(/\s$/, "") + (right.startsWith(".") || right.startsWith(",") || right.startsWith("<") ? right : right.replace(/^\s+/, " "));
      removedHost += 1;
      continue;
    }

    const next = wrapSentenceAsAnchor(out, start, end, href, label);
    if (next === out.slice(0, start) + out.slice(end)) {
      out = next;
      droppedOnly += 1;
    } else if (next !== out) {
      out = next;
      rewoven += 1;
    }
  }

  // Shorten overlong already-wrapped sentence anchors (previous pass) that still look unnatural
  out = shortenOverlongAnchors(out);

  // Any title-style labels that could not reweave: strip brand / pipe / dash tails in place
  const cleaned = stripTitleBrandsInPlace(out);
  out = cleaned.html;

  // Fix accidental nested closers
  out = out.replace(/<\/a>\s*<\/a>/g, "</a>");
  // Clean " ." / ".." after removals
  out = out.replace(/\s+\./g, ".");
  out = out.replace(/\.{2,}/g, ".");
  out = out.replace(/<a([^>]*)>\s+/g, "<a$1>");
  out = out.replace(/\s+<\/a>/g, "</a>");
  // No em dashes left in nofollow labels
  out = out.replace(/(<a\b[^>]*rel=["'][^"']*nofollow[^"']*["'][^>]*>)([^<]*)(<\/a>)/gi, (_, a, label, c) => {
    if (!/\u2014|\u2013/.test(label)) return _;
    return a + label.replace(/\u2014|\u2013/g, "-") + c;
  });

  return {
    html: out,
    removedHost,
    rewoven,
    droppedOnly,
    brandsStripped: cleaned.brandsStripped,
  };
}

/** Strip brand/pipe/em-dash tails from nofollow labels that remain title-shaped. */
function stripTitleBrandsInPlace(html) {
  let out = html;
  let brandsStripped = 0;
  const matches = [...out.matchAll(/<a\b([^>]*)>([^<]*)<\/a>/gi)];
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    const attrs = m[1] || "";
    const label = String(m[2] || "");
    const hrefM = attrs.match(/href="([^"]+)"/i);
    const href = hrefM ? hrefM[1] : "";
    if (!/^https?:/i.test(href) || /intheshadeflorida\.com/i.test(href)) continue;
    if (!/rel=["'][^"']*nofollow/i.test(attrs)) continue;
    if (!isTitleStyleLabel(label) && !/\u2014|\u2013/.test(label)) continue;
    const next = stripBrandSuffix(label);
    if (!next || next === decodeEntities(label).trim()) {
      // Still has em/en dash only: normalize dashes
      const dashed = decodeEntities(label).replace(/\u2014|\u2013/g, "-").trim();
      if (dashed === decodeEntities(label).trim()) continue;
      const start = m.index || 0;
      const end = start + m[0].length;
      out =
        out.slice(0, start) +
        `<a href="${href.replace(/"/g, "&quot;")}" rel="nofollow" target="_blank">${escapeHtml(dashed)}</a>` +
        out.slice(end);
      brandsStripped += 1;
      continue;
    }
    const start = m.index || 0;
    const end = start + m[0].length;
    out =
      out.slice(0, start) +
      `<a href="${href.replace(/"/g, "&quot;")}" rel="nofollow" target="_blank">${escapeHtml(next)}</a>` +
      out.slice(end);
    brandsStripped += 1;
  }
  return { html: out, brandsStripped };
}

function reweavePost(content) {
  const { body, research } = splitResearch(content);
  const result = reweaveBody(body);
  // Research list links often keep source titles: strip brand tails + em dashes there too
  const researchClean = research ? stripTitleBrandsInPlace(research) : { html: "", brandsStripped: 0 };
  return {
    html: result.html + researchClean.html,
    removedHost: result.removedHost,
    rewoven: result.rewoven,
    droppedOnly: result.droppedOnly,
    brandsStripped: (result.brandsStripped || 0) + researchClean.brandsStripped,
  };
}

function main() {
  const live = JSON.parse(readFileSync(LIVE, "utf8"));
  const updates = [];
  const reports = [];
  for (const row of live.posts || []) {
    if (!row.id || !row.content) continue;
    const before = String(row.content);
    const { html, removedHost, rewoven, droppedOnly, brandsStripped } = reweavePost(before);
    if (html === before) continue;
    updates.push({ id: row.id, pageUrl: row.pageUrl, content: html, type: row.type || "post" });
    reports.push({ pageUrl: row.pageUrl, id: row.id, removedHost, rewoven, droppedOnly, brandsStripped });
  }
  mkdirSync(DIR, { recursive: true });
  writeFileSync(OUT, JSON.stringify({ updates }, null, 2), "utf8");
  writeFileSync(REPORT, JSON.stringify({ reports }, null, 2), "utf8");
  console.log(
    JSON.stringify(
      {
        changedPosts: updates.length,
        totalRewoven: reports.reduce((n, r) => n + r.rewoven, 0),
        totalHostRemoved: reports.reduce((n, r) => n + r.removedHost, 0),
        totalDropped: reports.reduce((n, r) => n + r.droppedOnly, 0),
        totalBrandsStripped: reports.reduce((n, r) => n + (r.brandsStripped || 0), 0),
        out: OUT,
      },
      null,
      2,
    ),
  );
}

main();
