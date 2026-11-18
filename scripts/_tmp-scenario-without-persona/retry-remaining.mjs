import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const CONCURRENCY = 3;
const NAMES = [
  "Nadia",
  "Arthur",
  "Anya",
  "Maya",
  "Olivia",
  "Quinn",
  "Elena",
  "Eleanor",
  "Clara",
  "Liam",
  "Chloe",
  "Evelyn",
  "Morgan",
];

function loadKey() {
  const e = process.env.OPENROUTER_API_KEY || process.env.VITE_OPENROUTER_API_KEY;
  if (e?.trim()) return e.trim();
  const p =
    "C:\\Users\\Sean Craig\\wpstaging\\sites\\neopulse.local\\data\\php\\neo-pulse-data\\email-worker-keys.json";
  return JSON.parse(readFileSync(p, "utf8")).openRouterApiKey;
}

const key = loadKey();
const seed = JSON.parse(
  readFileSync(join(ROOT, "src/components/integrations/default-properties-seed.json"), "utf8"),
);
const site = seed.sites.find((s) => String(s.siteUrl).includes("blindmagic"));
const auth = Buffer.from(`${site.username}:${site.appPassword}`).toString("base64");
const base = String(site.siteUrl).replace(/\/$/, "");

const jobs = [
  ["posts", 18226],
  ["posts", 18091],
  ["posts", 17427],
  ["service-area", 22637],
  ["service-area", 20820],
  ["service-area", 20804],
  ["service-area", 18890],
  ["service-area", 17803],
  ["service-area", 18884],
  ["service-area", 18882],
  ["service-area", 18878],
  ["service-area", 18874],
  ["service-area", 18864],
  ["service-area", 18862],
  ["service-area", 18860],
  ["service-area", 18854],
  ["service-area", 18850],
  ["service-area", 19256],
  ["service-area", 18846],
  ["service-area", 20035],
  ["service-area", 18832],
  ["service-area", 18828],
  ["service-area", 18824],
  ["service-area", 17789],
  ["service-area", 17785],
  ["service-area", 17783],
  ["service-area", 17767],
  ["service-area", 18247],
  ["service-area", 17299],
  ["service-area", 17361],
  ["service-area", 17575],
  ["service-area", 17579],
  ["service-area", 17716],
  ["service-area", 17718],
  ["service-area", 17728],
  ["service-area", 17752],
  ["service-area", 17750],
  ["service-area", 17744],
];

async function get(restBase, id) {
  const r = await fetch(`${base}/wp-json/wp/v2/${restBase}/${id}?context=edit`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!r.ok) throw new Error(`get ${restBase}/${id} ${r.status}`);
  return r.json();
}

async function put(restBase, id, content) {
  const r = await fetch(`${base}/wp-json/wp/v2/${restBase}/${id}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });
  if (!r.ok) throw new Error(`put ${restBase}/${id} ${(await r.text()).slice(0, 200)}`);
}

function namesIn(html) {
  return NAMES.filter((n) => new RegExp(`\\b${n}\\b`).test(html));
}

async function rewrite([restBase, id]) {
  const post = await get(restBase, id);
  const html = post.content?.raw || post.content?.rendered || "";
  const present = namesIn(html);
  if (!present.length) return { id, restBase, ok: true, skipped: "clean" };
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      temperature: 0.2,
      max_tokens: 12000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Return JSON {"html":"..."} with the FULL page HTML. Remove invented first names ${present.join(", ")}. Keep Hunter Douglas, Duette, Blind Magic, Alta, Paul Kane Park, James Macdonald Bridge, Mark Outside-Mount, links, and all other HTML intact. Use situation openers (In this scenario / Consider a common situation / For example / In most cases) and a homeowner/their. Do not invent new first names.`,
        },
        { role: "user", content: html },
      ],
    }),
  });
  if (!res.ok) throw new Error(`or ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  const next = parsed.html;
  if (typeof next !== "string" || !next.trim()) throw new Error("empty html");
  const leftover = namesIn(next);
  if (leftover.length) throw new Error(`still has ${leftover.join(",")}`);
  for (const token of ["Hunter Douglas", "Blind Magic", "Duette", "Alta"]) {
    if (html.includes(token) && !next.includes(token)) throw new Error(`lost ${token}`);
  }
  await put(restBase, id, next);
  return { id, restBase, ok: true, removed: present, link: post.link };
}

const report = { accepted: [], failed: [], skipped: [] };
let i = 0;
async function worker() {
  while (i < jobs.length) {
    const idx = i++;
    const job = jobs[idx];
    try {
      const row = await rewrite(job);
      if (row.skipped) report.skipped.push(row);
      else report.accepted.push(row);
      console.log(JSON.stringify(row));
    } catch (e) {
      const row = { id: job[1], restBase: job[0], ok: false, err: String(e.message || e) };
      report.failed.push(row);
      console.error(JSON.stringify(row));
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
writeFileSync(
  join(ROOT, "scripts/_tmp-scenario-without-persona/remaining-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify({
    accepted: report.accepted.length,
    skipped: report.skipped.length,
    failed: report.failed.length,
  }),
);
process.exit(report.failed.length ? 2 : 0);
