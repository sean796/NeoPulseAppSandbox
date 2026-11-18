import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "scripts/_tmp-elite-audit-fix");
const seed = JSON.parse(
  fs.readFileSync(
    path.join(process.cwd(), "src/components/integrations/default-properties-seed.json"),
    "utf8",
  ),
);
const site = seed.sites.find((s) => String(s.siteUrl || "").includes("eliteshadings"));
if (!site?.appPassword) throw new Error("Elite credentials missing");

const auth = Buffer.from(`${site.username}:${site.appPassword}`).toString("base64");
const base = String(site.siteUrl).replace(/\/$/, "");
const FULL_NAME = "Elite Shutters, Shadings &amp; Flooring";
const FULL_NAME_PLAIN = "Elite Shutters, Shadings & Flooring";

function replaceAll(html, pairs) {
  let out = html;
  for (const [from, to] of pairs) {
    if (!from) continue;
    out = out.split(from).join(to);
  }
  return out;
}

function loadHtml(id) {
  return fs.readFileSync(path.join(ROOT, `${id}.html`), "utf8");
}

function loadMeta(id) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, `${id}.meta.json`), "utf8"));
}

async function patch(endpoint, id, body) {
  const res = await fetch(`${base}/wp-json/wp/v2/${endpoint}/${id}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  if (!res.ok) {
    throw new Error(`${endpoint}/${id} ${res.status}: ${JSON.stringify(json).slice(0, 800)}`);
  }
  return {
    id: json.id,
    status: json.status,
    slug: json.slug,
    link: json.link,
    title: json.title?.rendered || json.title?.raw || "",
  };
}

const results = [];
const skipNaples = process.argv.includes("--skip-naples");

// 22027 — Sacramento neighborhoods → real Manteca / Elk Grove / Livermore neighborhoods
{
  const id = 22027;
  const meta = loadMeta(id);
  let html = loadHtml(id);
  html = replaceAll(html, [
    [
      "Mid-Century Modern homes in South Land Park and East Sacramento, along with Craftsman bungalows featuring wide trim in Curtis Park and Midtown",
      "Mid-Century Modern homes in Laguna West and Franklin in Elk Grove, along with Craftsman bungalows featuring wide trim in Spreckels Park in Manteca and Springtown in Livermore",
    ],
  ]);
  if (html.includes("Sacramento") || html.includes("South Land Park") || html.includes("Curtis Park")) {
    throw new Error("22027 still has Sacramento geo");
  }
  results.push(await patch(meta.endpoint, id, { content: html }));
}

// 21999 — Plano / Richardson / Kessler / Highland Park → CA
{
  const id = 21999;
  const meta = loadMeta(id);
  let html = loadHtml(id);
  html = replaceAll(html, [
    ["near Plano and Richardson", "near Manteca and Elk Grove"],
    ["Plano and Richardson", "Manteca and Elk Grove"],
    ["areas like Highland Park", "areas like Downtown Livermore"],
    ["Highland Park", "Downtown Livermore"],
    ["neighborhoods like Kessler Park", "neighborhoods like Spreckels Park in Manteca"],
    ["Kessler Park", "Spreckels Park in Manteca"],
  ]);
  for (const bad of ["Plano", "Richardson", "Kessler", "Highland Park"]) {
    if (html.includes(bad)) throw new Error(`21999 still has ${bad}`);
  }
  results.push(await patch(meta.endpoint, id, { content: html }));
}

// 21994 — Milwaukee / Chicago / WI → CA Central Valley
{
  const id = 21994;
  const meta = loadMeta(id);
  let html = loadHtml(id);
  html = replaceAll(html, [
    ["In Milwaukee homes", "In Manteca and Elk Grove homes"],
    ["Milwaukee homes", "Manteca and Elk Grove homes"],
    ["Milwaukee", "Manteca"],
    ["waterfront-facing rooms", "west-facing rooms"],
    ["waterfront glare, or lake-effect winter cold", "west-facing glare, or tule-fog winter cold"],
    ["lake-effect winter cold", "tule-fog winter cold"],
    ["lake-effect", "tule-fog"],
    ["historic brownstones in Lincoln Park and English-style cottages", "mid-century ranch homes in Spreckels Park in Manteca and Craftsman cottages in Springtown in Livermore"],
    ["Lincoln Park", "Spreckels Park in Manteca"],
    ["Tudor Revival cottages and Oak Park bungalows", "Craftsman cottages and mid-century bungalows in Downtown Livermore"],
    ["Oak Park bungalows", "Downtown Livermore bungalows"],
    ["Oak Park", "Downtown Livermore"],
    ["Gold Coast high-rises or Walker's Point loft renovations", "Livermore two-story great rooms or Elk Grove loft renovations"],
    ["Gold Coast", "Livermore"],
    ["Walker's Point", "Elk Grove"],
    ["humid lakefront areas like Rogers Park", "foggy winter neighborhoods like Downtown Manteca"],
    ["Rogers Park", "Downtown Manteca"],
    ["older Bay View or Wauwatosa homes", "older Spreckels Park or Springtown homes"],
    ["Bay View", "Spreckels Park"],
    ["Wauwatosa", "Springtown"],
  ]);
  for (const bad of [
    "Milwaukee",
    "Lincoln Park",
    "Oak Park",
    "Gold Coast",
    "Walker's Point",
    "Rogers Park",
    "Bay View",
    "Wauwatosa",
    "lake-effect",
  ]) {
    if (html.includes(bad)) throw new Error(`21994 still has ${bad}`);
  }
  results.push(await patch(meta.endpoint, id, { content: html }));
}

// 22051 — NAP full business name (first consultation sentence + keep consistency on answer lead)
{
  const id = 22051;
  const meta = loadMeta(id);
  let html = loadHtml(id);
  html = replaceAll(html, [
    [
      "During our complimentary in-home consultations, Elite Shutters &amp; Shadings takes exact horizontal",
      `During our complimentary in-home consultations, ${FULL_NAME} takes exact horizontal`,
    ],
  ]);
  // Only require the flagged consultation phrase to use full NAP; do not mass-rename every short form.
  if (!html.includes(`${FULL_NAME} takes exact horizontal`)) {
    throw new Error("22051 full NAP not applied");
  }
  results.push(await patch(meta.endpoint, id, { content: html }));
}

// 22050 — remove generator meta sentence
{
  const id = 22050;
  const meta = loadMeta(id);
  let html = loadHtml(id);
  html = replaceAll(html, [
    [
      "<p>You will also find a labeled real-world hypothetical featuring Lena under stated assumptions with a site-level business recommendation in the Real-World Example section, alongside our product comparisons and consultation steps for Custom Window Treatments across the valley.</p>",
      "<p>The sections ahead cover product comparisons and consultation steps for Custom Window Treatments across the valley.</p>",
    ],
  ]);
  if (html.includes("labeled real-world hypothetical featuring Lena")) {
    throw new Error("22050 generator meta still present");
  }
  results.push(await patch(meta.endpoint, id, { content: html }));
}

// 22063 — Brentwood vs Manteca contradiction
{
  const id = 22063;
  const meta = loadMeta(id);
  let html = loadHtml(id);
  html = replaceAll(html, [
    [
      "Marisol is finishing a west-facing family room in Manteca where afternoon sun and summer heat hit the glass hardest",
      "Marisol is finishing a west-facing family room in Brentwood where afternoon sun and summer heat hit the glass hardest",
    ],
    [
      "should I choose real wood custom blinds or faux wood blinds for a west-facing family room in Manteca?",
      "should I choose real wood custom blinds or faux wood blinds for a west-facing family room in Brentwood?",
    ],
  ]);
  // Keep persona name (softening) but fix geo contradiction only.
  if (/family room in Manteca/.test(html)) {
    throw new Error("22063 still places Brentwood scenario in Manteca");
  }
  results.push(await patch(meta.endpoint, id, { content: html }));
}

// 22067 — Speed Freak Killers → La Loma (real Modesto neighborhood); restore publish
{
  const id = 22067;
  const meta = loadMeta(id);
  let html = loadHtml(id);
  html = replaceAll(html, [
    ["Speed Freak Killers, Modesto", "La Loma, Modesto"],
    ["Speed Freak Killers", "La Loma"],
    ["speed freak killers modesto", "la loma modesto"],
    [
      "established neighborhoods near areas connected to the Speed Freak Killers investigation, where solid evening privacy is an ongoing practical priority",
      "established neighborhoods near La Loma, where solid evening privacy is an ongoing practical priority",
    ],
    [
      "near historical investigation corridors documented on Wikipedia around Speed Freak Killers, Modesto",
      "near residential corridors around La Loma, Modesto",
    ],
    [
      "near historical investigation corridors documented on Wikipedia around La Loma, Modesto",
      "near residential corridors around La Loma, Modesto",
    ],
    [
      "near areas connected to the La Loma investigation, where solid evening privacy is an ongoing practical priority",
      "near La Loma, where solid evening privacy is an ongoing practical priority",
    ],
  ]);
  // Clean residual investigation wording if partial replace left it
  html = replaceAll(html, [
    ["La Loma investigation", "La Loma neighborhood"],
    ["historical investigation corridors", "residential corridors"],
    ["documented on Wikipedia around ", "around "],
  ]);
  if (/Speed Freak|investigation corridors|Wikipedia around/i.test(html)) {
    throw new Error("22067 still has crime/location artifacts");
  }
  results.push(
    await patch(meta.endpoint, id, {
      content: html,
      title: "Custom Blinds Options And Installation Near La Loma Modesto CA",
      slug: "custom-blinds-la-loma-modesto-ca",
      excerpt:
        "Looking for custom blinds near La Loma in Modesto? We proudly serve La Loma, Modesto, CA with free in-home consultations.",
      status: "publish",
    }),
  );
}

// 22069 — Demographics of Filipino Americans as place → College Area; fix Manteca/Modesto; restore
{
  const id = 22069;
  const meta = loadMeta(id);
  let html = loadHtml(id);
  html = replaceAll(html, [
    ["Demographics of Filipino Americans, Modesto, CA", "College Area, Modesto, CA"],
    ["Demographics of Filipino Americans, Modesto", "College Area, Modesto"],
    ["Demographics of Filipino Americans", "College Area"],
    [
      "should I go with real wood or faux wood blinds for the kitchen and bathrooms in our Manteca home?",
      "should I go with real wood or faux wood blinds for the kitchen and bathrooms in our Modesto home?",
    ],
  ]);
  if (html.includes("Demographics of Filipino") || /kitchen and bathrooms in our Manteca home/.test(html)) {
    throw new Error("22069 still has fake place or Manteca contradiction");
  }
  results.push(
    await patch(meta.endpoint, id, {
      content: html,
      title: "Guide To Blinds Installation In Modesto Near College Area",
      slug: "blinds-installation-college-area-modesto",
      excerpt:
        "Need blinds installation near College Area in Modesto? We cover College Area, Modesto, CA with expert service from our Manteca showroom.",
      status: "publish",
    }),
  );
}

// 20829 — load rewritten file from MCP step when present
if (!skipNaples) {
  const id = 20829;
  const meta = loadMeta(id);
  const rewrittenPath = path.join(ROOT, "20829.rewritten.json");
  if (!fs.existsSync(rewrittenPath)) throw new Error("Missing 20829.rewritten.json");
  const rewritten = JSON.parse(fs.readFileSync(rewrittenPath, "utf8"));
  if (!rewritten.content || !String(rewritten.content).includes("Manteca")) {
    throw new Error("Rewrite missing Manteca content");
  }
  for (const b of ["Lindsey", "Naples", "Vanderbilt", "Gulf", "salt air", "explore operating systems"]) {
    if (String(rewritten.content).includes(b) || String(rewritten.title || "").includes(b)) {
      throw new Error(`Rewrite still contains forbidden: ${b}`);
    }
  }
  results.push(
    await patch(meta.endpoint, id, {
      content: rewritten.content,
      title: rewritten.title || "Banded Blinds Near Manteca California",
      slug: rewritten.slug || "banded-blinds-manteca-ca",
      excerpt:
        rewritten.excerpt ||
        "Upgrade your home with stylish banded blinds in Manteca, CA. Get expert installation from Elite Shutters, Shadings & Flooring.",
      status: "publish",
    }),
  );
}

fs.writeFileSync(path.join(ROOT, "apply-results.json"), JSON.stringify(results, null, 2), "utf8");
console.log(JSON.stringify(results, null, 2));
