import { readFileSync, writeFileSync } from "node:fs";

const live = JSON.parse(readFileSync("scripts/_tmp-bm-fact/live-contents.json", "utf8"));
const hits = [];

function isBrandedAnchor(label) {
  const t = String(label || "");
  if (/[|–—]/.test(t)) return true;
  if (/\s[-–—]\s/.test(t) && /(blinds|shades|shop|dealer|premier|louver|gallery|solutions)/i.test(t)) {
    return true;
  }
  if (/\|\s*[A-Z]/.test(t)) return true;
  return false;
}

for (const p of live.posts || []) {
  const h = String(p.content || "");
  const researchIdx = h.search(/id=["']research-and-fact-checking["']/i);
  const body = researchIdx >= 0 ? h.slice(0, researchIdx) : h;
  const samples = [];
  for (const m of body.matchAll(/<a\b([^>]*)>([^<]+)<\/a>/gi)) {
    const attrs = m[1] || "";
    const label = String(m[2] || "").trim();
    if (!/rel=["'][^"']*nofollow/i.test(attrs)) continue;
    const hrefM = attrs.match(/href="([^"]+)"/i);
    const href = hrefM ? hrefM[1] : "";
    if (/blindmagic\.com/i.test(href)) continue;
    if (!isBrandedAnchor(label) && !/Louver Shop|Boise Premier|Blindsgalore|Bloomin/i.test(label)) continue;
    samples.push({ href, label: label.slice(0, 180) });
  }
  if (samples.length) hits.push({ pageUrl: p.pageUrl, id: p.id, type: p.type || "post", count: samples.length, samples: samples.slice(0, 5) });
}

writeFileSync("scripts/_tmp-bm-fact/branded-anchors.json", JSON.stringify(hits, null, 2));
console.log(JSON.stringify({ posts: hits.length, totalSamples: hits.reduce((n, h) => n + h.count, 0), sample: hits.slice(0, 8) }, null, 2));
