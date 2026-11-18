import { readFileSync } from "node:fs";

const updates = JSON.parse(readFileSync("scripts/_tmp-bm-fact/updates.json", "utf8")).updates;
const samples = [];
for (const p of updates) {
  const h = p.content || "";
  const researchIdx = h.search(/id=["']research-and-fact-checking["']/i);
  for (const m of h.matchAll(
    /<a\b([^>]*)>([^<]{1,60})<\/a>/gi,
  )) {
    const attrs = m[1] || "";
    const label = String(m[2] || "").trim();
    if (!/rel=["'][^"']*nofollow/i.test(attrs)) continue;
    const hrefM = attrs.match(/href="([^"]+)"/i);
    const href = hrefM ? hrefM[1] : "";
    if (/blindmagic\.com/i.test(href)) continue;
    if (!/^https?:/i.test(href)) continue;
    if (label.length > 40) continue;
    const at = m.index ?? 0;
    if (researchIdx >= 0 && at > researchIdx) continue;
    samples.push({ pageUrl: p.pageUrl, href, label });
    if (samples.length >= 25) break;
  }
  if (samples.length >= 25) break;
}
console.log(JSON.stringify(samples, null, 2));
