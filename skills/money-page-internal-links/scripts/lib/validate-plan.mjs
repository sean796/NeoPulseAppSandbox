/** Validate top-down link plan: money pages + GSC keyword jobs for apply brainstorm. */

const MAX_PLAN_LINKS = 50;

const SAP_PATH_RE = /\/service-area(?:\/|$)|\/service-areas(?:\/|$)|\/location(?:\/|$)|\/locations(?:\/|$)/i;

/**
 * @param {unknown} plan
 * @param {{ moneyUrls?: string[], blogUrls?: string[] }} inventory
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateLinkPlan(plan, inventory) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    return { ok: false, error: 'plan must be a JSON object with a "links" array' };
  }

  const links = /** @type {Record<string, unknown>} */ (plan).links;
  if (!Array.isArray(links)) {
    return { ok: false, error: "plan.links must be an array" };
  }

  if (links.length > MAX_PLAN_LINKS) {
    return {
      ok: false,
      error: `plan.links must have at most ${MAX_PLAN_LINKS} items. Received: ${links.length}`,
    };
  }

  const moneyUrls = Array.isArray(inventory?.moneyUrls)
    ? inventory.moneyUrls.map((u) => String(u).trim()).filter(Boolean)
    : [];
  const blogUrls = Array.isArray(inventory?.blogUrls)
    ? inventory.blogUrls.map((u) => String(u).trim()).filter(Boolean)
    : [];

  const moneySet = new Set(moneyUrls);
  const targetSet = new Set([...moneyUrls, ...blogUrls]);
  const moneySeen = new Set();

  for (let i = 0; i < links.length; i += 1) {
    const row = links[i];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return { ok: false, error: `links[${i}] must be an object` };
    }

    const moneyUrl = String(row.moneyUrl ?? "").trim();
    const targetUrl = String(row.targetUrl ?? "").trim();
    const keyword = String(row.keyword ?? row.anchorText ?? "").trim();

    if (!moneyUrl) {
      return { ok: false, error: `links[${i}].moneyUrl is required` };
    }
    if (!moneySet.has(moneyUrl)) {
      return { ok: false, error: `links[${i}].moneyUrl is not in inventory.moneyUrls` };
    }
    if (SAP_PATH_RE.test(moneyUrl)) {
      return { ok: false, error: `links[${i}].moneyUrl must not be a service-area or location URL` };
    }
    if (!keyword) {
      return { ok: false, error: `links[${i}].keyword (or anchorText) must be a non-empty GSC keyword` };
    }
    if (moneySeen.has(moneyUrl)) {
      return { ok: false, error: `duplicate moneyUrl at links[${i}]` };
    }
    moneySeen.add(moneyUrl);

    if (targetUrl) {
      if (!targetSet.has(targetUrl)) {
        return {
          ok: false,
          error: `links[${i}].targetUrl must be in inventory.blogUrls or inventory.moneyUrls`,
        };
      }
      if (targetUrl === moneyUrl) {
        return { ok: false, error: `links[${i}].targetUrl must differ from moneyUrl` };
      }
      if (SAP_PATH_RE.test(targetUrl)) {
        return { ok: false, error: `links[${i}].targetUrl must not be a service-area or location URL` };
      }
    }
  }

  return { ok: true };
}
