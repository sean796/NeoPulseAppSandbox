import { readFileSync } from "node:fs";
const seed = JSON.parse(readFileSync("b:/Neo Pulse/src/components/integrations/default-properties-seed.json", "utf8"));
const site = seed.sites.find((s) => String(s.siteUrl || "").includes("neodigital.ca"));
const auth = `Basic ${Buffer.from(`${site.username}:${site.appPassword.replace(/\s+/g, "")}`).toString("base64")}`;
const live = JSON.parse(readFileSync("b:/Neo Pulse/scripts/_tmp-nd-fact/live-contents.json", "utf8"));
const full = JSON.parse(readFileSync("b:/Neo Pulse/scripts/_tmp-nd-fact/updates-full.json", "utf8")).updates;
const u = full.find((x) => x.id === 8042);
const row = (live.posts || []).find((p) => p.id === 8042);
if (!u) {
  console.log(JSON.stringify({ ok: false, error: "update missing" }));
  process.exit(1);
}
const type = row?.type || "service-area";
const base =
  type === "service-area"
    ? `${site.siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/service-area`
    : `${site.siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/posts`;
const res = await fetch(`${base}/8042`, {
  method: "POST",
  headers: { Authorization: auth, "Content-Type": "application/json" },
  body: JSON.stringify({ content: u.content }),
});
console.log(JSON.stringify({ id: 8042, status: res.status, ok: res.ok, type, pageUrl: u.pageUrl }, null, 2));
if (!res.ok) console.log((await res.text()).slice(0, 400));
