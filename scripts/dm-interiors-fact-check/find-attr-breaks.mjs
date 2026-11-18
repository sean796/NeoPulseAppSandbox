import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const updates = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../_tmp-dm-fact/updates.json"), "utf8"),
);
for (const p of updates.updates) {
  // title="... <a href=
  if (/title="[^"]*<a\s/i.test(p.content)) {
    console.log("title-break", p.id, p.pageUrl);
  }
  // alt="... <a
  if (/alt="[^"]*<a\s/i.test(p.content)) {
    console.log("alt-break", p.id, p.pageUrl);
  }
}
