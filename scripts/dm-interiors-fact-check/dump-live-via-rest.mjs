/**
 * Dump post_content for DM Interiors URLs via WP REST (seed app password).
 * Writes scripts/_tmp-dm-fact/live-contents.json
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SEED = join(ROOT, "src/components/integrations/default-properties-seed.json");
const URLS = join(ROOT, "scripts/_tmp-dm-fact/urls.json");
const OUT = join(ROOT, "scripts/_tmp-dm-fact/live-contents.json");

function loadSite() {
  const seed = JSON.parse(readFileSync(SEED, "utf8"));
  const sites = seed.sites || [];
  const site = sites.find((s) => String(s.siteUrl || "").includes("dminteriorsanddesign.com"));
  if (!site?.username || !site?.appPassword) throw new Error("DM Interiors seed credentials missing");
  return site;
}

function authHeader(site) {
  const token = Buffer.from(`${site.username}:${site.appPassword.replace(/\s+/g, "")}`).toString("base64");
  return `Basic ${token}`;
}

async function resolveId(site, url, auth) {
  const path = new URL(url).pathname.replace(/\/$/, "");
  const slug = path.split("/").filter(Boolean).pop();
  const types = path.includes("/service-area/")
    ? ["service-area", "page", "post"]
    : ["post", "page", "service-area"];
  for (const type of types) {
    const endpoint =
      type === "post"
        ? `${site.siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&per_page=1&context=edit`
        : type === "page"
          ? `${site.siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/pages?slug=${encodeURIComponent(slug)}&per_page=1&context=edit`
          : `${site.siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/${type}?slug=${encodeURIComponent(slug)}&per_page=1&context=edit`;
    const res = await fetch(endpoint, { headers: { Authorization: auth } });
    if (!res.ok) continue;
    const rows = await res.json();
    if (Array.isArray(rows) && rows[0]?.id) {
      const row = rows[0];
      const content =
        typeof row.content === "object" ? row.content.raw || row.content.rendered || "" : String(row.content || "");
      const title =
        typeof row.title === "object" ? row.title.raw || row.title.rendered || "" : String(row.title || "");
      return { id: row.id, content, title, type };
    }
  }
  return null;
}

async function mapPool(items, concurrency, fn) {
  let i = 0;
  const out = new Array(items.length);
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return out;
}

async function main() {
  const site = loadSite();
  const auth = authHeader(site);
  const urls = JSON.parse(readFileSync(URLS, "utf8"));
  console.log(`dumping ${urls.length} urls from ${site.siteUrl}`);
  const posts = await mapPool(urls, 6, async (pageUrl) => {
    try {
      const found = await resolveId(site, pageUrl, auth);
      if (!found) return { pageUrl, id: 0, content: "", error: "not-found" };
      return { pageUrl, id: found.id, title: found.title, type: found.type, content: found.content };
    } catch (err) {
      return { pageUrl, id: 0, content: "", error: String(err?.message || err).slice(0, 200) };
    }
  });
  const missing = posts.filter((p) => !p.id).length;
  writeFileSync(OUT, JSON.stringify({ count: posts.length, missing, posts }, null, 2), "utf8");
  console.log(JSON.stringify({ out: OUT, count: posts.length, missing }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
