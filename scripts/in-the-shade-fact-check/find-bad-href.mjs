import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const updates = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../_tmp-itsf-fact/updates.json"), "utf8"),
);
let count = 0;
for (const p of updates.updates) {
  for (const m of p.content.matchAll(/<a\b[^>]*>/gi)) {
    const tag = m[0];
    const href = (tag.match(/href="([^"]+)"/i) || [])[1] || "";
    if (/intheshadeflorida\.com/i.test(href) && /nofollow/i.test(tag)) {
      count += 1;
      console.log(p.pageUrl, href, tag.slice(0, 220));
    }
  }
}
console.log("count", count);
