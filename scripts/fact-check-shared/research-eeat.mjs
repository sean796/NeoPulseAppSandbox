/**
 * Shared E-E-A-T research disclosure for Blind Magic / In the Shade / DM Interiors / KWB.
 * Keeps id="research-and-fact-checking" for anchors; drops unsubstantiated boilerplate.
 */

/**
 * @typedef {{
 *   team: string,
 *   cities: string,
 *   performance: string,
 *   defaultTopic: string,
 *   leadKind: 'product' | 'advisory' | 'agency',
 *   reviewerRole: string,
 * }} ResearchLocale
 */

/** @type {Record<string, ResearchLocale>} */
export const RESEARCH_LOCALES = {
  itsf: {
    team: "The In the Shade Team",
    cities:
      "Stuart, Port St. Lucie, Palm City, Jupiter, and surrounding Treasure Coast communities",
    performance:
      "Recommendations for solar heat gain, UV protection, and moisture durability reflect real-world performance behind Florida impact-rated glass and coastal humidity conditions",
    defaultTopic: "window coverings",
    leadKind: "product",
    reviewerRole: "certified window covering specialists",
  },
  bm: {
    team: "The Blind Magic Team",
    cities: "Edmonton, Sherwood Park, and surrounding Alberta communities",
    performance:
      "Recommendations for insulation, light control, and cold-climate durability reflect real-world performance in prairie winters and Alberta residential installs",
    defaultTopic: "window coverings",
    leadKind: "product",
    reviewerRole: "certified window covering specialists",
  },
  dm: {
    team: "The DM Interiors Team",
    cities: "Marietta, Ellijay, Dacula, and surrounding metro Atlanta communities",
    performance:
      "Recommendations for light control, privacy, and year-round comfort reflect real-world performance in Georgia homes across humid summers and varied residential installs",
    defaultTopic: "window coverings",
    leadKind: "product",
    reviewerRole: "certified window covering specialists",
  },
  kwb: {
    team: "The KWB Team",
    cities: "Edmonton, Yellowknife, and the Alberta / NWT communities KWB serves",
    performance:
      "Tax, corporate, and advisory recommendations reflect current CRA guidance and real client work for private Canadian corporations and local businesses",
    defaultTopic: "Canadian tax and accounting",
    leadKind: "advisory",
    reviewerRole: "chartered professional accountants and tax advisors",
  },
  nd: {
    team: "The Neo Digital Team",
    cities: "Edmonton and the Alberta businesses Neo Digital serves",
    performance:
      "SEO, WordPress, and digital marketing recommendations reflect current platform documentation and real client work across Neo Digital websites",
    defaultTopic: "digital marketing and WordPress",
    leadKind: "agency",
    reviewerRole: "SEO and WordPress specialists",
  },
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {ResearchLocale} locale
 * @param {string} topicHint
 * @param {string} [listHtml] existing <ul>...</ul> or empty
 */
export function buildResearchEeatHtml(locale, topicHint, listHtml = "") {
  const topic =
    String(topicHint || locale.defaultTopic || "").trim() || locale.defaultTopic || "this topic";
  const list = String(listHtml || "").trim();
  const lead =
    locale.leadKind === "advisory"
      ? `Tax rules, filing requirements, and advisory details in this guide on ${escapeHtml(topic)} are verified against current CRA and provincial guidance and applied in client work across ${escapeHtml(locale.cities)}.`
      : locale.leadKind === "agency"
        ? `Platform details, SEO guidance, and implementation notes in this guide on ${escapeHtml(topic)} are verified against current official documentation and applied across live client sites for businesses in ${escapeHtml(locale.cities)}.`
        : `Product specifications, mounting clearances, and technical details in this guide on ${escapeHtml(topic)} are verified against official manufacturer technical reference manuals and field-tested across residential installations in ${escapeHtml(locale.cities)}.`;
  return `<h2 id="research-and-fact-checking">Technical Review &amp; Local Standards</h2>
<p>${lead}</p>
<p>${escapeHtml(locale.performance)}. Written and reviewed by the ${escapeHtml(locale.reviewerRole)} at ${escapeHtml(locale.team)}. Last reviewed: November 2026.</p>
${list ? `${list}\n` : ""}`.trim();
}

/**
 * Extract trailing <ul> source list from an existing research block (if any).
 * @param {string} researchHtml
 */
export function extractResearchList(researchHtml) {
  const m = String(researchHtml || "").match(/<ul\b[^>]*>[\s\S]*?<\/ul>/i);
  return m ? m[0].trim() : "";
}

/**
 * Find research block start index (opening tag that contains the id).
 * @param {string} html
 */
export function findResearchBlockStart(html) {
  const idIdx = html.search(/id=["']research-and-fact-checking["']/i);
  if (idIdx < 0) return -1;
  const open = html.lastIndexOf("<", idIdx);
  return open >= 0 ? open : idIdx;
}

/**
 * End of research block: before next H2 / FAQ / flo-faq, else EOF.
 * @param {string} html
 * @param {number} start
 */
export function findResearchBlockEnd(html, start) {
  const after = html.slice(start + 1);
  const next = after.search(/<h2\b|<div\b[^>]*class=["'][^"']*flo-faq/i);
  if (next < 0) return html.length;
  return start + 1 + next;
}

/**
 * Replace or return null if no research block.
 * @param {string} html
 * @param {ResearchLocale} locale
 * @param {string} topicHint
 */
export function replaceResearchEeatBlock(html, locale, topicHint) {
  const start = findResearchBlockStart(html);
  if (start < 0) return null;
  const end = findResearchBlockEnd(html, start);
  const oldBlock = html.slice(start, end);
  const list = extractResearchList(oldBlock);
  const next = buildResearchEeatHtml(locale, topicHint, list);
  return `${html.slice(0, start)}${next}\n${html.slice(end)}`;
}
