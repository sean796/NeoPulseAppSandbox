/**
 * Validate claims JSON against the fact-checker contract.
 *
 * @param {unknown} claimsDoc
 * @returns {{ ok: true, claims: object[] } | { ok: false, errors: string[] }}
 */
export function validateClaimsDoc(claimsDoc) {
  const errors = [];
  if (!claimsDoc || typeof claimsDoc !== "object" || Array.isArray(claimsDoc)) {
    return { ok: false, errors: ["claims document must be an object"] };
  }

  const doc = /** @type {Record<string, unknown>} */ (claimsDoc);
  const pages = doc.pages;
  const claims = doc.claims;

  if (pages != null && !Array.isArray(pages)) {
    errors.push("pages must be an array when present");
  }
  if (!Array.isArray(claims)) {
    errors.push("claims must be an array");
    return { ok: false, errors };
  }

  const categories = new Set([
    "product_spec",
    "operating_system",
    "materials",
    "energy",
    "safety",
    "warranty",
    "pricing",
    "compatibility",
    "durability",
    "none",
  ]);
  const verdicts = new Set([
    "supported",
    "partially_supported",
    "unsupported",
    "outdated",
    "contradicted",
    "no_product_claims",
  ]);
  const sourceTypes = new Set(["manufacturer", "manual", "government", "industry", ""]);

  claims.forEach((row, index) => {
    const prefix = `claims[${index}]`;
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      errors.push(`${prefix} must be an object`);
      return;
    }
    const item = /** @type {Record<string, unknown>} */ (row);
    const pageId = Number(item.pageId);
    if (item.pageId != null && (!Number.isInteger(pageId) || pageId < 1)) {
      errors.push(`${prefix}.pageId must be a positive integer when present`);
    }
    if (typeof item.quote !== "string" || item.quote.trim() === "") {
      errors.push(`${prefix}.quote must be a non-empty string`);
    }
    if (!categories.has(String(item.category ?? ""))) {
      errors.push(`${prefix}.category must be a known claim category`);
    }
    const verdict = String(item.verdict ?? "");
    if (!verdicts.has(verdict)) {
      errors.push(`${prefix}.verdict must be a known verdict`);
    }
    if (item.sourceType != null && !sourceTypes.has(String(item.sourceType))) {
      errors.push(`${prefix}.sourceType must be manufacturer, manual, government, industry, or empty`);
    }
    if (verdict === "supported" || verdict === "partially_supported") {
      const url = String(item.sourceUrl ?? "").trim();
      if (!/^https?:\/\//i.test(url)) {
        errors.push(`${prefix}.sourceUrl must be an http(s) URL for ${verdict}`);
      }
    }
    if (verdict === "partially_supported") {
      if (typeof item.qualification !== "string" || item.qualification.trim() === "") {
        errors.push(`${prefix}.qualification must be non-empty for partially_supported`);
      }
    }
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, claims: /** @type {object[]} */ (claims) };
}
