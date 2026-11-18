/**
 * Surgical HTML updates for one In the Shade post from resolved claims.
 * Suggested wording becomes the visible nofollow anchor to the source URL.
 */
import {
  RESEARCH_LOCALES,
  buildResearchEeatHtml,
  replaceResearchEeatBlock,
} from "../fact-check-shared/research-eeat.mjs";

function decodeEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#8217;|&rsquo;|&#39;|&#x27;/gi, "'")
    .replace(/&#8220;|&ldquo;/gi, '"')
    .replace(/&#8221;|&rdquo;/gi, '"')
    .replace(/&#8211;|&ndash;/gi, "-")
    .replace(/&#8212;|&mdash;/gi, "-")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&reg;/gi, "®")
    .replace(/&trade;/gi, "™")
    .replace(/&copy;/gi, "©")
    .replace(/&#174;/g, "®")
    .replace(/&#8482;/g, "™");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sourceLabel(claim) {
  const title = stripTitleBrandFromWording(String(claim.sourceTitle || "").trim());
  if (title && !/^https?:/i.test(title) && title.toLowerCase() !== "intheshadeflorida.com") {
    return title.length > 60 ? title.slice(0, 57) + "..." : title;
  }
  try {
    return new URL(claim.resolvedUrl).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

function stripTitleBrandFromWording(text) {
  let t = decodeEntities(String(text || "").trim());
  t = t.replace(/\u2014/g, "-").replace(/\u2013/g, "-");
  if (t.includes("|")) t = t.split("|")[0].trim();
  t = t.replace(/\s+-\s+[A-Z][A-Za-z0-9'’&®™]*(?:\s+[A-Z][A-Za-z0-9'’&®™]*){0,4}\s*$/u, "").trim();
  return t;
}

function wordingForClaim(claim) {
  const suggested = String(claim.suggested || "").trim();
  const claimText = String(claim.claim || "").trim();
  // Never use a source-title leftover ("Topic | Brand") as anchor text
  const looksLikeTitle =
    /\s\|\s/.test(suggested) ||
    /\u2014|\u2013/.test(suggested) ||
    /\s-\s+[A-Z][A-Za-z0-9'’&®™]*(?:\s+[A-Z][A-Za-z0-9'’&®™]*){0,4}\s*$/.test(suggested);
  if (suggested && !looksLikeTitle) return suggested.replace(/\u2014|\u2013/g, "-");
  if (suggested && looksLikeTitle) {
    const cleaned = stripTitleBrandFromWording(suggested);
    if (cleaned && cleaned.length >= 12 && cleaned !== suggested) {
      // Still title-shaped short fragment: prefer the claim sentence instead
      if (claimText && claimText.length >= cleaned.length) return claimText.replace(/\u2014|\u2013/g, "-");
      return cleaned;
    }
    if (claimText) return claimText.replace(/\u2014|\u2013/g, "-");
  }
  return claimText.replace(/\u2014|\u2013/g, "-");
}

function normalizeKey(s) {
  return decodeEntities(s)
    .replace(/[®™©]/g, "")
    .replace(/[^a-z0-9$%]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function anchorHtml(claim, wording) {
  const href = String(claim.resolvedUrl).replace(/"/g, "&quot;");
  return `<a href="${href}" rel="nofollow" target="_blank">${escapeHtml(wording)}</a>`;
}

/**
 * Build plain text + map from each plain char index to HTML index.
 * Tags are skipped in plain text.
 */
function htmlToPlainMap(html) {
  const plainChars = [];
  const map = [];
  let i = 0;
  while (i < html.length) {
    if (html[i] === "<") {
      const end = html.indexOf(">", i);
      if (end < 0) break;
      i = end + 1;
      continue;
    }
    if (html[i] === "&") {
      const end = html.indexOf(";", i);
      if (end > i && end - i < 12) {
        const ent = html.slice(i, end + 1);
        const decoded = decodeEntities(ent);
        for (let c = 0; c < decoded.length; c++) {
          plainChars.push(decoded[c]);
          map.push(i);
        }
        i = end + 1;
        continue;
      }
    }
    plainChars.push(html[i]);
    map.push(i);
    i += 1;
  }
  return { plain: plainChars.join(""), map };
}

function findNormalizedSpan(plain, needleNorm) {
  if (!needleNorm || needleNorm.length < 8) return null;
  const normChars = [];
  const normToPlain = [];
  let i = 0;
  while (i < plain.length) {
    const ch = plain[i];
    if (/[®™©]/.test(ch)) {
      i += 1;
      continue;
    }
    if (/[a-z0-9$%]/i.test(ch)) {
      normChars.push(ch.toLowerCase());
      normToPlain.push(i);
      i += 1;
      continue;
    }
    if (normChars.length && normChars[normChars.length - 1] !== " ") {
      normChars.push(" ");
      normToPlain.push(i);
    }
    i += 1;
  }
  const compact = [];
  const compactMap = [];
  for (let n = 0; n < normChars.length; n++) {
    const c = normChars[n];
    if (c === " ") {
      if (compact.length && compact[compact.length - 1] !== " ") {
        compact.push(" ");
        compactMap.push(normToPlain[n]);
      }
      continue;
    }
    compact.push(c);
    compactMap.push(normToPlain[n]);
  }
  const hay = compact.join("");
  const idx = hay.indexOf(needleNorm);
  if (idx < 0) return null;
  const startPlain = compactMap[idx];
  const endPlain = compactMap[idx + needleNorm.length - 1];
  if (startPlain == null || endPlain == null) return null;
  return { startPlain, endPlain: endPlain + 1 };
}

function isInsideAttribute(html, index) {
  const before = html.slice(Math.max(0, index - 300), index);
  const lastLt = before.lastIndexOf("<");
  const lastGt = before.lastIndexOf(">");
  if (lastLt > lastGt) {
    const tagSoFar = before.slice(lastLt);
    const quoteCount = (tagSoFar.match(/"/g) || []).length;
    return quoteCount % 2 === 1;
  }
  return false;
}

/** If the claim span sits inside an existing <a>, return that open/close range. */
function findEnclosingAnchor(html, start, end) {
  const before = html.slice(0, start);
  const openMatch = before.match(/<a\b[^>]*>/gi);
  if (!openMatch) return null;
  const openTag = openMatch[openMatch.length - 1];
  const openAt = before.lastIndexOf(openTag);
  if (openAt < 0) return null;
  const afterOpen = html.slice(openAt);
  const closeRel = afterOpen.search(/<\/a>/i);
  if (closeRel < 0) return null;
  const closeAt = openAt + closeRel;
  const closeEnd = closeAt + 4;
  if (end > closeAt) return null;
  if (start < openAt + openTag.length) return null;
  return { openAt, openEnd: openAt + openTag.length, closeAt, closeEnd };
}

function findClaimSpan(html, original) {
  let idx = html.indexOf(original);
  let endIdx = idx >= 0 ? idx + original.length : -1;
  if (idx >= 0 && isInsideAttribute(html, idx)) {
    idx = -1;
    endIdx = -1;
  }

  if (idx < 0) {
    const variants = [
      original.replace(/'/g, "&#8217;"),
      original.replace(/'/g, "&#039;"),
      original.replace(/®/g, "&reg;"),
      original.replace(/™/g, "&trade;"),
      original.replace(/®/g, "&#174;"),
      original.replace(/&/g, "&amp;"),
    ];
    for (const v of variants) {
      const i = html.indexOf(v);
      if (i >= 0 && !isInsideAttribute(html, i)) {
        idx = i;
        endIdx = i + v.length;
        break;
      }
    }
  }

  if (idx < 0) {
    const { plain, map } = htmlToPlainMap(html);
    const needleNorm = normalizeKey(original);
    const span = findNormalizedSpan(plain, needleNorm);
    if (!span) return null;
    const htmlStart = map[span.startPlain];
    const htmlEnd = map[span.endPlain - 1];
    if (htmlStart == null || htmlEnd == null) return null;
    idx = htmlStart;
    let e = htmlEnd;
    if (html[e] === "&") {
      const semi = html.indexOf(";", e);
      if (semi > e) e = semi;
    }
    endIdx = e + 1;
  }

  return { idx, endIdx };
}

/**
 * Find first occurrence of claim text in HTML and replace with linked suggested wording.
 */
function replaceClaimOnce(html, claim) {
  const original = String(claim.claim || "").trim();
  const next = wordingForClaim(claim);
  const hasUrl =
    Boolean(claim.resolvedUrl) && claim.mode !== "skip-mundane" && claim.mode !== "unresolved";
  if (!original) return { html, replaced: false };

  const span = findClaimSpan(html, original);
  if (!span) {
    // Already-updated wording: wrap or refresh suggested text if present
    if (next) {
      const already = findClaimSpan(html, next);
      if (already) {
        if (hasUrl) {
          const enclosing = findEnclosingAnchor(html, already.idx, already.endIdx);
          if (
            enclosing &&
            html.slice(enclosing.openAt, enclosing.openEnd).includes(claim.resolvedUrl) &&
            /rel=["'][^"']*nofollow/i.test(html.slice(enclosing.openAt, enclosing.openEnd))
          ) {
            let cleaned = stripTrailingSameHrefCitation(
              html,
              enclosing.closeEnd,
              claim.resolvedUrl,
            );
            return {
              html: cleaned,
              replaced: cleaned !== html,
              linked: true,
              alreadyCorrect: cleaned === html,
            };
          }
          return wrapOrUpdateSpan(html, already.idx, already.endIdx, claim, next, true);
        }
        return { html, replaced: false, reason: "already-worded", alreadyCorrect: true };
      }
    }
    return { html, replaced: false, reason: "not-found" };
  }

  return wrapOrUpdateSpan(html, span.idx, span.endIdx, claim, next, hasUrl);
}

/** Drop a leftover trailing source-title citation for the same href (prior script style). */
function stripTrailingSameHrefCitation(html, afterIdx, href) {
  if (!href || afterIdx < 0 || afterIdx >= html.length) return html;
  const tail = html.slice(afterIdx);
  const escaped = String(href).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `^(\\s*<a\\b[^>]*href="${escaped}"[^>]*>)([^<]{1,80})(<\\/a>)`,
    "i",
  );
  const m = tail.match(re);
  if (!m) return html;
  // Keep only short host/title leftovers (not full-sentence anchors)
  const label = String(m[2] || "").trim();
  if (label.length > 60) return html;
  if (/\.\s*$/.test(label) && label.split(/\s+/).length > 6) return html;
  return html.slice(0, afterIdx) + tail.slice(m[0].length);
}

function wrapOrUpdateSpan(html, idx, endIdx, claim, next, hasUrl = true) {
  const enclosing = findEnclosingAnchor(html, idx, endIdx);
  if (enclosing && hasUrl) {
    const openTag = `<a href="${String(claim.resolvedUrl).replace(/"/g, "&quot;")}" rel="nofollow" target="_blank">`;
    let newHtml =
      html.slice(0, enclosing.openAt) +
      openTag +
      escapeHtml(next) +
      "</a>" +
      html.slice(enclosing.closeEnd);
    const after = enclosing.openAt + openTag.length + escapeHtml(next).length + 4;
    newHtml = stripTrailingSameHrefCitation(newHtml, after, claim.resolvedUrl);
    return { html: newHtml, replaced: true, linked: true };
  }

  const body = hasUrl ? anchorHtml(claim, next) : next;
  let newHtml = html.slice(0, idx) + body + html.slice(endIdx);
  if (hasUrl) {
    newHtml = stripTrailingSameHrefCitation(newHtml, idx + body.length, claim.resolvedUrl);
  }
  return { html: newHtml, replaced: true, linked: hasUrl };
}

/**
 * @param {string} html
 * @param {{ pageTitle?: string, claims: any[] }} post
 * @param {{ insertResearch?: boolean }} [options]
 */
/** Restore accidental markdown headings that were saved as paragraphs. */
function restoreMarkdownHeadingParagraphs(html) {
  return String(html || "").replace(/<p>\s*(#{1,6})\s+([^<]+?)\s*<\/p>/g, (full, hashes, title) => {
    const level = Math.min(6, String(hashes).length);
    const text = String(title || "").trim();
    if (!text || text.length > 120) return full;
    const slug = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return `<h${level} id="${slug}">${text}</h${level}>`;
  });
}

export function buildPostHtml(html, post, options = {}) {
  const insertResearch = options.insertResearch === true;
  let out = restoreMarkdownHeadingParagraphs(html);
  const sources = [];
  const report = { replaced: 0, missed: [], linked: 0, homepageSkipped: 0 };

  const claims = [...(post.claims || [])].sort(
    (a, b) => String(b.claim || "").length - String(a.claim || "").length,
  );

  for (const claim of claims) {
    const shouldTouch =
      Boolean(String(claim.suggested || "").trim()) ||
      Boolean(claim.resolvedUrl) ||
      Boolean(String(claim.qualification || "").trim()) ||
      claim.sourceNote === "homepage-source";
    if (!shouldTouch && claim.mode === "skip-mundane") continue;

    if (claim.sourceNote === "homepage-source") {
      report.homepageSkipped += 1;
    }

    const result = replaceClaimOnce(out, claim);
    out = result.html;
    if (result.replaced || result.alreadyCorrect) {
      if (result.replaced) report.replaced += 1;
      if ((result.linked || result.alreadyCorrect) && claim.resolvedUrl) {
        report.linked += 1;
        sources.push({
          url: claim.resolvedUrl,
          title: claim.sourceTitle || sourceLabel(claim),
        });
      }
    } else {
      report.missed.push({
        claim: String(claim.claim || "").slice(0, 120),
        reason: result.reason || "not-found",
        mode: claim.mode,
        sourceNote: claim.sourceNote || "",
      });
    }
  }

  // Remove leftover short source-title citations (prior script) outside the research block
  const researchIdx = out.search(/id=["']research-and-fact-checking["']/i);
  const body = researchIdx >= 0 ? out.slice(0, researchIdx) : out;
  const research = researchIdx >= 0 ? out.slice(researchIdx) : "";
  let cleanedBody = body;
  for (const s of sources) {
    const href = String(s.url || "").trim();
    if (!href) continue;
    const escaped = href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleanedBody = cleanedBody.replace(
      new RegExp(`\\s*<a\\b[^>]*href="${escaped}"[^>]*rel=["'][^"']*nofollow[^"']*["'][^>]*>\\s*([^<]{1,60})\\s*<\\/a>`, "gi"),
      (full, label) => {
        const words = String(label || "")
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        // Keep full-sentence claim anchors; drop host/title leftovers
        if (words.length >= 8 || String(label || "").trim().length > 55) return full;
        return "";
      },
    );
  }
  out = cleanedBody + research;

  if (insertResearch) {
    const topic = topicFromTitle(post.pageTitle);
    if (/id=["']research-and-fact-checking["']/.test(out)) {
      const replaced = replaceResearchEeatBlock(out, RESEARCH_LOCALES.itsf, topic);
      if (replaced) out = replaced;
    } else {
      const disclosure = researchDisclosure(sources, topic);
      if (/<div class=["']flo-faq["']>/i.test(out)) {
        out = out.replace(/<div class=["']flo-faq["']>/i, `${disclosure}\n<div class="flo-faq">`);
      } else if (/<h2[^>]*\bid=["']faq["']/i.test(out)) {
        out = out.replace(/<h2[^>]*\bid=["']faq["'][^>]*>/i, `${disclosure}\n$&`);
      } else {
        out = `${out}\n${disclosure}`;
      }
    }
  }

  return { html: out, report, sources };
}

function researchDisclosure(sources, topicHint) {
  const uniq = [];
  const seen = new Set();
  for (const s of sources) {
    const url = String(s.url || "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    uniq.push(s);
  }
  const list =
    uniq.length === 0
      ? ""
      : `<ul>\n${uniq
          .map((s) => {
            const href = escapeHtml(s.url);
            const rawTitle = stripTitleBrandFromWording(String(s.title || "").trim()) || s.url;
            const label = escapeHtml(rawTitle);
            return `<li><a href="${href}" rel="nofollow" target="_blank">${label}</a></li>`;
          })
          .join("\n")}\n</ul>`;

  return buildResearchEeatHtml(RESEARCH_LOCALES.itsf, topicHint, list);
}

function topicFromTitle(title) {
  const t = String(title || "").trim();
  if (!t) return "window coverings";
  return t.replace(/\s*\|\s*In the Shade.*$/i, "").trim() || "window coverings";
}

export { normalizeKey as normalizeForMatch, wordingForClaim };
