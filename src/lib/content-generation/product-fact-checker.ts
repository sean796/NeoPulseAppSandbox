import { z } from "zod";
import type { WordPressSite } from "@/components/integrations/types";
import { parseModelJson } from "@/lib/model-json";
import { postOpenRouterAppChat } from "@/lib/openrouter-app-api";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import { resolvePageLocalContext } from "@/lib/content-optimization/page-local-context";
import { buildProductFactCheckerSystemPrompt } from "@/lib/content-generation/load-fact-checker-skill-prompt";

export const FACT_CHECKER_STEP_LABEL = "Fact checker";
/** Rewrites rejected quotes until apply succeeds. After retries, soft-finish omits invalid claims so the post still finishes. */
export const FACT_CHECK_REWRITE_ATTEMPTS = 4;
/** GPT-6 Sol :online — same or lower token cost than gpt-4o:online, with web search. */
export const PRODUCT_FACT_CHECKER_MODEL = "openai/gpt-6-sol:online";
export const FACT_SOURCE_ATTR = "data-fact-source";

/** Aligns with skills/fact-checker rules; omit = delete when no competitive-neutral source. */
const VERDICTS = [
  "supported",
  "partially_supported",
  "contradicted",
  "omit",
] as const;

const ProductFactEditSchema = z.object({
  quote: z.string(),
  verdict: z.enum(VERDICTS),
  replacement: z.string(),
  anchor: z.string(),
  sourceUrl: z.string(),
  sourceTitle: z.string(),
  qualification: z.string(),
});

const ProductFactCheckerModelSchema = z.object({
  edits: z.array(ProductFactEditSchema),
  unhandledQuotes: z.array(z.string()),
});

export type ProductFactEdit = z.infer<typeof ProductFactEditSchema>;
export type ProductFactCheckerModel = z.infer<typeof ProductFactCheckerModelSchema>;

