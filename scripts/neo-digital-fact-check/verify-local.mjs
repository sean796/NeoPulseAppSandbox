import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "../_tmp-nd-fact");
const resolved = JSON.parse(readFileSync(join(DIR, "posts-resolved.json"), "utf8"));
const updates = JSON.parse(readFileSync(join(DIR, "updates.json"), "utf8"));
const apply = JSON.parse(readFileSync(join(DIR, "apply-report.json"), "utf8"));
const build = JSON.parse(readFileSync(join(DIR, "build-report.json"), "utf8"));

let colI = 0;
let colIInHtml = 0;
let searchInHtml = 0;
let search = 0;
let badBlind = 0;

for (const post of resolved.posts) {
  const u = updates.updates.find((x) => x.pageUrl === post.pageUrl);
  if (!u) continue;
  for (const c of post.claims) {
    if (!c.resolvedUrl) continue;
    if (c.mode === "use-column-i" || c.sourceOrigin === "column-i") {
      colI += 1;
      if (u.content.includes(c.resolvedUrl)) colIInHtml += 1;
    }
    if (c.mode === "resolved-search" || c.sourceOrigin === "search" || c.sourceOrigin === "search-cache") {
      search += 1;
      if (u.content.includes(c.resolvedUrl)) searchInHtml += 1;
    }
  }
  for (const m of u.content.matchAll(/href="(https?:[^"]+)"[^>]*rel="nofollow/g)) {
    if (/neodigital.ca/i.test(m[1])) badBlind += 1;
  }
}

const replaced = build.reports.reduce((n, p) => n + (p.replaced || 0), 0);
const linked = build.reports.reduce((n, p) => n + (p.linked || 0), 0);
const missed = build.reports.reduce((n, p) => n + ((p.missed || []).length), 0);

console.log(
  JSON.stringify(
    {
      applyOk: apply.ok,
      applyFail: apply.fail,
      build: { replaced, linked, missed },
      columnI: { total: colI, presentInBuiltHtml: colIInHtml },
      search: { total: search, presentInBuiltHtml: searchInHtml },
      internalNofollowHrefs: badBlind,
    },
    null,
    2,
  ),
);
