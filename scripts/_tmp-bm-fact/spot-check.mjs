/**
 * Spot-check one blog + one service-area post for suggested wording as nofollow anchors.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SEED = join(ROOT, "src/components/integrations/default-properties-seed.json");
const POSTS = join(ROOT, "scripts/_tmp-bm-fact/posts.json");
const UPDATES = join(ROOT, "scripts/_tmp-bm-fact/updates.json");

function loadSite() {
  const seed = JSON.parse(readFileSync(SEED, "utf8"));
  const site = (seed.sites || []).find((s) => String(s.siteUrl || "").includes("blindmagic.com"));
  if (!site?.username || !site?.appPassword) throw new Error("Blind Magic seed credentials missing");
  return site;
}

function authHeader(site) {
  const token = Buffer.from(`${site.username}:${site.appPassword.replace(/\s+/g, "")}`).toString("base64");
  return `Basic ${token}`;
}

async function fetchRaw(site, auth, id, type) {
  const base =
    type === "service-area"
      ? `${site.siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/service-area`
      : type === "page"
        ? `${site.siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/pages`
        : `${site.siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/posts`;
  const res = await fetch(`${base}/${id}?context=edit`, { headers: { Authorization: auth } });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  const row = JSON.parse(text);
  return typeof row.content === "object" ? row.content.raw || "" : String(row.content || "");
}

function checkClaim(html, claim) {
  const suggested = String(claim.suggested || claim.claim || "").trim();
  const url = String(claim.resolvedUrl || "").trim();
  const hasWording = html.includes(suggested) || html.includes(suggested.replace(/&/g, "&amp;"));
  let linked = false;
  if (url) {
    const escaped = suggested.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `<a[^>]+href="${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*rel="nofollow"[^>]*>[^<]*${escaped.slice(0, 40)}`,
      "i",
    );
    const re2 = new RegExp(
      `<a[^>]+href="${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*rel="nofollow"[^>]*>`,
      "i",
    );
    linked = re2.test(html) && hasWording;
  }
  const research = /id=["']research-and-fact-checking["']/.test(html);
  return {
    claim: String(claim.claim || "").slice(0, 80),
    suggested: suggested.slice(0, 80),
    source: url || "(none)",
    hasWording,
    linked: url ? linked : null,
    researchBlock: research,
  };
}

async function main() {
  const site = loadSite();
  const auth = authHeader(site);
  const posts = JSON.parse(readFileSync(POSTS, "utf8")).posts;
  const updates = JSON.parse(readFileSync(UPDATES, "utf8")).updates;
  const byUrl = new Map(updates.map((u) => [u.pageUrl, u]));

  const blog = posts.find(
    (p) =>
      p.pageUrl.includes("/blog/clean-fabric-blinds-cleaning/") &&
      (p.claims || []).some((c) => c.resolvedUrl),
  );
  const sap = posts.find(
    (p) =>
      p.pageUrl.includes("/service-area/blinds-shades-cold-lake/") &&
      (p.claims || []).some((c) => c.resolvedUrl || c.suggested),
  );
  if (!blog || !sap) throw new Error("spot-check posts missing from posts.json");

  const live = JSON.parse(readFileSync(join(ROOT, "scripts/_tmp-bm-fact/live-contents.json"), "utf8"));
  const typeById = new Map((live.posts || []).map((p) => [p.id, p.type || "post"]));

  const results = [];
  for (const post of [blog, sap]) {
    const u = byUrl.get(post.pageUrl);
    if (!u) {
      results.push({ pageUrl: post.pageUrl, error: "not-in-updates" });
      continue;
    }
    const type = typeById.get(u.id) || "post";
    const html = await fetchRaw(site, auth, u.id, type);
    const claims = (post.claims || []).filter((c) => c.suggested || c.resolvedUrl).slice(0, 3);
    results.push({
      pageUrl: post.pageUrl,
      id: u.id,
      type,
      checks: claims.map((c) => checkClaim(html, c)),
      hasResearchBlock: /id=["']research-and-fact-checking["']/.test(html),
      sampleAnchor: (html.match(/<a href="https?:\/\/(?!blindmagic)[^"]+" rel="nofollow" target="_blank">[^<]{10,120}<\/a>/i) || [
        null,
      ])[0],
    });
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
