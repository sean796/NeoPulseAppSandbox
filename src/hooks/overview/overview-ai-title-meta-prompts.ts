import type { Dispatch, SetStateAction } from "react";
import { enforceExactFocusKeyword } from "@/lib/overview/enforce-exact-focus-keyword";
import { META_DESCRIPTION_ANTI_CLICKBAIT_RULE, TITLE_ANTI_CLICKBAIT_RULE, TITLE_KEYWORD_WEAVING_RULE, TITLE_CASE_RULE, TITLE_WELL_KNOWN_ACRONYMS_RULE } from "@/lib/prompt-builders/title-rules";

export type OverviewAiRunCompletion = (
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
  maxTokensOverride?: number,
) => Promise<string>;

export type OverviewTitleMetaDeps = {
  runCompletion: OverviewAiRunCompletion;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
};

export function createOverviewTitleOptimizer(deps: OverviewTitleMetaDeps) {
  const { runCompletion, setLoading, setError } = deps;
  return async (
      url: string,
      existingTitle: string,
      focusKeyword?: string,
      faq?: string,
      sentimentSource?: string,
      seoResearchBrief?: string,
      options?: { skipLoadingState?: boolean; titleMode?: "default" | "sap"; signal?: AbortSignal },
    ): Promise<string | null> => {
      const skipLoadingState = options?.skipLoadingState === true;
      const titleMode = options?.titleMode === "sap" ? "sap" : "default";
      if (!skipLoadingState) {
        setLoading(true);
        setError(null);
      }
      try {
        const briefTrimmed =
          typeof seoResearchBrief === "string" ? seoResearchBrief.trim() : "";
        const hasBrief = briefTrimmed.length > 0;
        const sapTitleRules = `SAP / near-me landing page title rules (mandatory)
- These are local "near me" service-area pages, NOT blog posts.
- Write one natural commercial headline: product/service offer + place, using "Near" (preferred) or "in" / "for".
- Good examples: "Best Hunter Douglas Blinds Near Edmonton City Centre", "Hunter Douglas Blinds Near Commerce Place Edmonton".
- Do NOT paste the focus keyword as the title and bolt on filler (Forbidden suffixes: Selection, Guide, Options, Types, Solutions, Collection, Dealer).
- Do NOT force the full focus keyword string as a contiguous block if it reads like a stuffed label. Rewrite into a readable near-me headline that still covers the same product + place intent.
- Include the place from the keyword/URL (neighbourhood, landmark, mall, bridge, district). Prefer "Near [Place]" over stacking City + Province as a bare keyword dump.
- 50-60 characters. ${TITLE_CASE_RULE}
- ${TITLE_ANTI_CLICKBAIT_RULE}
- NO COLONS. No pipe / brand prefix.
- ${TITLE_WELL_KNOWN_ACRONYMS_RULE}`;

        const defaultTitleRules = `Rules
- 50-60 characters
- ${TITLE_CASE_RULE}
- **Grammar first**: write one readable English headline. Never paste a raw focus keyword, URL slug, or keyword+business mash as the subject of the title.
- ${TITLE_KEYWORD_WEAVING_RULE}
- ${TITLE_ANTI_CLICKBAIT_RULE}
- **NO COLONS** in this title. Never use a topic-then-subtitle structure. Write one flowing headline joined with natural connecting words ("and", "for", "vs", "without", "how", "what", "why", "when"), or end with "?".
- Do NOT prepend business name, site name, company name, or distributor name. Output ONLY the page topic title - no "Brand | Topic" pattern.
- If focus keyword is empty or looks like a slug/query dump, infer the reader decision from the URL and page content, then write a clean headline about that decision. Never paste slug words in order.
- NO brand or site name jammed into the middle of the topic phrase.
- ${TITLE_WELL_KNOWN_ACRONYMS_RULE}`;

        const prompt = `Create a neutral, specific, grammatically correct SEO title.

${titleMode === "sap" ? sapTitleRules : defaultTitleRules}
${
  hasBrief
    ? `- A cached **JSON SEO content brief** is below (SERP highlights, PAA, GSC queries). Parse it for intent and angles. Do NOT paste JSON into the title; write a short, specific title that reflects that intent.
`
    : ""
}
Focus keyword (topic signal only - weave into a grammatical Title Case headline; never paste as an unbroken slug or business-name mash)
${focusKeyword?.trim() || "(none)"}

FAQ content (use as context only – do NOT simply echo questions)
${faq || "(none)"}

Page content for sentiment (use ONLY to understand whether the page is positive, neutral, or addressing a problem; do NOT copy phrases directly)
${sentimentSource || "(none)"}

${
  hasBrief
    ? `JSON SEO content brief (primary intent - do not copy into output)
${briefTrimmed.slice(0, 24000)}

`
    : ""
}URL
${url}

Existing title (replace completely - do NOT return this exact title; author a fresh, distinct SEO title)
${existingTitle}

Return only the new title text with no quotes. Every word must be Title Case. The title must read as natural English.`;

        const systemPrompt = hasBrief
          ? `You are a senior SEO content title specialist. Write a brand-new, grammatically correct, neutral Title Case headline that a human editor would publish. Never paste a raw keyword or URL slug as the title spine. A structured JSON SEO content brief is provided - use it for intent while following all title rules. ${TITLE_CASE_RULE}`
          : `You are a senior SEO content title specialist. Write a brand-new, grammatically correct, neutral Title Case headline that a human editor would publish. Never paste a raw keyword or URL slug as the title spine. ${TITLE_CASE_RULE}`;
        const raw = await runCompletion(systemPrompt, prompt, options?.signal);
        return raw || null;
      } catch (err) {
        if (!skipLoadingState) {
          setError(err instanceof Error ? err.message : "AI title optimization failed.");
        }
        return null;
      } finally {
        if (!skipLoadingState) {
          setLoading(false);
        }
      }
    }
}

