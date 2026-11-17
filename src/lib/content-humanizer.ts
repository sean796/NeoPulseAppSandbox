/**
 * Mandatory Humanizer writing contract for client-facing blog and optimizer output.
 * Source patterns: blader/humanizer v4.0.0 (MIT) — https://agenticskills.io/skills/humanizer
 *
 * Enforce via prompt injection only (same path as the word blacklist). Do not reject or
 * discard finished sections because prose still sounds AI-like.
 */

export const HUMANIZER_MANDATORY_TAG = "[HUMANIZER - MANDATORY GLOBAL]";

export const HUMANIZER_MARKER = "HUMANIZER (mandatory";

/** Compact enforceable contract (all 26 patterns). Details download = this exact string. */
export const GLOBAL_HUMANIZER_PROMPT_BLOCK = `HUMANIZER (mandatory; all clients, all sitemap/content output):
Remove AI writing tells while writing. Keep every supported claim. Do not invent facts, names, numbers, dates, quotes, or citations. Master instructions are the voice sample when present.
Embedded mode: return ONLY the HTML, Markdown, or JSON this task already requires. Never return a tell list, draft notes, or a before/after report.
Required task formatting wins: Answer and Overview structure, Overview bold labels, FAQ fields, link markers ([[LINK:...]], scroll anchors), trademarks, and schema shapes stay intact.
§1–§5 (act on one sighting):
1. Not X but Y: avoid "not X but Y", "not just/only/merely X but Y", "it's not X, it's Y", clipped tails like ", no guessing". State the point directly unless both halves carry real information.
2. One-line closers: cut restating closers ("That is the real win", "Let that sink in", "This shows the importance of…") and fragment rows. Keep a short line only when it adds a new fact.
3. Deep sayings: replace "the real question is", "at its core", "what really matters", "fundamentally", "X is the Y of Z", "language/currency/architecture of" with the specific claim.
4. Staged run-up: remove "Let's dive in/explore/break this down", "here's what you need to know", "Honestly?", "Here's the thing", "Real talk" openers. Start with the point.
5. Arguing with no one: remove "I'm not saying", "To be clear", "Don't get me wrong", "You might think… but", "A tempting approach would be" when no real objection is in play.
§6–§11 (rhythm):
6. Forced triads: do not pad ideas into threes for cadence. Keep three items only when meaning needs three.
7. Repeated openings: vary or merge sentences that start with the same subject in a row.
8. Dashes: never use em dash or en dash (or spaced -- as a dash). Use period, comma, colon, or parentheses. Leave hyphens in compounds, URLs, and code alone.
9. Stacked qualifiers (weak alone): avoid "could potentially", "might arguably", "in some cases it may" stacks. Keep real scope and legal hedges.
10. Hyphenated pairs (weak alone): keep hyphens before nouns ("a high-quality report"); drop after nouns ("the report is high quality"). Dictionary compounds (third-party) keep hyphens.
11. Passive voice (weak alone): use active voice when the actor and action are clearer.
§12–§18 (inflation):
12. Overused AI words (avoid wherever they appear): actually, additionally, align with, bolstered, crucial, deep dive, delve, enduring, enhance, garner, figurative gate/gated/gating, highlight (verb), interplay, intricate/intricacies, key (adjective), landscape (abstract), meticulous/meticulously, pivotal, quietly, robust (figurative), showcase, tapestry (abstract), testament, underscore (verb), valuable, vibrant.
13. Inflated significance: cut "stands as a testament", "pivotal/crucial moment", "plays a key role", "evolving landscape", "despite these challenges… continues to thrive", "the future looks bright". Keep the fact; end on the last concrete fact.
14. Vague association: replace "associated with / linked to / tied to" with the real relationship when known; do not invent a role.
15. Shallow -ing riders: cut bolted-on "highlighting, underscoring, emphasizing, ensuring, reflecting, symbolizing, fostering, showcasing" unless the source supports the claim.
16. Sales language: avoid nestled, breathtaking, stunning, must-visit, rich heritage, diverse array, groundbreaking (figurative), renowned. State what the thing is.
17. Borrowed authority: cut unnamed "experts argue / industry reports / some critics" and prestige outlet lists without a real citation. Keep named sourced claims.
18. Prefer is/are/has over "serves as, stands as, functions as, boasts, features, offers, maintains [a]".
§19–§21 (formatting):
19. Bold as decoration: do not bold random words. Overview key-point bold labels required by the task stay. Decorative bold-label lists that add no information become prose.
20. Decorative headings: sentence case; no emoji or arrow decoration; no horizontal rules between every section; do not restyle required H2 titles (Overview, Scenario:…). Do not add or keep a heading whose text is Answer.
21. Straight quotes only (weak alone): use "..." not curly quotes.
§22–§25 (leftovers):
22. Chatbot residue: never write "I hope this helps", "Great question!", "Of course!", "Certainly!", "Would you like…", "let me know".
23. Knowledge-limit disclaimers and guesses: never write "as of my last training update", "while specific details are limited", "not publicly available… she likely…". State missing source facts or omit.
24. Heading echoed in first sentence: after an H2/H3, do not open with a one-liner that only restates the heading.
25. Writing about the document: do not narrate how the text was assembled ("generated from", "this section is organized by…") unless the task is a changelog.
26. Wrong reader: for reply-shaped text, lead with the decision; do not rebuild context the reader already has.
When not to act: leave watched phrases inside quotations, titles, proper names, or passages that discuss the phrase. Keep specific voice details from master instructions.`.trim();

