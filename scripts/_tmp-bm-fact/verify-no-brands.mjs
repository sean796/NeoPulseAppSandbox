import { readFileSync } from "node:fs";

const updates = JSON.parse(readFileSync("scripts/_tmp-bm-fact/updates-reweave.json", "utf8"));
const bad = [];
const em = [];
for (const p of updates.updates || []) {
  const { body, research } = (() => {
    const h = String(p.content || "");
    const idx = h.search(/id=["']research-and-fact-checking["']/i);
    if (idx < 0) return { body: h, research: "" };
    const open = h.lastIndexOf("<", idx);
    return { body: h.slice(0, open >= 0 ? open : idx), research: h.slice(open >= 0 ? open : idx) };
  })();
  for (const [section, html] of [
    ["body", body],
    ["research", research],
  ]) {
    for (const m of html.matchAll(/<a\b([^>]*)>([^<]*)<\/a>/gi)) {
      if (!/nofollow/i.test(m[1])) continue;
      const hrefM = m[1].match(/href="([^"]+)"/i);
      const href = hrefM ? hrefM[1] : "";
      if (/blindmagic\.com/i.test(href)) continue;
      const label = m[2];
      if (/\u2014/.test(label)) em.push({ url: p.pageUrl, section, label: label.slice(0, 120) });
      if (/\s\|\s/.test(label) || /\s[\u2013\u2014]\s/.test(label)) {
        bad.push({ url: p.pageUrl, section, label: label.slice(0, 140) });
      }
      if (
        /\s-\s+(?:Hunter Douglas|Louver Shop|Boise Premier|Bloomin|Blindsgalore|Graywind|Weffort|Eisenkolb)\b/i.test(
          label,
        )
      ) {
        bad.push({ url: p.pageUrl, section, kind: "dash-brand", label: label.slice(0, 140) });
      }
    }
  }
}
console.log(JSON.stringify({ badCount: bad.length, emCount: em.length, bad: bad.slice(0, 15), em: em.slice(0, 5) }, null, 2));
