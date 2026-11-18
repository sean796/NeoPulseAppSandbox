import fs from "node:fs";
import path from "node:path";

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

const IDS = [22027, 21999, 21994, 22051, 20829, 22069, 22067, 22063, 22050, 22064, 22046];

async function getPost(id) {
  const urls = [
    `${base}/wp-json/wp/v2/posts/${id}?context=edit`,
    `${base}/wp-json/wp/v2/service-area/${id}?context=edit`,
    `${base}/wp-json/wp/v2/pages/${id}?context=edit`,
  ];
  for (const url of urls) {
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
    });
    if (res.ok) {
      const j = await res.json();
      return {
        endpoint: url.includes("/posts/")
          ? "posts"
          : url.includes("/service-area/")
            ? "service-area"
            : "pages",
        id: j.id,
        type: j.type,
        status: j.status,
        slug: j.slug,
        link: j.link,
        title: j.title?.raw ?? j.title?.rendered ?? "",
        content: j.content?.raw ?? j.content?.rendered ?? "",
        excerpt: j.excerpt?.raw ?? j.excerpt?.rendered ?? "",
        yoast: j.yoast_head_json || null,
        meta: j.meta || null,
      };
    }
  }
  return { id, error: "not found" };
}

const out = [];
for (const id of IDS) {
  const row = await getPost(id);
  out.push({
    id: row.id,
    endpoint: row.endpoint,
    type: row.type,
    status: row.status,
    slug: row.slug,
    link: row.link,
    title: row.title,
    excerpt: String(row.excerpt || "").slice(0, 400),
    contentLen: String(row.content || "").length,
    contentPreview: String(row.content || "").slice(0, 800),
    error: row.error || null,
  });
  if (row.content) {
    fs.writeFileSync(
      path.join(process.cwd(), "scripts/_tmp-elite-audit-fix", `${id}.html`),
      row.content,
      "utf8",
    );
    fs.writeFileSync(
      path.join(process.cwd(), "scripts/_tmp-elite-audit-fix", `${id}.meta.json`),
      JSON.stringify(
        {
          id: row.id,
          endpoint: row.endpoint,
          type: row.type,
          status: row.status,
          slug: row.slug,
          link: row.link,
          title: row.title,
          excerpt: row.excerpt,
        },
        null,
        2,
      ),
      "utf8",
    );
  }
}

fs.writeFileSync(
  path.join(process.cwd(), "scripts/_tmp-elite-audit-fix", "index.json"),
  JSON.stringify(out, null, 2),
  "utf8",
);
console.log(JSON.stringify(out, null, 2));
