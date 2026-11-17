/**
 * Validate findings JSON against the audit contract.
 *
 * @param {unknown} findingsDoc
 * @returns {{ ok: true, findings: object[] } | { ok: false, errors: string[] }}
 */
export function validateFindingsDoc(findingsDoc) {
  const errors = [];
  if (!findingsDoc || typeof findingsDoc !== "object" || Array.isArray(findingsDoc)) {
    return { ok: false, errors: ["findings document must be an object"] };
  }

  const doc = /** @type {Record<string, unknown>} */ (findingsDoc);
  const pages = doc.pages;
  const findings = doc.findings;

  if (pages != null && !Array.isArray(pages)) {
    errors.push("pages must be an array when present");
  }
  if (!Array.isArray(findings)) {
    errors.push("findings must be an array");
    return { ok: false, errors };
  }

  const severities = new Set(["high", "medium", "low"]);
  const certainties = new Set(["proven", "confirm"]);

  findings.forEach((row, index) => {
    const prefix = `findings[${index}]`;
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      errors.push(`${prefix} must be an object`);
      return;
    }
    const item = /** @type {Record<string, unknown>} */ (row);
    const pageId = Number(item.pageId);
    if (!Number.isInteger(pageId) || pageId < 1) {
      errors.push(`${prefix}.pageId must be a positive integer`);
    }
    if (!severities.has(String(item.severity ?? ""))) {
      errors.push(`${prefix}.severity must be high, medium, or low`);
    }
    if (!certainties.has(String(item.certainty ?? ""))) {
      errors.push(`${prefix}.certainty must be proven or confirm`);
    }
    if (typeof item.quote !== "string" || item.quote.trim() === "") {
      errors.push(`${prefix}.quote must be a non-empty string`);
    }
    if (typeof item.problem !== "string" || item.problem.trim() === "") {
      errors.push(`${prefix}.problem must be a non-empty string`);
    }
    if (typeof item.fix !== "string" || item.fix.trim() === "") {
      errors.push(`${prefix}.fix must be a non-empty string`);
    }
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, findings: /** @type {object[]} */ (findings) };
}