export function createOverviewMetaOptimizer(deps: OverviewTitleMetaDeps) {
  const { runCompletion, setLoading, setError } = deps;
  return async (
      url: string,
      existingMeta: string,
      focusKeyword?: string,
      faq?: string,
      sentimentSource?: string,
      gscQuickWinsContext?: string,
      seoResearchBrief?: string,
      options?: { skipLoadingState?: boolean; signal?: AbortSignal },
    ): Promise<string | null> => {
      const skipLoadingState = options?.skipLoadingState === true;
      if (!skipLoadingState) {
        setLoading(true);
        setError(null);
      }
      try {
        const briefTrimmed =
          typeof seoResearchBrief === "string" ? seoResearchBrief.trim() : "";
        const hasBrief = briefTrimmed.length > 0;
        const hasGsc =
          !hasBrief &&
          typeof gscQuickWinsContext === "string" &&
          gscQuickWinsContext.trim().length > 0;

        const prompt = `Write a brand-new, grammatically natural SEO meta description from scratch.

Rules
- 130-155 characters
- ${META_DESCRIPTION_ANTI_CLICKBAIT_RULE}
- **Grammar and natural flow come first (NON-NEGOTIABLE)**: Write one or two complete, fluent English sentences in standard sentence case (capitalize the first word of the sentence and proper nouns/trademarks only; never start a sentence with a lowercase letter, and never Title Case generic keyword words mid-sentence).
- **Never shove or prefix the raw keyword**: NEVER dump the focus keyword at the start of the meta description followed by a colon, dash, comma, or pipe (e.g. FORBIDDEN: "energy efficient windows science: How Low-E coatings..." or "Blinds Bushnell FL: Window treatment options...").
- **Flexible, grammatical keyword weaving**: Treat the focus keyword as the topic signal, not a rigid contiguous string. If the focus keyword is phrased like a raw search query or slug (e.g. "energy efficient windows science", "blinds bushnell fl", "roman shades cost edmonton"), reorder the words and add natural prepositions, articles, or hyphens so the sentence reads effortlessly to a human (e.g. "Explore the science behind energy-efficient windows, including how Low-E coatings, argon gas fills, and insulated frames reduce heat transfer.").
- Do not add brand names or site name.
${
  hasBrief
    ? `- A cached **JSON SEO content brief** is below (DataForSEO SERP highlights + GSC queries). Parse it mentally for intent, questions, and angles. Do NOT paste JSON into the meta; write fresh, natural sentences that reflect that intent.
`
    : ""
}${
  hasGsc
    ? `- Real Google search queries for this page are provided below as JSON. Use them actively as inspiration: infer intent, pain points, and how people phrase searches; reflect that in your benefit and angle while keeping natural sentence flow. Do NOT paste or list queries, do NOT keyword-stuff, and do NOT copy wording verbatim.
`
    : ""
}
Focus keyword (topic signal - weave its words naturally with proper grammar and sentence case; never paste as a raw prefix or ungrammatical block)
${focusKeyword?.trim() || "(none)"}

FAQ content (use as context only – summarize the value, do NOT list questions verbatim)
${faq || "(none)"}

Page content for sentiment (use ONLY to understand whether the page is positive, neutral, or addressing a problem; do NOT copy phrases directly)
${sentimentSource || "(none)"}

${
  hasBrief
    ? `JSON SEO content brief (primary intent - organics, PAA, related searches, GSC queries; do not copy into output)
${briefTrimmed.slice(0, 24000)}

`
    : ""
}Real Google search queries for this URL (JSON: gsc_keywords_for_url + rows; last calendar month, up to 50 by impressions - use for inspiration as described above; if this is "(none)" or empty, skip)
${hasBrief ? "(none - use JSON SEO content brief above)" : gscQuickWinsContext || "(none)"}

URL
${url}

Existing meta description (replace completely - do NOT return or lightly tweak this existing text; author a fresh meta description from scratch)
${existingMeta}

Return only the newly authored meta description with no quotes.`;

        const systemPrompt = hasBrief
          ? "You are a senior SEO content specialist who authors brand-new, grammatically fluent, neutral meta descriptions in natural sentence case. Never front-load a raw keyword with a colon or force an ungrammatical keyword string into a sentence; weave the topic words naturally with connecting prepositions and articles. Use the structured JSON SEO content brief as the main signal for intent and specifics."
          : hasGsc
            ? "You are a senior SEO content specialist who authors brand-new, grammatically fluent, neutral meta descriptions in natural sentence case. Never front-load a raw keyword with a colon or force an ungrammatical keyword string into a sentence; weave the topic words naturally with connecting prepositions and articles. Treat Search Console query data as inspiration for searcher intent."
            : "You are a senior SEO content specialist who authors brand-new, grammatically fluent, neutral meta descriptions in natural sentence case. Never front-load a raw keyword with a colon or force an ungrammatical keyword string into a sentence; weave the topic words naturally with connecting prepositions and articles.";
        const raw = await runCompletion(systemPrompt, prompt, options?.signal);
        const text = raw ? enforceExactFocusKeyword(raw, focusKeyword) : null;
        return text || null;
      } catch (err) {
        if (!skipLoadingState) {
          setError(err instanceof Error ? err.message : "AI meta optimization failed.");
        }
        return null;
      } finally {
        if (!skipLoadingState) {
          setLoading(false);
        }
      }
    }
}
