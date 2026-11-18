import { readFileSync } from "node:fs";

const updates = JSON.parse(readFileSync("scripts/_tmp-bm-fact/updates.json", "utf8")).updates;
let claimAnchors = 0;
let shortOutsideResearch = 0;
let shortInResearch = 0;
let researchPosts = 0;
for (const p of updates) {
  const h = p.content || "";
  const researchIdx = h.search(/id=["']research-and-fact-checking["']/i);
  if (researchIdx >= 0) researchPosts += 1;
  for (const m of h.matchAll(
    /<a href="https?:\/\/(?!blindmagic\.com)[^"]+" rel="nofollow" target="_blank">([^<]*)<\/a>/gi,
  )) {
    const label = String(m[1] || "").trim();
    const at = m.index ?? 0;
    const inResearch = researchIdx >= 0 && at > researchIdx;
    if (label.length > 40) claimAnchors += 1;
    else if (inResearch) shortInResearch += 1;
    else shortOutsideResearch += 1;
  }
}
console.log(
  JSON.stringify({ posts: updates.length, claimAnchors, shortOutsideResearch, shortInResearch, researchPosts }, null, 2),
);
