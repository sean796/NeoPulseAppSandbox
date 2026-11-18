import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

// Inline minimal: load updates and compare blind-parts
const live = JSON.parse(readFileSync("scripts/_tmp-bm-fact/live-contents.json", "utf8"));
const updates = JSON.parse(readFileSync("scripts/_tmp-bm-fact/updates-reweave.json", "utf8"));
const before = (live.posts || []).find((p) => /blind-parts/i.test(p.pageUrl));
const after = (updates.updates || []).find((p) => /blind-parts/i.test(p.pageUrl));
if (!before) {
  console.log("no before");
  process.exit(1);
}
const want = /Louver|Boise|EverWood|Precious Metals|humidity|aluminum/i;
function snips(html, label) {
  const out = [];
  for (const m of String(html).matchAll(/<p[\s\S]*?<\/p>/gi)) {
    if (want.test(m[0])) out.push(m[0].replace(/\s+/g, " ").slice(0, 500));
  }
  console.log("\n===", label, "p count", out.length, "===");
  for (const s of out.slice(0, 4)) console.log(s, "\n");
}
snips(before.content, "BEFORE");
if (after) snips(after.content, "AFTER");
else console.log("no after update");

// Count remaining branded
function branded(html) {
  const samples = [];
  for (const m of String(html).matchAll(/<a\b([^>]*)>([^<]+)<\/a>/gi)) {
    if (!/nofollow/i.test(m[1])) continue;
    const label = m[2];
    if (/[|]|Louver Shop|Boise Premier|Bloomin|\u2014|\u2013/.test(label) || /\s-\s+[A-Z]/.test(label)) {
      samples.push(label.slice(0, 120));
    }
  }
  return samples;
}
console.log("before branded", branded(before.content));
console.log("after branded", after ? branded(after.content) : []);
