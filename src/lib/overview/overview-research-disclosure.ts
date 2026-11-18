/**
 * Insert (or replace) the Research & Fact-Checking H2 immediately before the FAQ.
 * Mirrors the aiseo-blog-review skill disclosure block.
 */

import { findH2OpenPositions } from "@/lib/overview/overview-blog-overview-prepend";
import { plainTextFromH2InnerHtml } from "@/lib/overview/overview-blog-headers-extract";
import { stripTrailingFaqSection } from "@/lib/overview/overview-blog-faq-append";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";

export const RESEARCH_DISCLOSURE_ANCHOR_ID = "research-and-fact-checking";

function escapeHtml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isResearchDisclosureTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  return (
    t === "research & fact-checking" ||
    t === "research and fact-checking" ||
    (t.includes("research") && t.includes("fact"))
  );
}

function headingOpenHasId(html: string, openAt: number, id: string): boolean {
  const gt = html.indexOf(">", openAt);
  if (gt < 0) return false;
  const openTag = html.slice(openAt, gt).toLowerCase();
  return openTag.includes(`id="${id}"`) || openTag.includes(`id='${id}'`);
}

/** Remove an existing Research & Fact-Checking H2 block (by id or title). */
export function stripResearchDisclosureSection(html: string): string {
  const src = html ?? "";
  if (!src.trim()) return src;
  const positions = findH2OpenPositions(src);
  const low = src.toLowerCase();
  for (const openAt of positions) {
    const gt = src.indexOf(">", openAt);
    if (gt < 0) continue;
    const closeAt = low.indexOf("</h2>", gt + 1);
    if (closeAt < 0) continue;
    const title = plainTextFromH2InnerHtml(src.slice(gt + 1, closeAt));
    const isDisclosure =
      headingOpenHasId(src, openAt, RESEARCH_DISCLOSURE_ANCHOR_ID) ||
      isResearchDisclosureTitle(title);
    if (!isDisclosure) continue;
    let end = src.length;
    for (const pos of positions) {
      if (pos > openAt) {
        end = pos;
        break;
      }
    }
    return `${src.slice(0, openAt).trimEnd()}\n${src.slice(end).trimStart()}`.trim();
  }
  return src;
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url.trim()).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Collect unique external http(s) hrefs from HTML, excluding the client host. */
export function collectExternalSourceUrlsFromHtml(
  html: string,
  clientSiteUrl?: string | null,
): string[] {
  const clientHost = clientSiteUrl ? hostFromUrl(clientSiteUrl) : "";
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /href\s*=\s*["'](https?:\/\/[^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html ?? "")) !== null) {
    const href = (m[1] || "").trim();
    if (!href) continue;
    const key = normalizePageUrlKey(href);
    if (!key || seen.has(key)) continue;
    const hrefHost = hostFromUrl(href);
    if (clientHost && hrefHost && hrefHost === clientHost) continue;
    seen.add(key);
    out.push(href);
    if (out.length >= 12) break;
  }
  return out;
}

export function buildResearchAndFactCheckingHtml(args: {
  topic: string;
  author: string;
  reviewedLabel: string;
  sourceUrls: string[];
}): string {
  const topic = escapeHtml(args.topic.trim() || "this topic");
  const author = escapeHtml(args.author.trim() || "the author");
  const reviewed = escapeHtml(args.reviewedLabel.trim() || "this month");
  const sourceItems = args.sourceUrls
    .map((u) => u.trim())
    .filter(Boolean)
    .map((u) => {
      const safe = escapeHtml(u);
      return `<li><a href="${safe}" rel="noopener noreferrer" target="_blank">${safe}</a></li>`;
    });
  const sourcesBlock =
    sourceItems.length > 0
      ? `<p>Primary sources linked in this article:</p>\n<ul>\n${sourceItems.join("\n")}\n</ul>`
      : `<p>Our research draws on manufacturer documentation, technical product information, and relevant government and industry resources.</p>`;

  return [
    `<h2 id="${RESEARCH_DISCLOSURE_ANCHOR_ID}">Research &amp; Fact-Checking</h2>`,
    `<p>This article has undergone a factual review covering product specifications, manufacturer information, installation considerations, and technical claims relating to ${topic}.</p>`,
    `<p>Product-specific statements and technical claims are evaluated against available supporting documentation. Where evidence requires qualification, wording is adjusted to reflect the available information.</p>`,
    `<p>Written by ${author}. Technical claims in this article were checked against the manufacturer guides and government pages linked here. Research reviewed: ${reviewed}.</p>`,
    sourcesBlock,
  ].join("\n");
}

/**
 * Place Research & Fact-Checking immediately before FAQ (or append when FAQ is absent).
 * Replaces any prior disclosure block.
 */
export function insertResearchAndFactCheckingDisclosure(args: {
  html: string;
  topic: string;
  author: string;
  reviewedLabel?: string;
  sourceUrls?: string[];
  clientSiteUrl?: string | null;
}): string {
  const raw = (args.html ?? "").trim();
  if (!raw) return raw;

  const withoutOld = stripResearchDisclosureSection(raw);
  const withoutFaq = stripTrailingFaqSection(withoutOld);
  const faqBlock =
    withoutOld.length > withoutFaq.length
      ? withoutOld.slice(withoutFaq.length).trim()
      : "";

  const now = new Date();
  const reviewedLabel =
    args.reviewedLabel?.trim() ||
    now.toLocaleString("en-US", { month: "long", year: "numeric" });
  const sourceUrls =
    args.sourceUrls ??
    collectExternalSourceUrlsFromHtml(withoutFaq, args.clientSiteUrl);

  const disclosure = buildResearchAndFactCheckingHtml({
    topic: args.topic,
    author: args.author,
    reviewedLabel,
    sourceUrls,
  });

  const parts = [withoutFaq.trim(), disclosure.trim()];
  if (faqBlock) parts.push(faqBlock);
  return parts.filter(Boolean).join("\n\n").trim();
}
