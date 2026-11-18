import { readFileSync, writeFileSync } from "node:fs";

const DIR = "b:/Neo Pulse/scripts/_tmp-nd-fact";
const seed = JSON.parse(
  readFileSync("b:/Neo Pulse/src/components/integrations/default-properties-seed.json", "utf8"),
);
const site = seed.sites.find((s) => String(s.siteUrl || "").includes("neodigital.ca"));
const auth = `Basic ${Buffer.from(`${site.username}:${site.appPassword.replace(/\s+/g, "")}`).toString("base64")}`;
const apply = JSON.parse(readFileSync(`${DIR}/eeat-or-apply-report.json`, "utf8"));
const failIds = new Set((apply.results || []).filter((x) => !x.ok).map((x) => x.id));
const updates = (JSON.parse(readFileSync(`${DIR}/updates-eeat-or.json`, "utf8")).updates || []).filter((u) =>
  failIds.has(u.id),
);
console.log(JSON.stringify({ retrying: updates.length }, null, 2));

function restBase(type) {
  const root = site.siteUrl.replace(/\/$/, "");
  if (type === "service-area") return `${root}/wp-json/wp/v2/service-area`;
  if (type === "page") return `${root}/wp-json/wp/v2/pages`;
  return `${root}/wp-json/wp/v2/posts`;
}

const results = [];
for (const u of updates) {
  try {
    const res = await fetch(`${restBase(u.type || "post")}/${u.id}`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ content: u.content }),
    });
    const text = await res.text();
    results.push({
      id: u.id,
      pageUrl: u.pageUrl,
      ok: res.ok,
      status: res.status,
      error: res.ok ? undefined : text.slice(0, 200),
    });
  } catch (err) {
    results.push({ id: u.id, pageUrl: u.pageUrl, ok: false, error: String(err?.message || err) });
  }
}
writeFileSync(`${DIR}/eeat-or-apply-retry.json`, JSON.stringify({ results }, null, 2));
console.log(
  JSON.stringify(
    {
      ok: results.filter((r) => r.ok).length,
      fail: results.filter((r) => !r.ok).length,
      failIds: results.filter((r) => !r.ok).map((r) => r.id),
    },
    null,
    2,
  ),
);
