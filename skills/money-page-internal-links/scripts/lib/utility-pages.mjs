/** URL-only utility page filter (mirrors overview-utility-page-filter). */

const OVERVIEW_EXCLUDED_PAGE_HUB_SLUGS = [
  "blog",
  "faq",
  "faqs",
  "service-area",
  "service-areas",
];

const UTILITY_PAGE_SLUGS = new Set(
  [
    ...OVERVIEW_EXCLUDED_PAGE_HUB_SLUGS,
    "privacy-policy",
    "privacy",
    "terms-of-service",
    "terms-of-use",
    "terms-and-conditions",
    "terms-conditions",
    "terms",
    "cookie-policy",
    "cookies",
    "table-of-contents",
    "toc",
    "thank-you",
    "thankyou",
    "disclaimer",
    "accessibility",
    "legal",
    "gdpr",
    "returns-policy",
    "refund-policy",
    "sitemap",
    "site-map",
    "contact",
    "contact-us",
    "promotion",
    "promotions",
    "free-consultation",
    "locations",
  ].map((s) => s.toLowerCase()),
);

const UTILITY_HUB_SLUGS = new Set(
  [
    ...OVERVIEW_EXCLUDED_PAGE_HUB_SLUGS,
    "contact",
    "contact-us",
    "faq",
    "faqs",
    "promotion",
    "promotions",
    "service-area",
    "service-areas",
    "locations",
    "terms-conditions",
    "terms-and-conditions",
    "privacy-policy",
    "free-consultation",
  ].map((s) => s.toLowerCase()),
);

function pathSegments(url) {
  try {
    return new URL(url.trim()).pathname.split("/").filter(Boolean);
  } catch {
    return [];
  }
}

function slugMatchesUtility(slug) {
  const s = slug.toLowerCase().trim();
  if (!s) return false;
  if (UTILITY_PAGE_SLUGS.has(s)) return true;
  if (s.includes("terms")) return true;
  if (s.includes("thank-you") || s.includes("thankyou")) return true;
  if (s.includes("privacy")) return true;
  if (s.includes("cookie")) return true;
  if (s.includes("table-of-contents") || s === "toc") return true;
  return false;
}

function isGlobalPagesBucketHubUrl(url) {
  const segments = pathSegments(url);
  if (segments.length !== 1) return false;
  const hub = segments[0].toLowerCase();
  return OVERVIEW_EXCLUDED_PAGE_HUB_SLUGS.includes(hub);
}

function urlPathMatchesUtility(url) {
  if (isGlobalPagesBucketHubUrl(url)) return true;
  const segments = pathSegments(url);
  if (!segments.length) return false;
  const last = segments[segments.length - 1]?.toLowerCase() ?? "";
  if (last && slugMatchesUtility(last)) return true;
  if (segments.length === 1 && UTILITY_HUB_SLUGS.has(segments[0].toLowerCase())) {
    return true;
  }
  return false;
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isUtilityPageUrl(url) {
  if (!url || typeof url !== "string") return false;
  return urlPathMatchesUtility(url);
}