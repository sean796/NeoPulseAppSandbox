/**
 * Add neo-fact-check icon-list to DM Interiors Blog Post Single (Elementor) via WP REST.
 * Inserts after the date/byline heading in the article Text column.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SEED = join(ROOT, "src/components/integrations/default-properties-seed.json");
const OUT_DIR = join(ROOT, "scripts/_tmp-dm-fact");
const TEMPLATE_ID = Number(process.env.DM_BLOG_SINGLE_ID || 682);
const PARENT_ID = "85d7499"; // Text column
const AFTER_ID = "5a8abe1"; // date | By DM Interiors
const SVG_PATH = join(OUT_DIR, "dm-shield-check-primary.svg");
const PRIMARY = "#075253";

function loadSite() {
  const seed = JSON.parse(readFileSync(SEED, "utf8"));
  const site = (seed.sites || []).find((s) => String(s.siteUrl || "").includes("dminteriorsanddesign.com"));
  if (!site?.username || !site?.appPassword) throw new Error("DM Interiors seed credentials missing");
  return site;
}

function authHeader(site) {
  const token = Buffer.from(`${site.username}:${site.appPassword.replace(/\s+/g, "")}`).toString("base64");
  return `Basic ${token}`;
}

function newId() {
  return Math.random().toString(16).slice(2, 10);
}

function findElement(list, id) {
  for (const el of list || []) {
    if (el.id === id) return el;
    const nested = findElement(el.elements, id);
    if (nested) return nested;
  }
  return null;
}

async function ensureMedia(site, auth) {
  mkdirSync(OUT_DIR, { recursive: true });
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${PRIMARY}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z"></path>
  <path d="M9 12l2 2 4-4"></path>
</svg>
`;
  writeFileSync(SVG_PATH, svg, "utf8");

  const form = new FormData();
  form.append(
    "file",
    new Blob([svg], { type: "image/svg+xml" }),
    "dm-shield-check-primary.svg",
  );
  form.append("title", "Fact check shield");
  const res = await fetch(`${site.siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/media`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Disposition": 'attachment; filename="dm-shield-check-primary.svg"',
    },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`media upload failed ${res.status}: ${text.slice(0, 400)}`);
  const json = JSON.parse(text);
  return { id: json.id, url: json.source_url || json.guid?.rendered };
}

function makeBadge(media) {
  return {
    id: newId(),
    elType: "widget",
    widgetType: "icon-list",
    settings: {
      _css_classes: "neo-fact-check",
      _title: "Fact checked",
      _element_width: "100%",
      _flex_align_self: "center",
      _padding: { top: "0", right: "0", bottom: "0", left: "0", unit: "px", isLinked: true },
      _margin: { top: "8", right: "0", bottom: "8", left: "0", unit: "px", isLinked: false },
      view: "traditional",
      icon_self_vertical_align: "center",
      icon_size: { size: 16, unit: "px" },
      text_indent: { size: 0, unit: "px" },
      icon_typography_typography: "custom",
      icon_typography_font_size: { size: 15, unit: "px" },
      icon_typography_font_weight: "500",
      icon_typography_line_height: { size: 1.3, unit: "em" },
      __globals__: {
        text_color: "globals/colors?id=text",
        icon_color: "globals/colors?id=primary",
      },
      custom_css:
        "selector .elementor-icon-list-items{display:flex;align-items:center;margin:0;padding:0;list-style:none;}selector .elementor-icon-list-item{display:flex;align-items:center;margin:0;padding:0;gap:8px;}selector .elementor-icon-list-icon{display:flex;align-items:center;justify-content:center;width:16px;height:16px;flex:0 0 16px;line-height:0;}selector .elementor-icon-list-icon svg{width:16px;height:16px;display:block;}selector .elementor-icon-list-text{padding-inline-start:0;line-height:1.3;}",
      icon_list: [
        {
          _id: "fc0a1b2",
          text: "All claims in this content have been fact-checked by humans.",
          link: { url: "" },
          selected_icon: {
            library: "svg",
            value: { id: media.id, url: media.url },
          },
        },
      ],
    },
    elements: [],
  };
}

async function main() {
  const site = loadSite();
  const auth = authHeader(site);
  const base = site.siteUrl.replace(/\/$/, "");

  const getRes = await fetch(`${base}/wp-json/wp/v2/elementor_library/${TEMPLATE_ID}?context=edit`, {
    headers: { Authorization: auth },
  });
  if (!getRes.ok) throw new Error(`get template ${getRes.status}`);
  const post = await getRes.json();
  let data = post.meta?._elementor_data;
  if (typeof data === "string") data = JSON.parse(data);
  if (!Array.isArray(data)) throw new Error("elementor data missing");

  const already = JSON.stringify(data).includes("neo-fact-check");
  if (already) {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: "badge-already-present", templateId: TEMPLATE_ID }));
    return;
  }

  const media = await ensureMedia(site, auth);
  const parent = findElement(data, PARENT_ID);
  if (!parent?.elements) throw new Error(`parent ${PARENT_ID} not found`);
  const idx = parent.elements.findIndex((e) => e.id === AFTER_ID);
  if (idx < 0) throw new Error(`after ${AFTER_ID} not found`);
  const badge = makeBadge(media);
  parent.elements.splice(idx + 1, 0, badge);

  const body = {
    meta: {
      _elementor_data: JSON.stringify(data),
    },
  };
  const putRes = await fetch(`${base}/wp-json/wp/v2/elementor_library/${TEMPLATE_ID}`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const putText = await putRes.text();
  if (!putRes.ok) throw new Error(`save template ${putRes.status}: ${putText.slice(0, 500)}`);

  writeFileSync(join(OUT_DIR, "badge-report.json"), JSON.stringify({ templateId: TEMPLATE_ID, badgeId: badge.id, media }, null, 2));
  console.log(JSON.stringify({ ok: true, templateId: TEMPLATE_ID, badgeId: badge.id, media }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
