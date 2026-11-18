/** Validate redirect-map JSON shape. */

const REASONS = new Set(["overlap", "aged-low-demand"]);

function blogPath(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "";
  let path = raw;
  const scheme = raw.indexOf("://");
  if (scheme !== -1) {
    const start = raw.indexOf("/", scheme + 3);
    path = start === -1 ? "/" : raw.slice(start);
  }
  const q = path.indexOf("?");
  if (q !== -1) path = path.slice(0, q);
  path = path.replace(/\/+/g, "/");
  if (!path.startsWith("/")) path = `/${path}`;
  if (!path.endsWith("/")) path = `${path}/`;
  return path;
}

export function validateMap(map) {
  if (!map || typeof map !== "object" || Array.isArray(map)) {
    return { ok: false, error: "map must be an object" };
  }
  if (!String(map.siteId ?? "").trim()) {
    return { ok: false, error: "siteId is required" };
  }
  const windowDays = Number(map.windowDays);
  if (!Number.isFinite(windowDays) || windowDays < 1) {
    return { ok: false, error: "windowDays must be a positive integer" };
  }
  if (!Array.isArray(map.redirects)) {
    return { ok: false, error: "redirects must be an array" };
  }
  if (!Array.isArray(map.leave)) {
    return { ok: false, error: "leave must be an array" };
  }
  for (let i = 0; i < map.redirects.length; i += 1) {
    const row = map.redirects[i];
    if (!row || typeof row !== "object") {
      return { ok: false, error: `redirects[${i}] must be an object` };
    }
    if (!String(row.from ?? "").trim() || !String(row.to ?? "").trim()) {
      return { ok: false, error: `redirects[${i}] needs from and to` };
    }
    if (!REASONS.has(String(row.reason ?? ""))) {
      return { ok: false, error: `redirects[${i}].reason must be overlap or aged-low-demand` };
    }
    if (!Number.isFinite(Number(row.ageDays)) || Number(row.ageDays) < 0) {
      return { ok: false, error: `redirects[${i}].ageDays must be >= 0` };
    }
    if (!Number.isFinite(Number(row.clicks90d)) || Number(row.clicks90d) < 0) {
      return { ok: false, error: `redirects[${i}].clicks90d must be >= 0` };
    }
    if (typeof row.foldIn !== "string") {
      return { ok: false, error: `redirects[${i}].foldIn must be a string` };
    }
    if (blogPath(row.from) === blogPath(row.to)) {
      return { ok: false, error: `redirects[${i}] points at itself` };
    }
  }
  const sources = new Set(map.redirects.map((row) => blogPath(row.from)));
  for (let i = 0; i < map.redirects.length; i += 1) {
    if (sources.has(blogPath(map.redirects[i].to))) {
      return {
        ok: false,
        error: `redirects[${i}] chains through another source; point every loser at the one keeper`,
      };
    }
  }
  for (let i = 0; i < map.leave.length; i += 1) {
    const row = map.leave[i];
    if (!row || typeof row !== "object") {
      return { ok: false, error: `leave[${i}] must be an object` };
    }
    if (!String(row.url ?? "").trim() || !String(row.why ?? "").trim()) {
      return { ok: false, error: `leave[${i}] needs url and why` };
    }
  }
  return { ok: true };
}