const PRODUCT_FACT_CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["edits", "unhandledQuotes"],
  properties: {
    edits: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "quote",
          "verdict",
          "replacement",
          "anchor",
          "sourceUrl",
          "sourceTitle",
          "qualification",
        ],
        properties: {
          quote: { type: "string" },
          verdict: { type: "string", enum: [...VERDICTS] },
          replacement: { type: "string" },
          anchor: { type: "string" },
          sourceUrl: { type: "string" },
          sourceTitle: { type: "string" },
          qualification: { type: "string" },
        },
      },
    },
    unhandledQuotes: { type: "array", items: { type: "string" } },
  },
} as const;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function hostnameFromUrl(url: string): string {
  try {
    return new URL(url.trim().replace(/&amp;/gi, "&")).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

export function connectedSiteHost(siteUrl: string | undefined | null): string {
  if (!siteUrl?.trim()) return "";
  try {
    const base = siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
    return new URL(base).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

export function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url.trim().replace(/&amp;/gi, "&"));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function stripHtmlToPlain(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function buildMacroLocationFromSite(site?: WordPressSite | null): {
  name: string;
  siteUrl: string;
  city: string;
  state: string;
  country: string;
} {
  const locs = [...(site?.locations ?? []), ...(site?.napInfo?.locations ?? [])];
  const def = locs.find((l) => l.isDefault) ?? locs[0];
  const local = resolvePageLocalContext({
    keyword: "",
    site,
  });
  const city = (def?.city ?? local.primaryCity.split(",")[0] ?? "").trim();
  const state = (def?.state ?? "").trim();
  const country = (def?.country ?? "").trim();
  return {
    name: (site?.name ?? site?.napInfo?.name ?? "").trim(),
    siteUrl: (site?.siteUrl ?? "").trim(),
    city,
    state,
    country,
  };
}

export function evidenceLinkHtml(args: {
  href: string;
  anchor: string;
}): string {
  const href = args.href.trim().replace(/"/g, "&quot;").replace(/&/g, "&amp;");
  return `<a href="${href}" ${FACT_SOURCE_ATTR}="1" target="_blank" rel="nofollow noopener noreferrer">${escapeHtml(args.anchor)}</a>`;
}

/** Wrap the first occurrence of anchor inside replacement with an evidence link. */
export function wrapAnchorInReplacement(
  replacement: string,
  anchor: string,
  sourceUrl: string,
): string {
  const idx = replacement.indexOf(anchor);
  if (idx < 0) {
    throw new Error(
      `Fact checker failed: anchor "${anchor}" does not appear in replacement.`,
    );
  }
  const before = escapeHtml(replacement.slice(0, idx));
  const after = escapeHtml(replacement.slice(idx + anchor.length));
  return `${before}${evidenceLinkHtml({ href: sourceUrl, anchor })}${after}`;
}

export function validateProductFactEdit(
  edit: ProductFactEdit,
  clientHost: string,
): ProductFactEdit {
  const quote = edit.quote.trim();
  if (!quote) {
    throw new Error("Fact checker failed: edit quote is empty.");
  }
  const replacement = edit.replacement.trim();
  const sourceUrl = edit.sourceUrl.trim();
  const anchor = edit.anchor.trim();
  const qualification = edit.qualification.trim();

  if (!replacement || edit.verdict === "omit") {
    if (replacement && edit.verdict === "omit") {
      throw new Error(
        `Fact checker failed: omit verdict must use empty replacement (quote: ${quote.slice(0, 80)}).`,
      );
    }
    if (sourceUrl || anchor) {
      throw new Error(
        `Fact checker failed: deleted claim must have empty sourceUrl and anchor (quote: ${quote.slice(0, 80)}).`,
      );
    }
    return {
      ...edit,
      quote,
      verdict: "omit",
      replacement: "",
      sourceUrl: "",
      anchor: "",
      qualification,
      sourceTitle: edit.sourceTitle.trim(),
    };
  }

  if (!isHttpUrl(sourceUrl)) {
    throw new Error(
      `Fact checker failed: kept claim requires an http(s) sourceUrl (quote: ${quote.slice(0, 80)}).`,
    );
  }
  const sourceHost = hostnameFromUrl(sourceUrl);
  if (!sourceHost) {
    throw new Error(
      `Fact checker failed: sourceUrl host is invalid (quote: ${quote.slice(0, 80)}).`,
    );
  }
  if (clientHost && sourceHost === clientHost) {
    throw new Error(
      `Fact checker failed: sourceUrl must not be the client site (quote: ${quote.slice(0, 80)}).`,
    );
  }
  if (!anchor) {
    throw new Error(
      `Fact checker failed: kept claim requires a non-empty anchor (quote: ${quote.slice(0, 80)}).`,
    );
  }
  if (!replacement.includes(anchor)) {
    throw new Error(
      `Fact checker failed: anchor must appear in replacement (quote: ${quote.slice(0, 80)}).`,
    );
  }
  if (edit.verdict === "partially_supported" && !qualification) {
    throw new Error(
      `Fact checker failed: partially_supported requires qualification (quote: ${quote.slice(0, 80)}).`,
    );
  }
  if (edit.verdict === "partially_supported" && !replacement.includes(qualification)) {
    throw new Error(
      `Fact checker failed: qualification must appear in replacement (quote: ${quote.slice(0, 80)}).`,
    );
  }

  return {
    ...edit,
    quote,
    replacement,
    sourceUrl,
    anchor,
    qualification,
    sourceTitle: edit.sourceTitle.trim(),
  };
}

/**
 * Apply validated edits to HTML. A quote must occur once unless replaceRepeatedQuotes
 * is set, in which case every identical copy receives the same replacement.
 * Empty replacement deletes the quote. Non-empty replacement inserts linked HTML.
 */
export function applyProductFactCheckEdits(
  html: string,
  edits: ProductFactEdit[],
  opts?: { clientHost?: string; replaceRepeatedQuotes?: boolean },
): string {
  const clientHost = opts?.clientHost ?? "";
  let out = html;
  for (const raw of edits) {
    const edit = validateProductFactEdit(raw, clientHost);
    const occurrences = out.split(edit.quote).length - 1;
    if (occurrences < 1) {
      throw new Error(
        `Fact checker failed: quote not found in article: ${edit.quote.slice(0, 120)}`,
      );
    }
    if (occurrences > 1 && !opts?.replaceRepeatedQuotes) {
      throw new Error(
        `Fact checker failed: quote appears more than once: ${edit.quote.slice(0, 120)}`,
      );
    }
    const next = edit.replacement
      ? wrapAnchorInReplacement(edit.replacement, edit.anchor, edit.sourceUrl)
      : "";
    out = out.split(edit.quote).join(next);
  }
  return out.replace(/[ \t]{2,}/g, " ");
}

/** Coerce an invalid edit to omit so the claim leaves and the post can finish. */
export function omitFactEdit(edit: ProductFactEdit): ProductFactEdit {
  return {
    ...edit,
    quote: String(edit.quote ?? "").trim(),
    verdict: "omit",
    replacement: "",
    sourceUrl: "",
    anchor: "",
    qualification: "",
    sourceTitle: String(edit.sourceTitle ?? "").trim(),
  };
}

/**
 * Soft-finish: apply valid edits; coerce invalid ones to omit (delete that quote).
 * Skips quotes missing from HTML. Repeated quotes get the same replacement.
 * Never throws for rewriteable claim shape errors.
 */
export function softFinishProductFactCheckEdits(
  html: string,
  edits: ProductFactEdit[],
  clientHost = "",
): string {
  const safe: ProductFactEdit[] = [];
  for (const raw of edits) {
    const quote = String(raw.quote ?? "").trim();
    if (!quote) continue;
    try {
      safe.push(validateProductFactEdit(raw, clientHost));
    } catch {
      safe.push(omitFactEdit({ ...raw, quote }));
    }
  }
  if (safe.length === 0) return html;

  let out = html;
  for (const edit of safe) {
    const occurrences = out.split(edit.quote).length - 1;
    if (occurrences < 1) continue;
    try {
      const next = edit.replacement
        ? wrapAnchorInReplacement(edit.replacement, edit.anchor, edit.sourceUrl)
        : "";
      out = out.split(edit.quote).join(next);
    } catch {
      out = out.split(edit.quote).join("");
    }
  }
  return out.replace(/[ \t]{2,}/g, " ");
}

function factCheckErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isRewriteableFactCheckError(err: unknown): boolean {
  if (err instanceof Error && err.name === "AbortError") return false;
  const msg = factCheckErrorMessage(err);
  if (msg.includes("API key is not configured")) return false;
  if (msg.includes("SKILL.md") || msg.includes("fact-check-rules.md")) return false;
  return (
    msg.startsWith("Fact checker failed:") ||
    msg.startsWith("Invalid product fact checker JSON:")
  );
}

function buildFactCheckUser(args: {
  plain: string;
  macro: ReturnType<typeof buildMacroLocationFromSite>;
  keyword?: string;
  title?: string;
  rejection: string;
}): string {
  const lines = [
    "Follow the Fact Checker skill and fact-check-rules in the system prompt.",
    "Ground every material claim with web search. Competitive-neutral sources only.",
    "End every web search query with LATEST_YEAR from the system prompt.",
    "Every material claim must be in edits. unhandledQuotes must be [].",
    "Each quote must occur exactly once. If a sentence is repeated, extend it with unique neighboring words and return one edit per copy.",
    "",
    `MACRO_LOCATION JSON:\n${JSON.stringify(args.macro)}`,
    `Keyword: ${(args.keyword ?? "").trim() || "(none)"}`,
    `Title: ${(args.title ?? "").trim() || "(none)"}`,
    "",
    "ARTICLE PLAIN TEXT:",
    args.plain.slice(0, 48000),
  ];
  if (args.rejection) {
    lines.push(
      "",
      "PREVIOUS ATTEMPT REJECTED. Rewrite the edits. Do not repeat a rejected quote unchanged.",
      args.rejection,
      "Each quote must be an exact substring that occurs exactly once. If a sentence is repeated, include the nearest unique neighboring words so each quote matches one place only. One edit per copy. unhandledQuotes must be [].",
      "For partially_supported, put the full qualification string verbatim inside replacement. If you cannot, use omit with empty replacement, sourceUrl, and anchor.",
      "Never fail the post: rewrite the rejected edit or omit that claim.",
    );
  }
  return lines.join("\n");
}

export async function runProductFactChecker(input: {
  html: string;
  site?: WordPressSite | null;
  keyword?: string;
  title?: string;
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const html = input.html?.trim() ? input.html : "";
  if (!html) return html;

  const plain = stripHtmlToPlain(html);
  if (!plain) return html;

  const macro = buildMacroLocationFromSite(input.site);
  const clientHost = connectedSiteHost(macro.siteUrl || input.site?.siteUrl);
  const apiKey = await resolveOpenRouterApiKeyForHarness();
  if (!apiKey?.trim()) {
    throw new Error("Fact checker failed: OpenRouter API key is not configured.");
  }

  const system = buildProductFactCheckerSystemPrompt();
  let rejection = "";
  let lastEdits: ProductFactEdit[] | null = null;

  for (let attempt = 1; attempt <= FACT_CHECK_REWRITE_ATTEMPTS; attempt++) {
    input.onProgress?.(
      attempt === 1 ? FACT_CHECKER_STEP_LABEL : `${FACT_CHECKER_STEP_LABEL}: rewriting quotes`,
    );
    try {
      // gpt-6-sol does not accept temperature; omit it. Keep reasoning low for cost.
      const { content } = await postOpenRouterAppChat({
        apiKey,
        model: PRODUCT_FACT_CHECKER_MODEL,
        system,
        user: buildFactCheckUser({
          plain,
          macro,
          keyword: input.keyword,
          title: input.title,
          rejection,
        }),
        maxTokens: 16000,
        signal: input.signal,
        reasoning: { effort: "low" },
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "product_fact_checker",
            strict: false,
            schema: PRODUCT_FACT_CHECK_SCHEMA,
          },
        },
      });
      const parsed = parseModelJson(content, ProductFactCheckerModelSchema, "product fact checker");
      const edits = assertProductFactCheckerModel(parsed);
      lastEdits = edits;
      if (edits.length === 0) return html;
      return applyProductFactCheckEdits(html, edits, { clientHost });
    } catch (err) {
      if (!isRewriteableFactCheckError(err)) throw err;
      const repeated = factCheckErrorMessage(err).includes("quote appears more than once");
      if (attempt === FACT_CHECK_REWRITE_ATTEMPTS && repeated && lastEdits) {
        return applyProductFactCheckEdits(html, lastEdits, {
          clientHost,
          replaceRepeatedQuotes: true,
        });
      }
      rejection = factCheckErrorMessage(err);
    }
  }

  // Never gate the blog: omit unverified / invalid claims and finish the post.
  input.onProgress?.(`${FACT_CHECKER_STEP_LABEL}: omitting unverified claims`);
  if (!lastEdits || lastEdits.length === 0) return html;
  return softFinishProductFactCheckEdits(html, lastEdits, clientHost);
}

/** Reject non-empty unhandledQuotes; return edits for apply. */
export function assertProductFactCheckerModel(
  parsed: ProductFactCheckerModel,
): ProductFactEdit[] {
  const unhandled = (parsed.unhandledQuotes ?? [])
    .map((q) => String(q ?? "").trim())
    .filter(Boolean);
  if (unhandled.length > 0) {
    throw new Error(
      `Fact checker failed: ${unhandled.length} material claim(s) were left unhandled.`,
    );
  }
  return parsed.edits ?? [];
}
