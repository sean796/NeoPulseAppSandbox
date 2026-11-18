import { readFileSync, writeFileSync } from "node:fs";

const live = JSON.parse(readFileSync("scripts/_tmp-bm-fact/live-contents.json", "utf8"));
const want = /Louver Shop|Boise Premier|EverWood|Modern Precious Metals/i;
const out = [];

for (const p of live.posts || []) {
  const h = String(p.content || "");
  if (!want.test(h)) continue;
  for (const m of h.matchAll(/<a\b[^>]*rel=["'][^"']*nofollow[^"']*["'][^>]*>[\s\S]*?<\/a>/gi)) {
    const full = m[0];
    if (!want.test(full)) continue;
    const i = m.index ?? 0;
    out.push({
      pageUrl: p.pageUrl,
      id: p.id,
      snippet: h.slice(Math.max(0, i - 120), Math.min(h.length, i + full.length + 80)).replace(/\s+/g, " "),
      anchor: full.replace(/\s+/g, " ").slice(0, 400),
    });
  }
}

writeFileSync("scripts/_tmp-bm-fact/branded-context.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify({ count: out.length, sample: out.slice(0, 6) }, null, 2));
