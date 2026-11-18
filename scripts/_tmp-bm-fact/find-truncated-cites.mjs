import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SEED = join(ROOT, "src/components/integrations/default-properties-seed.json");
const LIVE = join(ROOT, "scripts/_tmp-bm-fact/live-contents.json");
const POSTS = join(ROOT, "scripts/_tmp-bm-fact/posts.json");

function isTruncatedLabel(label) {
  const t = String(label || "").trim();
  if (!t) return false;
  if (/[…⋯]|\.{2,}$/.test(t)) return true;
  // Short host-only leftovers are also unnatural mid-sentence citations
  if (/^[a-z0-9.-]+\.(com|ca|org|net|gov)$/i.test(t)) return true;
  return false;
}

function findBadAnchors(html, pageUrl) {
  const researchIdx = html.search(/id=["']research-and-fact-checking["']/i);
  const body = researchIdx >= 0 ? html.slice(0, researchIdx) : html;
  const bad = [];
  for (const m of body.matchAll(/<a\b([^>]*)>([^<]*)<\/a>/gi)) {
    const attrs = m[1] || "";
    const label = String(m[2] || "").trim();
    const hrefM = attrs.match(/href="([^"]+)"/i);
    const href = hrefM ? hrefM[1] : "";
    if (!/^https?:/i.test(href)) continue;
    if (/blindmagic\.com/i.test(href)) continue;
    if (!/rel=["'][^"']*nofollow/i.test(attrs)) continue;
    if (!isTruncatedLabel(label) && label.split(/\s+/).length >= 8) continue;
    // Keep product-name links that look intentional and complete
    if (!isTruncatedLabel(label) && !/^[a-z0-9.-]+\.(com|ca|org|net|gov)$/i.test(label)) {
      // mid-sentence truncated titles are the main bug; also catch ellipsis
      continue;
    }
    bad.push({
      pageUrl,
      href,
      label,
      around: body.slice(Math.max(0, (m.index || 0) - 80), (m.index || 0) + m[0].length + 80),
    });
  }
  return bad;
}

const live = JSON.parse(readFileSync(LIVE, "utf8"));
const all = [];
for (const p of live.posts || []) {
  if (!p.content || !p.id) continue;
  all.push(...findBadAnchors(String(p.content), p.pageUrl));
}
writeFileSync(join(ROOT, "scripts/_tmp-bm-fact/truncated-cites.json"), JSON.stringify(all, null, 2));
console.log(JSON.stringify({ count: all.length, sample: all.slice(0, 12) }, null, 2));
