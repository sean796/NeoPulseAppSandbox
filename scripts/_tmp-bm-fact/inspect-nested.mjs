import { readFileSync } from "node:fs";
const live = JSON.parse(readFileSync("scripts/_tmp-bm-fact/live-contents.json", "utf8"));
const p = (live.posts || []).find((x) => /blind-parts/i.test(x.pageUrl));
const h = String(p.content);
const i = h.indexOf("EverWood");
console.log(h.slice(i, i + 1200));
