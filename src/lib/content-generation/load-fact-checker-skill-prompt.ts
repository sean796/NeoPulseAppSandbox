import skillMdRaw from "../../../skills/fact-checker/SKILL.md?raw";
import factCheckRulesRaw from "../../../skills/fact-checker/references/fact-check-rules.md?raw";

/** Calendar year appended to every fact-checker web search query. */
export function getFactCheckerLatestYear(now: Date = new Date()): number {
  return now.getFullYear();
}

/** Strip YAML frontmatter so the model sees skill body only. */
export function stripSkillFrontmatter(md: string): string {
  const text = String(md ?? "").replace(/^\uFEFF/, "");
  if (!text.startsWith("---")) return text.trim();
  const end = text.indexOf("\n---", 3);
  if (end < 0) return text.trim();
  const after = text.slice(end + 4);
  return after.replace(/^\r?\n/, "").trim();
}

export function getFactCheckerSkillBody(): string {
  return stripSkillFrontmatter(skillMdRaw);
}

export function getFactCheckerRulesBody(): string {
  return String(factCheckRulesRaw ?? "")
    .replace(/^\uFEFF/, "")
    .trim();
}

export function buildFactCheckerLatestYearBlock(year: number = getFactCheckerLatestYear()): string {
  return [
    `LATEST_YEAR=${year}`,
    "Put LATEST_YEAR at the end of every web search query. Prefer current-year primary sources.",
  ].join("\n");
}

/**
 * System prompt for in-article fact checking: skill + rules, then the article edit contract.
 * Skill file updates flow through without rewriting this string.
 */
export function buildProductFactCheckerSystemPrompt(): string {
  const skill = getFactCheckerSkillBody();
  const rules = getFactCheckerRulesBody();
  if (!skill || !rules) {
    throw new Error(
      "Fact checker failed: skills/fact-checker SKILL.md or fact-check-rules.md is empty.",
    );
  }

  const articleContract = `IN-ARTICLE MODE (created or optimized HTML in Neo Pulse):
You are editing the finished article, not writing a Google Sheet.
Return one JSON object only: {"edits":[...],"unhandledQuotes":[...]}.

edits[] fields:
- quote: exact article text (non-empty). Must occur exactly once. If the same sentence appears again, extend the quote with the nearest unique neighboring words so it matches one place only, and return one edit per copy. A quote that appears more than once is rejected. Rewrite those edits until every quote is unique. Do not fail the post because a sentence was repeated.
- verdict: supported | partially_supported | contradicted | omit
- replacement: sentence that stays, or "" to delete the claim
- anchor, sourceUrl, sourceTitle, qualification

Apply the skill and rules above. Competitive-neutral sources only. Exact claim match. Never cite the client site. Never invent URLs or figures. No em dashes.

Article edit mapping:
- supported or partially_supported: non-empty replacement with http(s) sourceUrl and an anchor that appears in replacement. Link that source beside the claim (rel=nofollow).
- partially_supported: the full qualification string must appear verbatim inside replacement (not only in the qualification field). If you cannot put that qualification in the replacement sentence honestly, use verdict omit with empty replacement, sourceUrl, and anchor. Never return partially_supported with qualification only in the separate field.
- contradicted: non-empty replacement only when a competitive-neutral source supports the corrected wording (same sourceUrl + anchor rules). Otherwise replacement "".
- omit: no competitive-neutral source, or the claim must leave the article. replacement "", sourceUrl "", anchor "".

Every material claim in the article must appear in edits. unhandledQuotes lists any material sentence you could not finish; it must be [] to pass.
Do not leave a material claim in the article without an external evidence link.
Never stop the post: rewrite rejected edits, or omit the claim.`;

  return [
    skill,
    "",
    "--- FACT CHECK RULES ---",
    rules,
    "--- END FACT CHECK RULES ---",
    "",
    articleContract,
    "",
    buildFactCheckerLatestYearBlock(),
  ].join("\n");
}
