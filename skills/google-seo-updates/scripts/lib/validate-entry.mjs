/** Validate one dated Google SEO archive entry. */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateArchiveEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return { ok: false, error: "entry must be an object" };
  }
  for (const key of ["id", "date", "title"]) {
    if (typeof entry[key] !== "string" || entry[key].trim() === "") {
      return { ok: false, error: `${key} must be a non-empty string` };
    }
  }
  if (!DATE_RE.test(entry.date)) {
    return { ok: false, error: "date must be YYYY-MM-DD" };
  }
  if (!Array.isArray(entry.sourcesChecked) || entry.sourcesChecked.length < 1) {
    return { ok: false, error: "sourcesChecked must be a non-empty array" };
  }
  for (const url of entry.sourcesChecked) {
    if (typeof url !== "string" || url.trim() === "") {
      return { ok: false, error: "sourcesChecked entries must be non-empty strings" };
    }
  }
  if (!Array.isArray(entry.items)) {
    return { ok: false, error: "items must be an array" };
  }
  for (let i = 0; i < entry.items.length; i += 1) {
    const item = entry.items[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: `items[${i}] must be an object` };
    }
    for (const key of ["sourceUrl", "title", "whatChanged", "postRule"]) {
      if (typeof item[key] !== "string" || item[key].trim() === "") {
        return { ok: false, error: `items[${i}].${key} must be a non-empty string` };
      }
    }
  }
  return { ok: true };
}