export const HUMANIZER_USER_PROMPT_REMINDER = `[HUMANIZER - NON-NEGOTIABLE]: Obey the full HUMANIZER block in the system prompt and user RAG. Write like a person: no AI staging, closers, forced triads, dash stacks, inflated claims, sales filler, or chatbot wrappers. Keep every fact. Return only the required output format.`;

const HUMANIZER_RAG_OPEN = "=== HUMANIZER (READ ONLY: master rule; read fully before any output) ===";
const HUMANIZER_RAG_CLOSE = "=== END HUMANIZER ===";

const SYSTEM_PROMPT_HUMANIZER_PREFIX = `${HUMANIZER_MANDATORY_TAG}\n${GLOBAL_HUMANIZER_PROMPT_BLOCK}\n\n`;

const SYSTEM_OBEY_USER_HUMANIZER_LINE =
  "Obey the HUMANIZER block in the user message before any output. No AI tells in titles, headings, body, meta, FAQ, or link text. Keep required task structure.";

/** Full policy text for Details drawer downloads (exact prompt contract). */
export function buildHumanizerDownloadText(): string {
  return `${HUMANIZER_MANDATORY_TAG}\n${GLOBAL_HUMANIZER_PROMPT_BLOCK}`;
}

/** Read-only RAG doc prepended beside the word blacklist on content harness user prompts. */
export function buildHumanizerRagBlock(): string {
  return `${HUMANIZER_RAG_OPEN}
${GLOBAL_HUMANIZER_PROMPT_BLOCK}
${HUMANIZER_RAG_CLOSE}

You MUST read and obey the HUMANIZER rules above before writing anything. Zero tolerance for AI writing tells.`;
}

/** System-prompt Humanizer prefix (idempotent when composed with blacklist). */
export function buildHumanizerSystemPrefix(): string {
  return `${SYSTEM_PROMPT_HUMANIZER_PREFIX}${SYSTEM_OBEY_USER_HUMANIZER_LINE}\n\n`;
}

export function systemPromptHasHumanizer(systemPrompt: string): boolean {
  return systemPrompt.includes(HUMANIZER_MARKER) || systemPrompt.includes(HUMANIZER_MANDATORY_TAG);
}

export function userPromptHasHumanizerRag(userPrompt: string): boolean {
  return userPrompt.includes(HUMANIZER_RAG_OPEN);
}

/**
 * Idempotent: ensure Humanizer is present once.
 * When the word blacklist already leads the prompt, insert Humanizer immediately after it.
 * Otherwise prepend Humanizer.
 */
export function ensureHumanizerOnSystemPrompt(systemPrompt: string): string {
  if (systemPromptHasHumanizer(systemPrompt)) {
    if (!systemPrompt.includes(SYSTEM_OBEY_USER_HUMANIZER_LINE)) {
      return `${SYSTEM_OBEY_USER_HUMANIZER_LINE}\n\n${systemPrompt}`;
    }
    return systemPrompt;
  }
  const humanizerBlock = buildHumanizerSystemPrefix();
  const blacklistObeyNeedle =
    "Obey the WORD BLACKLIST block in the user message before any output. Zero banned words in titles, headings, body, meta, FAQ, and link text.";
  if (systemPrompt.includes(blacklistObeyNeedle)) {
    return systemPrompt.replace(
      blacklistObeyNeedle,
      `${blacklistObeyNeedle}\n\n${humanizerBlock.trimEnd()}`,
    );
  }
  if (systemPrompt.includes("WORD BLACKLIST (mandatory")) {
    const tag = "[FORBIDDEN_WORDS - MANDATORY GLOBAL]";
    const tagIdx = systemPrompt.indexOf(tag);
    if (tagIdx === 0 || (tagIdx > 0 && systemPrompt.slice(0, tagIdx).trim() === "")) {
      // Blacklist leads without obey line: append Humanizer after the blacklist paragraph break.
      const doubleNl = systemPrompt.indexOf("\n\n");
      if (doubleNl !== -1) {
        return `${systemPrompt.slice(0, doubleNl + 2)}${humanizerBlock}${systemPrompt.slice(doubleNl + 2)}`;
      }
    }
  }
  return `${humanizerBlock}${systemPrompt}`;
}

/** Idempotent: prepend Humanizer RAG once (caller places relative to blacklist). */
export function prependHumanizerRagToUserPrompt(userPrompt: string): string {
  if (userPromptHasHumanizerRag(userPrompt)) {
    return userPrompt;
  }
  return `${buildHumanizerRagBlock()}\n\n${userPrompt}`;
}
