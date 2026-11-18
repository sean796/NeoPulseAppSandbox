import { readFileSync } from "node:fs";

const u = JSON.parse(readFileSync("scripts/_tmp-bm-fact/updates-reweave.json", "utf8"));
const live = JSON.parse(readFileSync("scripts/_tmp-bm-fact/live-contents.json", "utf8"));
const before = live.posts.find((x) => /solarium-blinds/i.test(x.pageUrl)).content;
const after = u.updates.find((x) => /solarium-blinds/i.test(x.pageUrl)).content;

function loc(h, needle) {
  const r = h.search(/id=["']research-and-fact-checking["']/i);
  const i = h.indexOf(needle);
  return { i, r, section: i < 0 ? "missing" : r >= 0 && i > r ? "research" : "body" };
}

console.log("before", loc(before, "Elite Patio"));
console.log("after", loc(after, "Elite Patio"));
console.log("before label", (before.match(/Elite Patio[^<]+/) || [])[0]);
console.log("after label", (after.match(/Elite Patio[^<]+/) || [])[0]);

// unit strip
function stripBrandSuffix(label) {
  let t = String(label || "").trim();
  t = t.replace(/\u2014/g, "-").replace(/\u2013/g, "-");
  t = t.replace(/\s*[|]\s*[^|]+$/u, "").trim();
  t = t.replace(/\s+-\s+[A-Z][A-Za-z0-9'’&®™]*(?:\s+[A-Z][A-Za-z0-9'’&®™]*){0,4}\s*$/u, "").trim();
  return t;
}
console.log("strip test", stripBrandSuffix("Elite Patio Roll Shades | Custom Outdoor Solutions"));
