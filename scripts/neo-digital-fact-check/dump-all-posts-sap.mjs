/**
 * Dump ALL Neo Digital posts + service-area pages (not sheet-limited).
 * Writes scripts/_tmp-nd-fact/live-contents.json and urls.json
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SEED = join(ROOT, "src/components/integrations/default-properties-seed.json");
const DIR = join(ROOT, "scripts/_tmp-nd-fact");
const OUT = join(DIR, "live-contents.json");
const URLS = join(DIR, "urls.json");

function loadSite() {
  const seed = JSON.parse(readFileSync(SEED, "utf8"));
  const site = (seed.sites || []).find((s) => String(s.siteUrl || "").includes("neodigital.ca"));
  if (!site?.username || !site?.appPassword) throw new Error("Neo Digital seed credentials missing");
  return site;
}

function authHeader(site) {
  return `Basic ${Buffer.from(`${site.username}:${site.appPassword.replace(/\s+/g, "")}`).toString("base64")}`;
}

async function fetchAll(site, auth, type) {
  const root = site.siteUrl.replace(/\/$/, "");
  const base =
    type === "service-area"
      ? `${root}/wp-json/wp/v2/service-area`
      : `${root}/wp-json/wp/v2/posts`;
  const posts = [];
  let page = 1;
  while (true) {
    const url = `${base}?per_page=100&page=${page}&status=publish,draft,future,private&context=edit`;
    const res = await fetch(url, { headers: { Authorization: auth } });
    if (res.status === 400 || res.status === 404) break;
    if (!res.ok) throw new Error(`${type} page ${page}: HTTP ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) break;
    for (const row of rows) {
      const content =
        typeof row.content === "object" ? row.content.raw || row.content.rendered || "" : String(row.content || "");
      const title =
        typeof row.title === "object" ? row.title.raw || row.title.rendered || "" : String(row.title || "");
      const link = String(row.link || "").replace(/\/$/, "") + "/";
      posts.push({
        id: row.id,
        pageUrl: link,
        title,
        type,
        content,
        status: row.status,
      });
    }
    const totalPages = Number(res.headers.get("x-wp-totalpages") || 1);
    if (page >= totalPages) break;
    page += 1;
  }
  return posts;
}

async function main() {
  mkdirSync(DIR, { recursive: true });
  const site = loadSite();
  const auth = authHeader(site);
  const [blog, sap] = await Promise.all([
    fetchAll(site, auth, "post"),
    fetchAll(site, auth, "service-area"),
  ]);
  const posts = [...blog, ...sap];
  const urls = posts.map((p) => p.pageUrl);
  writeFileSync(OUT, JSON.stringify({ count: posts.length, missing: 0, posts }, null, 2), "utf8");
  writeFileSync(URLS, JSON.stringify(urls, null, 2), "utf8");
  console.log(
    JSON.stringify(
      {
        out: OUT,
        posts: blog.length,
        serviceAreas: sap.length,
        total: posts.length,
        withResearch: posts.filter((p) => /research-and-fact-checking/i.test(p.content || "")).length,
        withoutResearch: posts.filter((p) => p.content && !/research-and-fact-checking/i.test(p.content)).length,
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
