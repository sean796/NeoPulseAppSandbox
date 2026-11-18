/**
 * Replace Neo Digital hero fact-check badge with a theme-matched HTML SVG pill.
 * Brand green #84BD00, card #0B1118, text #F7F4F2 / muted #A9A7A8.
 *
 * Usage:
 *   node scripts/neo-digital-fact-check/install-theme-research-badge.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SEED = join(ROOT, "src/components/integrations/default-properties-seed.json");
const OUT_DIR = join(ROOT, "scripts/_tmp-nd-fact");

const GREEN = "#84BD00";
const GREEN_LIGHT = "#9FD61F";
const CARD = "#0B1118";
const LINE = "#2E3033";
const TEXT = "#F7F4F2";
const MUTED = "#A9A7A8";

const TARGETS = [
  { templateId: 7745, parentId: "c7816ca", afterId: "25bfb0c", label: "Blog Single" },
  { templateId: 7601, parentId: "51cab7f", afterId: "2505e95", label: "Service Area Single" },
];

function loadSite() {
  const seed = JSON.parse(readFileSync(SEED, "utf8"));
  const site = (seed.sites || []).find((s) => String(s.siteUrl || "").includes("neodigital.ca"));
  if (!site?.username || !site?.appPassword) throw new Error("Neo Digital seed credentials missing");
  return site;
}

function authHeader(site) {
  return `Basic ${Buffer.from(`${site.username}:${site.appPassword.replace(/\s+/g, "")}`).toString("base64")}`;
}

function findElement(list, id) {
  for (const el of list || []) {
    if (el.id === id) return el;
    const nested = findElement(el.elements, id);
    if (nested) return nested;
  }
  return null;
}

function removeByClass(list, className) {
  if (!Array.isArray(list)) return 0;
  let removed = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const el = list[i];
    const cls = `${el?.settings?._css_classes || ""} ${el?.settings?.css_classes || ""}`;
    if (cls.includes(className) || cls.includes("neo-fact-check")) {
      list.splice(i, 1);
      removed += 1;
      continue;
    }
    removed += removeByClass(el.elements, className);
  }
  return removed;
}

function badgeHtml() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M12 2.5l7.2 3.1v5.4c0 5.1-3.4 9.4-7.2 11.1-3.8-1.7-7.2-6-7.2-11.1V5.6L12 2.5z" stroke="${GREEN}" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M8.8 12.1l2.2 2.2 4.3-4.5" stroke="${GREEN_LIGHT}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
  return `<div class="nd-research-badge" role="note" aria-label="Research and fact checking">
  <span class="nd-research-badge__icon">${svg}</span>
  <span class="nd-research-badge__copy">
    <strong>Researched &amp; fact-checked</strong>
    <span>Claims verified against primary sources</span>
  </span>
</div>`;
}

function makeBadgeWidget(id) {
  return {
    id,
    elType: "widget",
    widgetType: "html",
    settings: {
      _css_classes: "nd-research-badge-wrap neo-fact-check",
      _title: "Research badge",
      _element_width: "100%",
      _flex_align_self: "flex-start",
      _margin: { top: "10", right: "0", bottom: "4", left: "0", unit: "px", isLinked: false },
      _padding: { top: "0", right: "0", bottom: "0", left: "0", unit: "px", isLinked: true },
      html: badgeHtml(),
      custom_css: `
selector{width:100%}
selector .nd-research-badge{
  display:inline-flex;
  align-items:center;
  gap:10px;
  max-width:100%;
  padding:8px 12px;
  border-radius:999px;
  background:${CARD};
  border:1px solid ${LINE};
  box-shadow:none;
}
selector .nd-research-badge__icon{
  display:flex;
  flex:0 0 18px;
  width:18px;
  height:18px;
  line-height:0;
}
selector .nd-research-badge__icon svg{display:block;width:18px;height:18px}
selector .nd-research-badge__copy{
  display:flex;
  flex-direction:column;
  gap:1px;
  min-width:0;
}
selector .nd-research-badge__copy strong{
  color:${TEXT};
  font-size:0.95rem;
  font-weight:600;
  line-height:1.25;
  letter-spacing:0;
}
selector .nd-research-badge__copy span{
  color:${MUTED};
  font-size:0.85rem;
  line-height:1.3;
}
@media (max-width:767px){
  selector .nd-research-badge{border-radius:14px;align-items:flex-start}
}
`.trim(),
    },
    elements: [],
  };
}

async function updateTemplate(site, auth, target) {
  const base = site.siteUrl.replace(/\/$/, "");
  const getRes = await fetch(`${base}/wp-json/wp/v2/elementor_library/${target.templateId}?context=edit`, {
    headers: { Authorization: auth },
  });
  if (!getRes.ok) throw new Error(`get ${target.label} ${getRes.status}`);
  const post = await getRes.json();
  let data = post.meta?._elementor_data;
  if (typeof data === "string") data = JSON.parse(data);
  if (!Array.isArray(data)) throw new Error(`${target.label}: elementor data missing`);

  const removed = removeByClass(data, "nd-research-badge-wrap");
  const parent = findElement(data, target.parentId);
  if (!parent?.elements) throw new Error(`${target.label}: parent ${target.parentId} missing`);
  const idx = parent.elements.findIndex((e) => e.id === target.afterId);
  if (idx < 0) throw new Error(`${target.label}: after ${target.afterId} missing`);

  const badgeId = `ndrb${Math.random().toString(16).slice(2, 8)}`;
  parent.elements.splice(idx + 1, 0, makeBadgeWidget(badgeId));

  const putRes = await fetch(`${base}/wp-json/wp/v2/elementor_library/${target.templateId}`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ meta: { _elementor_data: JSON.stringify(data) } }),
  });
  const putText = await putRes.text();
  if (!putRes.ok) throw new Error(`save ${target.label} ${putRes.status}: ${putText.slice(0, 400)}`);
  return { label: target.label, templateId: target.templateId, badgeId, removed };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const site = loadSite();
  const auth = authHeader(site);
  const results = [];
  for (const target of TARGETS) {
    results.push(await updateTemplate(site, auth, target));
  }
  writeFileSync(join(OUT_DIR, "theme-research-badge.json"), JSON.stringify({ green: GREEN, results }, null, 2));
  console.log(JSON.stringify({ ok: true, green: GREEN, results }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
