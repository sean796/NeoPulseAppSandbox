import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SEED = join(ROOT, "src/components/integrations/default-properties-seed.json");
const UPDATES = join(ROOT, "scripts/_tmp-nd-fact/updates-short-anchors-retry.json");

function loadSite() {
  const seed = JSON.parse(readFileSync(SEED, "utf8"));
  const site = (seed.sites || []).find((s) => String(s.siteUrl || "").includes("neodigital.ca"));
  if (!site?.username || !site?.appPassword) throw new Error("missing creds");
  return site;
}

async function main() {
  const site = loadSite();
  const auth = `Basic ${Buffer.from(`${site.username}:${site.appPassword.replace(/\s+/g, "")}`).toString("base64")}`;
  const updates = JSON.parse(readFileSync(UPDATES, "utf8"));
  const out = [];
  for (const u of updates) {
    const url = `${site.siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/service-area/${u.id}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify({ content: u.content }),
      });
      const text = await res.text();
      out.push({ id: u.id, ok: res.ok, status: res.status, error: res.ok ? null : text.slice(0, 200) });
    } catch (err) {
      out.push({ id: u.id, ok: false, error: String(err?.message || err) });
    }
  }
  console.log(JSON.stringify(out, null, 2));
}

main();
