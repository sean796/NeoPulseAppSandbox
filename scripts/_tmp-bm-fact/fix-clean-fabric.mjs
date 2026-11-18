/**
 * Fix clean-fabric-blinds-cleaning: restore markdown-broken heading to real h2.
 * Also strip leftover short thespruce.com citation outside research block.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SEED = join(ROOT, "src/components/integrations/default-properties-seed.json");
const LIVE = join(ROOT, "scripts/_tmp-bm-fact/clean-fabric-live.html");

function loadSite() {
  const seed = JSON.parse(readFileSync(SEED, "utf8"));
  const site = (seed.sites || []).find((s) => String(s.siteUrl || "").includes("blindmagic.com"));
  if (!site?.username || !site?.appPassword) throw new Error("Blind Magic seed credentials missing");
  return site;
}

function authHeader(site) {
  return (
    "Basic " +
    Buffer.from(`${site.username}:${site.appPassword.replace(/\s+/g, "")}`).toString("base64")
  );
}

function fixHtml(html) {
  let out = html;
  const before = out;

  // Restore ## heading paragraph to a real H2. Prefer existing advice slug if free;
  // otherwise use a dedicated advice id (Scheduling already owns fabric-blind-cleaning-advice-for-homes).
  const hasSchedulingId = /id=["']fabric-blind-cleaning-advice-for-homes["']/.test(out);
  const adviceId = hasSchedulingId
    ? "fabric-blind-cleaning-advice"
    : "fabric-blind-cleaning-advice-for-homes";

  out = out.replace(
    /<p>\s*##\s*Fabric Blind Cleaning Advice for Homes\s*<\/p>/i,
    `<h2 id="${adviceId}">Fabric Blind Cleaning Advice for Homes</h2>`,
  );

  // If overview TOC still points at the old advice id but Scheduling stole it,
  // retarget the advice TOC link to the restored heading when present.
  if (hasSchedulingId && /id=["']fabric-blind-cleaning-advice["']/.test(out)) {
    out = out.replace(
      /href="#fabric-blind-cleaning-advice-for-homes">([^<]*Advice[^<]*)<\/a>/i,
      'href="#fabric-blind-cleaning-advice">$1</a>',
    );
  }

  // Drop leftover host-only thespruce citation outside research block
  const researchIdx = out.search(/id=["']research-and-fact-checking["']/i);
  const body = researchIdx >= 0 ? out.slice(0, researchIdx) : out;
  const research = researchIdx >= 0 ? out.slice(researchIdx) : "";
  const cleanedBody = body.replace(
    /\s*<a\b[^>]*href="https:\/\/www\.thespruce\.com\/how-to-clean-fabric-blinds-5224346"[^>]*>\s*thespruce\.com\s*<\/a>/gi,
    "",
  );
  out = cleanedBody + research;

  return { html: out, changed: out !== before };
}

async function main() {
  const site = loadSite();
  const auth = authHeader(site);
  const get = await fetch(`${site.siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/posts/20543?context=edit`, {
    headers: { Authorization: auth },
  });
  if (!get.ok) throw new Error(`GET ${get.status}`);
  const row = await get.json();
  const raw = typeof row.content === "object" ? row.content.raw || "" : String(row.content || "");
  writeFileSync(LIVE, raw, "utf8");

  const { html, changed } = fixHtml(raw);
  if (!changed) {
    console.log(JSON.stringify({ ok: true, changed: false, note: "nothing to fix" }, null, 2));
    return;
  }

  const post = await fetch(`${site.siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/posts/20543`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ content: html }),
  });
  const text = await post.text();
  if (!post.ok) throw new Error(`POST ${post.status}: ${text.slice(0, 300)}`);

  writeFileSync(LIVE.replace(".html", "-fixed.html"), html, "utf8");
  console.log(
    JSON.stringify(
      {
        ok: true,
        changed: true,
        stillBroken: /<p>\s*##\s*Fabric Blind Cleaning Advice/i.test(html),
        hasAdviceH2: /<h2[^>]*>Fabric Blind Cleaning Advice for Homes<\/h2>/i.test(html),
        leftoverHostCite: /thespruce\.com<\/a>/.test(html.split(/research-and-fact-checking/i)[0] || ""),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
