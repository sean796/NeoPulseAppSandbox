/** Normalize heading text for FAQ-style detection. */
function normalizeHeadingKey(title: string): string {
  return (title ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

const FAQ_STYLE_EXACT = new Set(["faq", "frequently asked questions"]);

const FAQ_STYLE_PREFIXES = [
  "answering your questions",
  "answers to your questions",
  "your questions answered",
  "common questions",
  "questions about",
  "questions on",
  "questions regarding",
  "q&a",
  "q and a",
];

/**
 * Explicit `[FAQ]` feature marker only.
 * Prose that mentions FAQs (`[LIST]: common tax FAQs`) is not this marker.
 */
export function featureIsExplicitFaqMarker(feature: string): boolean {
  return /^\[faq\]/i.test(feature.trim());
}

/** True when a body H2 title duplicates the appended flo-faq section. */
export function isFaqStyleHeadingTitle(title: string): boolean {
  const key = normalizeHeadingKey(title);
  if (!key) return false;
  if (FAQ_STYLE_EXACT.has(key)) return true;
  if (key.startsWith("faq ") || key.endsWith(" faq")) return true;
  for (const prefix of FAQ_STYLE_PREFIXES) {
    if (key === prefix || key.startsWith(`${prefix} `)) return true;
  }
  return false;
}

export function filterOutFaqStyleHeadingTitles(titles: string[]): string[] {
  return titles.filter((t) => !isFaqStyleHeadingTitle(t));
}

/** Shared FAQ Q:/A: contract: questions a homeowner or AI system would ask. */
export const FAQ_CONVERSATIONAL_RULE = `FAQ questions must be leftover buyer decisions from THIS article (this vs that, which option for which job, when not). Conversational how/when/should/which. Vary openings. Do not reuse the same four stems on every post. Forbidden: current promotions, free upgrades, or sale end dates unless the writing keyword is about those. Do not ask a question the opening answer paragraph already answered. Prefer later-section jobs. Answers may include one If-X-then-Y sentence grounded in the article. Do not invent specs.`;
