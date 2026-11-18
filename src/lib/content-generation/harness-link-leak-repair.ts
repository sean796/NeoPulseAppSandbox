import { expandOverviewScrollLinkPlaceholders } from "@/lib/prompt-builders/overview-link-rules";
import { normalizeMalformedHarnessLinkPlaceholders } from "@/lib/content-generation/internal-link-placeholders";

const SCROLL_PLACEHOLDER_RE = /\[\[SCROLL:#([^|\]]+)\|([^\]]+)\]\]/gi;
const INTERNAL_LINK_PLACEHOLDER_RE = /\[\[LINK:([^|\]]+)\|([^\]]+)\]\]/g;
const EXTERNAL_LINK_PLACEHOLDER_RE = /\[\[EXTERNAL:([^|\]]+)\|([^\]]+)\]\]/g;
const MARKDOWN_HASH_LINK_RE = /\[([^\]]*)\]\s*\((#[^)]+)\)/g;
const MARKDOWN_HTTP_LINK_RE = /\[([^\]]*)\]\s*\((https?:\/\/[^)]+)\)/g;
const BARE_HASH_PAREN_RE = /\(\s*(#[a-z0-9][a-z0-9-]*)\s*\)/gi;
const BARE_HTTP_PAREN_RE = /\(\s*(https?:\/\/[^)\s]+)\s*\)/gi;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hashIdKey(raw: string): string {
  return raw.trim().replace(/^#/, "").toLowerCase();
}

/** Readable anchor text from a slug id when no label map entry exists. */
export function labelFromHashId(rawId: string): string {
  const words = hashIdKey(rawId)
    .split("-")
    .filter(Boolean);
  if (words.length === 0) return "section";
  return words
    .map((word, index) => {
      if (index === 0) return word.charAt(0).toUpperCase() + word.slice(1);
      return word;
    })
    .join(" ");
}

function hashAnchorHtml(rawId: string, labelById?: ReadonlyMap<string, string>): string {
  const id = hashIdKey(rawId);
  const label = labelById?.get(id) ?? labelFromHashId(id);
  return `<a href="#${id}">${escapeHtml(label)}</a>`;
}

/** `(#section-id)` → `<a href="#section-id">label</a>` */
export function repairBareHashParenLeaks(
  html: string,
  labelById?: ReadonlyMap<string, string>,
): string {
  if (!html?.trim()) return html;
  return html.replace(BARE_HASH_PAREN_RE, (_match, rawId: string) =>
    hashAnchorHtml(rawId, labelById),
  );
}

/** Unresolved harness tokens → HTML anchors or visible anchor text (never raw syntax). */
export function repairHarnessPlaceholderLeaks(html: string): string {
  if (!html?.trim()) return html;
  let out = normalizeMalformedHarnessLinkPlaceholders(html);
  out = expandOverviewScrollLinkPlaceholders(out);
  out = out.replace(SCROLL_PLACEHOLDER_RE, (_match, rawId: string, rawText: string) => {
    const id = hashIdKey(rawId);
    const text = String(rawText).trim() || labelFromHashId(id);
    return `<a href="#${id}">${escapeHtml(text)}</a>`;
  });
  out = out.replace(INTERNAL_LINK_PLACEHOLDER_RE, (_match, _query: string, anchor: string) =>
    escapeHtml(anchor.trim()),
  );
  out = out.replace(EXTERNAL_LINK_PLACEHOLDER_RE, (_match, url: string, anchor: string) => {
    const href = url.trim();
    const text = anchor.trim() || href;
    return `<a href="${escapeHtml(href)}" target="_blank" rel="nofollow noopener noreferrer">${escapeHtml(text)}</a>`;
  });
  return out;
}

/** Markdown link syntax left in HTML after marked or model mix-ups. */
export function repairMarkdownLinkLeaksInHtml(html: string): string {
  if (!html?.trim()) return html;
  let out = html;
  out = out.replace(MARKDOWN_HASH_LINK_RE, (_match, rawText: string, rawId: string) => {
    const id = hashIdKey(rawId);
    const text = String(rawText).trim() || labelFromHashId(id);
    return `<a href="#${id}">${escapeHtml(text)}</a>`;
  });
  out = out.replace(MARKDOWN_HTTP_LINK_RE, (_match, rawText: string, rawUrl: string) => {
    const href = rawUrl.trim();
    const text = String(rawText).trim() || href;
    return `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`;
  });
  return out;
}

/** Bare `(https://...)` footnotes → proper anchor tags. */
export function repairBareHttpParenLeaks(html: string): string {
  if (!html?.trim()) return html;
  return html.replace(BARE_HTTP_PAREN_RE, (_match, rawUrl: string) => {
    const href = rawUrl.trim();
    return `<a href="${escapeHtml(href)}">${escapeHtml(href)}</a>`;
  });
}

export type RepairHarnessLinkLeaksOptions = {
  labelById?: ReadonlyMap<string, string>;
};

/** Final pass: no harness syntax or bare hash/http parens may ship in HTML. */
export function repairHarnessLinkLeaks(
  html: string,
  opts?: RepairHarnessLinkLeaksOptions,
): string {
  if (!html?.trim()) return html;
  let out = html;
  out = repairHarnessPlaceholderLeaks(out);
  out = repairMarkdownLinkLeaksInHtml(out);
  out = repairBareHashParenLeaks(out, opts?.labelById);
  out = repairBareHttpParenLeaks(out);
  return out;
}

export function labelMapFromAnchorTargets(
  targets: Array<{ id: string; label?: string }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const target of targets) {
    const id = hashIdKey(target.id);
    const label = target.label?.trim();
    if (id && label) map.set(id, label);
  }
  return map;
}
