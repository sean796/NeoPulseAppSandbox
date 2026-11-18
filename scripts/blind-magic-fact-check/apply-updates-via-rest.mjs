/**
 * Apply updates.json to Blind Magic via WP REST (seed app password).
 * Then print purge URL list for NitroPack.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SEED = join(ROOT, "src/components/integrations/default-properties-seed.json");
const UPDATES = join(ROOT, "scripts/_tmp-bm-fact/updates.json");
const LIVE = join(ROOT, "scripts/_tmp-bm-fact/live-contents.json");
const OUT = join(ROOT, "scripts/_tmp-bm-fact/apply-report.json");
const LIMIT = Number(process.env.BM_APPLY_LIMIT || 0);
const OFFSET = Number(process.env.BM_APPLY_OFFSET || 0);

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

function restBase(type, site) {
  const root = site.siteUrl.replace(/\/$/, "");
  if (type === "page") return `${root}/wp-json/wp/v2/pages`;
  if (type === "service-area") return `${root}/wp-json/wp/v2/service-area`;
  return `${root}/wp-json/wp/v2/posts`;
}

async function main() {
  const site = loadSite();
  const auth = authHeader(site);
  const live = JSON.parse(readFileSync(LIVE, "utf8"));
  const typeById = new Map((live.posts || []).map((p) => [p.id, p.type || "post"]));
  const data = JSON.parse(readFileSync(UPDATES, "utf8"));
  let updates = data.updates || [];
  if (OFFSET) updates = updates.slice(OFFSET);
  if (LIMIT > 0) updates = updates.slice(0, LIMIT);
  console.log(`applying ${updates.length} updates`);

  const results = await mapPool(updates, 4, async (u) => {
    const type = typeById.get(u.id) || "post";
    const url = `${restBase(type, site)}/${u.id}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: u.content }),
      });
      const text = await res.text();
      if (!res.ok) {
        return { id: u.id, pageUrl: u.pageUrl, ok: false, status: res.status, error: text.slice(0, 300) };
      }
      return { id: u.id, pageUrl: u.pageUrl, ok: true, status: res.status, type };
    } catch (err) {
      return { id: u.id, pageUrl: u.pageUrl, ok: false, error: String(err?.message || err).slice(0, 300) };
    }
  });

  const ok = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok);
  writeFileSync(OUT, JSON.stringify({ ok, fail: fail.length, results }, null, 2), "utf8");
  console.log(JSON.stringify({ ok, fail: fail.length, sampleFail: fail.slice(0, 5) }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
