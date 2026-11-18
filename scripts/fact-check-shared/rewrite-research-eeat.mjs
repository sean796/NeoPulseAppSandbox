/**
 * Rewrite existing #research-and-fact-checking blocks to E-E-A-T copy.
 * Preserves each post's source <ul>. Dumps live content, then applies via REST.
 *
 * Usage:
 *   node scripts/fact-check-shared/rewrite-research-eeat.mjs --brand=itsf
 *   node scripts/fact-check-shared/rewrite-research-eeat.mjs --brand=bm
 *   node scripts/fact-check-shared/rewrite-research-eeat.mjs --brand=dm
 *   node scripts/fact-check-shared/rewrite-research-eeat.mjs --brand=kwb
 *   node scripts/fact-check-shared/rewrite-research-eeat.mjs --brand=all
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RESEARCH_LOCALES, replaceResearchEeatBlock } from "./research-eeat.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SEED = join(ROOT, "src/components/integrations/default-properties-seed.json");

const BRANDS = {
  itsf: {
    localeKey: "itsf",
    host: "intheshadeflorida.com",
    tmp: "scripts/_tmp-itsf-fact",
    dump: "scripts/in-the-shade-fact-check/dump-live-via-rest.mjs",
    brandStrip: /\s*\|\s*In the Shade.*$/i,
  },
  bm: {
    localeKey: "bm",
    host: "blindmagic.com",
    tmp: "scripts/_tmp-bm-fact",
    dump: "scripts/blind-magic-fact-check/dump-live-via-rest.mjs",
    brandStrip: /\s*\|\s*Blind Magic.*$/i,
  },
  dm: {
    localeKey: "dm",
    host: "dminteriorsanddesign.com",
    tmp: "scripts/_tmp-dm-fact",
    dump: "scripts/dm-interiors-fact-check/dump-live-via-rest.mjs",
    brandStrip: /\s*\|\s*DM Interiors.*$/i,
  },
  kwb: {
    localeKey: "kwb",
    host: "kwbllp.com",
    tmp: "scripts/_tmp-kwb-fact",
    dump: "scripts/kwb-fact-check/dump-live-via-rest.mjs",
    brandStrip: /\s*\|\s*KWB(?:LLP)?.*$/i,
  },
};

function topicFromTitle(title, brandStrip, defaultTopic) {
  const fallback = defaultTopic || "window coverings";
  const t = String(title || "").trim();
  if (!t) return fallback;
  return t.replace(brandStrip, "").trim() || fallback;
}

function runNode(script) {
  const r = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) throw new Error(`${script} exited ${r.status}`);
}

function loadSite(host) {
  const seed = JSON.parse(readFileSync(SEED, "utf8"));
  const site = (seed.sites || []).find((s) => String(s.siteUrl || "").includes(host));
  if (!site?.username || !site?.appPassword) throw new Error(`Seed credentials missing for ${host}`);
  return site;
}

function authHeader(site) {
  return `Basic ${Buffer.from(`${site.username}:${site.appPassword.replace(/\s+/g, "")}`).toString("base64")}`;
}

function restBase(type, site) {
  const root = site.siteUrl.replace(/\/$/, "");
  if (type === "page") return `${root}/wp-json/wp/v2/pages`;
  if (type === "service-area") return `${root}/wp-json/wp/v2/service-area`;
  if (type === "location") return `${root}/wp-json/wp/v2/location`;
  if (type === "insight") return `${root}/wp-json/wp/v2/insight`;
  return `${root}/wp-json/wp/v2/posts`;
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

async function rewriteBrand(key) {
  const cfg = BRANDS[key];
  if (!cfg) throw new Error(`Unknown brand ${key}`);
  const locale = RESEARCH_LOCALES[cfg.localeKey];
  const tmp = join(ROOT, cfg.tmp);
  mkdirSync(tmp, { recursive: true });

  if (!existsSync(join(tmp, "urls.json"))) {
    throw new Error(`Missing ${cfg.tmp}/urls.json. Run the brand sheet pipeline once first.`);
  }

  console.log(`\n=== ${key}: dump live ===`);
  runNode(join(ROOT, cfg.dump));

  const live = JSON.parse(readFileSync(join(tmp, "live-contents.json"), "utf8"));
  const updates = [];
  const reports = [];
  for (const row of live.posts || []) {
    if (!row?.id || !row.content) continue;
    if (!/id=["']research-and-fact-checking["']/i.test(row.content)) {
      reports.push({ id: row.id, pageUrl: row.pageUrl, skipped: "no-research-block" });
      continue;
    }
    const topic = topicFromTitle(row.title || row.pageTitle || "", cfg.brandStrip, locale.defaultTopic);
    const next = replaceResearchEeatBlock(String(row.content), locale, topic);
    if (!next || next === row.content) {
      reports.push({ id: row.id, pageUrl: row.pageUrl, skipped: "unchanged" });
      continue;
    }
    if (/government and industry|factual review covering product specifications/i.test(next)) {
      reports.push({ id: row.id, pageUrl: row.pageUrl, error: "boilerplate-still-present" });
      continue;
    }
    updates.push({
      id: row.id,
      pageUrl: row.pageUrl,
      content: next,
      type: row.type || "post",
    });
    reports.push({ id: row.id, pageUrl: row.pageUrl, ok: true, topic });
  }

  writeFileSync(join(tmp, "updates-research-eeat.json"), JSON.stringify({ updates }, null, 2), "utf8");
  writeFileSync(join(tmp, "research-eeat-report.json"), JSON.stringify({ reports }, null, 2), "utf8");
  console.log(JSON.stringify({ brand: key, toApply: updates.length, scanned: reports.length }, null, 2));

  if (!updates.length) return { brand: key, ok: 0, fail: 0 };

  const site = loadSite(cfg.host);
  const auth = authHeader(site);
  const results = await mapPool(updates, 4, async (u) => {
    const url = `${restBase(u.type, site)}/${u.id}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify({ content: u.content }),
      });
      const text = await res.text();
      if (!res.ok) {
        return { id: u.id, pageUrl: u.pageUrl, ok: false, status: res.status, error: text.slice(0, 300) };
      }
      return { id: u.id, pageUrl: u.pageUrl, ok: true, status: res.status };
    } catch (err) {
      return { id: u.id, pageUrl: u.pageUrl, ok: false, error: String(err?.message || err).slice(0, 300) };
    }
  });

  const ok = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok);
  writeFileSync(
    join(tmp, "research-eeat-apply-report.json"),
    JSON.stringify({ ok, fail: fail.length, results }, null, 2),
    "utf8",
  );
  console.log(JSON.stringify({ brand: key, ok, fail: fail.length, sampleFail: fail.slice(0, 5) }, null, 2));
  return { brand: key, ok, fail: fail.length };
}

async function main() {
  const arg = process.argv.find((a) => a.startsWith("--brand="));
  const brand = (arg?.split("=")[1] || "all").toLowerCase();
  const keys = brand === "all" ? Object.keys(BRANDS) : [brand];
  const summary = [];
  for (const key of keys) {
    summary.push(await rewriteBrand(key));
  }
  console.log(JSON.stringify({ summary }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
