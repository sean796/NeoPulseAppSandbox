import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");
const MODEL =
  process.env.OPENROUTER_MODEL?.trim() ||
  process.env.NEO_PULSE_AGENT_RESEARCH_MODEL?.trim() ||
  "google/gemini-2.5-flash";

function loadKey() {
  const fromEnv =
    process.env.OPENROUTER_API_KEY?.trim() ||
    process.env.OPEN_ROUTER_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const keysPath =
    process.env.EMAIL_WORKER_KEYS_PATH?.trim() ||
    "C:\\Users\\Sean Craig\\wpstaging\\sites\\neopulse.local\\data\\php\\neo-pulse-data\\email-worker-keys.json";
  if (existsSync(keysPath)) {
    const keys = JSON.parse(readFileSync(keysPath, "utf8"));
    const k = String(keys.openRouterApiKey || "").trim();
    if (k) return k;
  }
  throw new Error("OPENROUTER_API_KEY missing");
}

const SYSTEM = `You rewrite ONLY a case-study / illustrative scenario HTML fragment for a local business article.

Return JSON only: { "html": string, "removedFirstNames": string[] }.

Rules:
- Rewrite this fragment only. Return the full fragment HTML with the same structure (headings, <p>, <blockquote>, Recommendation <h3>, recommendation <p>, links).
- Remove invented homeowner first names. Use situation openers that vary: "In this scenario", "Consider a common situation", "For example", "In most cases", plus "a homeowner" / "their" / "the household".
- Keep product brands, place names, the connected business name, and every href/class/id intact.
- Forbidden: placeholders like [NAME] or {{homeowner}}; inventing a new first name; returning the whole page; omitting the Recommendation block when it was present.
- html must be the rewritten fragment only — never surrounding article sections.`;

const jobsPath = process.argv[2] || join(HERE, "advance-extract.json");
const businessName = process.argv[3] || "Advance Blinds & Drapery";
const jobs = JSON.parse(readFileSync(jobsPath, "utf8"));
const apiKey = loadKey();

const results = [];
for (const job of jobs) {
  const block = Buffer.from(job.find_b64, "base64").toString("utf8");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://neodigital.ca",
      "X-Title": "Neo Pulse scenario-without-persona case-study-only",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            `Connected business name: ${businessName}`,
            `Page title: ${job.title}`,
            `Detected first names in this fragment: ${(job.names || []).join(", ")}`,
            "Preserve verbatim if present: Hunter Douglas, Advance Blinds, Alta, PowerView",
            "Case-study HTML fragment only:",
            block,
          ].join("\n\n"),
        },
      ],
    }),
  });
  const raw = await res.text();
  if (!res.ok) {
    results.push({ id: job.id, ok: false, err: `or-${res.status}`, raw: raw.slice(0, 400) });
    continue;
  }
  let parsed;
  try {
    const body = JSON.parse(raw);
    const content = body.choices?.[0]?.message?.content || "";
    parsed = JSON.parse(content);
  } catch (e) {
    results.push({ id: job.id, ok: false, err: "parse", detail: String(e) });
    continue;
  }
  const html = String(parsed.html || "").trim();
  if (!html || /\[NAME\]|\{\{/.test(html)) {
    results.push({ id: job.id, ok: false, err: "bad-html" });
    continue;
  }
  const still = (job.names || []).filter((n) => new RegExp(`\\b${n}\\b`).test(html));
  if (still.length) {
    results.push({ id: job.id, ok: false, err: "names-remain", still });
    continue;
  }
  const apply = {
    id: job.id,
    title: job.title,
    removed: parsed.removedFirstNames || job.names,
    find_b64: job.find_b64,
    replace_b64: Buffer.from(html, "utf8").toString("base64"),
  };
  writeFileSync(join(HERE, `${job.id}-apply.json`), JSON.stringify(apply, null, 2));
  writeFileSync(join(HERE, `${job.id}-find.html`), block);
  writeFileSync(join(HERE, `${job.id}-replace.html`), html);
  results.push({ id: job.id, ok: true, bytes: html.length, removed: apply.removed });
}

writeFileSync(join(HERE, "advance-or-results.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
