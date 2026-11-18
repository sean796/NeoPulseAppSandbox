/**
 * OpenRouter rewrites ONE case-study fragment. Prints JSON for Neo MCP apply:
 * { id, find, replace, removedNames }
 *
 * Usage:
 *   node scripts/_tmp-scenario-without-persona/neo-mcp-case-study-one.mjs --html-file path.html --title "..." --business "Advance Blinds"
 *   OR pipe HTML on stdin with --title --business
 */
import { readFileSync, existsSync } from "node:fs";

const MODEL =
  process.env.OPENROUTER_MODEL?.trim() ||
  process.env.NEO_PULSE_AGENT_RESEARCH_MODEL?.trim() ||
  "google/gemini-2.5-flash";

const args = process.argv.slice(2);
function opt(name, fallback = "") {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

function loadKey() {
  const fromEnv =
    process.env.OPENROUTER_API_KEY?.trim() ||
    process.env.VITE_OPENROUTER_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const p =
    "C:\\Users\\Sean Craig\\wpstaging\\sites\\neopulse.local\\data\\php\\neo-pulse-data\\email-worker-keys.json";
  if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8")).openRouterApiKey;
  throw new Error("OPENROUTER_API_KEY missing");
}

const NAMES = [
  "Nadia", "Arthur", "Anya", "Maya", "Olivia", "Quinn", "Elena", "Eleanor",
  "Clara", "Liam", "Chloe", "Evelyn", "Morgan", "Casey", "Brenda", "Harper",
  "Noah", "Emma", "Sophia", "Lucas", "Mia",
];

function namesIn(html) {
  return NAMES.filter((n) => new RegExp(`\\b${n}\\b`).test(html));
}

/**
 * Case study ONLY: nearest H2 before the first blockquote that contains a
 * fictional first name, through that blockquote + Recommendation h3/p.
 * Never spans multiple H2 sections.
 */
function extractCaseStudyBlock(html) {
  if (!html || !/<blockquote[\s>]/i.test(html)) return null;

  const bqRe = /<blockquote[\s>][\s\S]*?<\/blockquote>/gi;
  let bqMatch;
  while ((bqMatch = bqRe.exec(html)) !== null) {
    const bqStart = bqMatch.index;
    const bqEnd = bqStart + bqMatch[0].length;
    if (!namesIn(bqMatch[0]).length) continue;

    const before = html.slice(0, bqStart);
    const h2Matches = [...before.matchAll(/<h2\b[^>]*>[\s\S]*?<\/h2>/gi)];
    if (!h2Matches.length) continue;
    const lastH2 = h2Matches[h2Matches.length - 1];
    const start = lastH2.index;

    // Reject if another H2 sits between this H2 and the blockquote.
    const between = html.slice(start + lastH2[0].length, bqStart);
    if (/<h2\b/i.test(between)) continue;

    let end = bqEnd;
    const afterBq = html.slice(end);
    // Stop before the next H2.
    const nextH2 = afterBq.search(/<h2\b/i);
    const recWindow = nextH2 >= 0 ? afterBq.slice(0, nextH2) : afterBq;
    const recH3 = recWindow.match(
      /^(\s|<!--[\s\S]*?-->)*<h3[^>]*>[\s\S]*?Recommendation:[\s\S]*?<\/h3>/i,
    );
    if (recH3) {
      end += recH3[0].length;
      const afterRec = html.slice(end);
      const beforeNextH2 =
        afterRec.search(/<h2\b/i) >= 0
          ? afterRec.slice(0, afterRec.search(/<h2\b/i))
          : afterRec;
      const recP = beforeNextH2.match(/^(\s|<!--[\s\S]*?-->)*<p[\s>][\s\S]*?<\/p>/i);
      if (recP) end += recP[0].length;
    }

    const block = html.slice(start, end);
    if ((block.match(/<h2\b/gi) || []).length !== 1) continue;
    if (!namesIn(block).length) continue;
    return { start, end, block };
  }
  return null;
}

const SYSTEM = `You rewrite ONLY a case-study HTML fragment. Return JSON: {"html":"...","removedFirstNames":["..."]}.
Remove invented homeowner first names. Use situation openers (In this scenario / Consider a common situation / For example / In most cases) plus a homeowner/their.
Keep links, brands (Hunter Douglas, Alta, Advance Blinds), structure (h2/h3/p/blockquote).
Forbidden: placeholders; inventing a new first name; returning the whole article; changing content outside this fragment.`;

async function main() {
  const title = opt("--title", "page");
  const business = opt("--business", "the connected business");
  const htmlFile = opt("--html-file", "");
  const html = htmlFile
    ? readFileSync(htmlFile, "utf8")
    : readFileSync(0, "utf8");
  const extracted = extractCaseStudyBlock(html);
  if (!extracted) {
    console.log(JSON.stringify({ ok: false, reason: "no-case-study-with-name" }));
    process.exit(0);
  }
  const detected = namesIn(extracted.block);
  const key = loadKey();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://neodigital.ca",
      "X-Title": "Neo Pulse case-study-only",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      max_tokens: 3500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            `Business: ${business}`,
            `Title: ${title}`,
            `Names to remove: ${detected.join(", ")}`,
            "Fragment:",
            extracted.block,
          ].join("\n\n"),
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status} ${(await res.text()).slice(0, 200)}`);
  const parsed = JSON.parse((await res.json()).choices[0].message.content);
  const next = String(parsed.html || "");
  if (!next || !/<blockquote[\s>]/i.test(next)) {
    console.log(JSON.stringify({ ok: false, reason: "bad-model-html" }));
    process.exit(2);
  }
  for (const n of detected) {
    if (new RegExp(`\\b${n}\\b`).test(next)) {
      console.log(JSON.stringify({ ok: false, reason: `name-remains:${n}` }));
      process.exit(2);
    }
  }
  if (/\[NAME\]|\{\{/.test(next)) {
    console.log(JSON.stringify({ ok: false, reason: "placeholder" }));
    process.exit(2);
  }
  console.log(
    JSON.stringify({
      ok: true,
      openRouter: true,
      scope: "case-study-block-only",
      find: extracted.block,
      replace: next,
      removedNames: detected,
      findChars: extracted.block.length,
      replaceChars: next.length,
    }),
  );
}

main().catch((e) => {
  console.error(String(e.stack || e));
  process.exit(1);
});
