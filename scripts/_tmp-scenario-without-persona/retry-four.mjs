import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

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

async function get(id) {
  const r = await fetch(`${base}/wp-json/wp/v2/service-area/${id}?context=edit`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!r.ok) throw new Error(`get ${id} ${r.status}`);
  return r.json();
}

async function put(id, content) {
  const r = await fetch(`${base}/wp-json/wp/v2/service-area/${id}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });
  if (!r.ok) throw new Error(`put ${id} ${(await r.text()).slice(0, 200)}`);
}

async function rewrite(id, names) {
  const post = await get(id);
  const html = post.content?.raw || post.content?.rendered || "";
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
          content: `Return JSON {"html":"..."} with the FULL page HTML. Remove invented first names ${names.join(", ")}. Keep Hunter Douglas, Duette, Blind Magic, Alta, links, and all other HTML intact. Use situation openers (In this scenario / Consider a common situation / For example / In most cases) and a homeowner/their. Do not invent new first names.`,
        },
        { role: "user", content: html },
      ],
    }),
  });
  if (!res.ok) throw new Error(`or ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  const next = parsed.html;
  if (typeof next !== "string" || !next.trim()) throw new Error(`${id} empty html`);
  for (const n of names) {
    if (new RegExp(`\\b${n}\\b`).test(next)) throw new Error(`${id} still has ${n}`);
  }
  if (html.includes("Hunter Douglas") && !next.includes("Hunter Douglas")) {
    throw new Error(`${id} lost Hunter Douglas`);
  }
  if (!next.includes("Blind Magic")) throw new Error(`${id} lost Blind Magic`);
  await put(id, next);
  console.log(JSON.stringify({ id, ok: true, len: next.length }));
}

const jobs = [
  [19276, ["Clara"]],
  [18251, ["Chloe"]],
  [17374, ["Eleanor"]],
  [19262, ["Liam"]],
];

for (const [id, names] of jobs) {
  try {
    await rewrite(id, names);
  } catch (e) {
    console.error(JSON.stringify({ id, ok: false, err: String(e.message || e) }));
  }
}
