/**
 * Apply natural ≤5-word woven claim links on Elementor vs Divi (post 8500).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SEED = join(ROOT, "src/components/integrations/default-properties-seed.json");

function loadSite() {
  const seed = JSON.parse(readFileSync(SEED, "utf8"));
  const site = (seed.sites || []).find((s) => String(s.siteUrl || "").includes("neodigital.ca"));
  if (!site?.username || !site?.appPassword) throw new Error("Neo Digital seed credentials missing");
  return site;
}

function authHeader(site) {
  return `Basic ${Buffer.from(`${site.username}:${site.appPassword.replace(/\s+/g, "")}`).toString("base64")}`;
}

function wordCount(s) {
  return String(s || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function naturalize(html) {
  let c = String(html || "");
  const pairs = [
    [
      /<a href="https:\/\/howtowp\.com\/divi-vs-elementor\/"[^>]*>Elementor provides a free<\/a> version with limited features and several annual subscription plans for its Pro version\./,
      'Elementor provides a <a href="https://howtowp.com/divi-vs-elementor/" rel="nofollow noopener noreferrer" target="_blank">free version</a> with limited features and several annual subscription plans for its Pro version.',
    ],
    [
      /<a href="https:\/\/howtowp\.com\/divi-vs-elementor\/"[^>]*>Divi<\/a>, from Elegant Themes, offers no free version but provides annual membership or lifetime access options\./,
      'Divi, from Elegant Themes, offers no free version but provides <a href="https://howtowp.com/divi-vs-elementor/" rel="nofollow noopener noreferrer" target="_blank">annual membership</a> or lifetime access options.',
    ],
    [
      /<a href="https:\/\/howtowp\.com\/divi-vs-elementor\/"[^>]*>Elementor is a plugin<\/a> compatible with any WordPress theme/,
      '<a href="https://howtowp.com/divi-vs-elementor/" rel="nofollow noopener noreferrer" target="_blank">Elementor</a> is a plugin compatible with any WordPress theme',
    ],
    [
      /<a href="https:\/\/kinsta\.com\/blog\/divi-vs-elementor\/"[^>]*>Elementor provides a visual<\/a> drag-and-drop experience/,
      'Elementor provides a <a href="https://kinsta.com/blog/divi-vs-elementor/" rel="nofollow noopener noreferrer" target="_blank">visual drag-and-drop</a> experience',
    ],
    [
      /<a href="https:\/\/kinsta\.com\/blog\/divi-vs-elementor\/"[^>]*>Divi offers an integrated<\/a> solution/,
      'Divi offers an <a href="https://kinsta.com/blog/divi-vs-elementor/" rel="nofollow noopener noreferrer" target="_blank">integrated solution</a>',
    ],
    [
      /<a href="https:\/\/howtowp\.com\/divi-vs-elementor\/"[^>]*>Elementor allows granular control<\/a> over elements/,
      'Elementor allows <a href="https://howtowp.com/divi-vs-elementor/" rel="nofollow noopener noreferrer" target="_blank">granular control</a> over elements',
    ],
    [
      /<a href="https:\/\/cleverops\.com\.au\/web-design\/elementor-vs-divi"[^>]*>Divi offers hundreds of<\/a> pre-made layouts/,
      'Divi offers <a href="https://cleverops.com.au/web-design/elementor-vs-divi" rel="nofollow noopener noreferrer" target="_blank">hundreds of layouts</a> in packs',
    ],
    // Full sentence leftovers (pre-shorten cache / older builds)
    [
      /<a href="https:\/\/howtowp\.com\/divi-vs-elementor\/"[^>]*>Elementor provides a free version with limited features and several annual subscription plans for its Pro version\.<\/a>/,
      'Elementor provides a <a href="https://howtowp.com/divi-vs-elementor/" rel="nofollow noopener noreferrer" target="_blank">free version</a> with limited features and several annual subscription plans for its Pro version.',
    ],
    [
      /<a href="https:\/\/howtowp\.com\/divi-vs-elementor\/"[^>]*>Divi, from Elegant Themes, offers no free version but provides annual membership or lifetime access options\.<\/a>/,
      'Divi, from Elegant Themes, offers no free version but provides <a href="https://howtowp.com/divi-vs-elementor/" rel="nofollow noopener noreferrer" target="_blank">annual membership</a> or lifetime access options.',
    ],
  ];

  let replaced = 0;
  for (const [from, to] of pairs) {
    if (from.test(c)) {
      c = c.replace(from, to);
      replaced += 1;
    }
  }
  return { html: c, replaced };
}

function longExternalNofollow(html) {
  const bad = [];
  const re = /<a\b([^>]*)>([^<]+)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1] || "";
    const label = String(m[2] || "").trim();
    const href = (attrs.match(/href=["']([^"']+)/i) || [])[1] || "";
    if (!/^https?:/i.test(href) || /neodigital\.ca/i.test(href)) continue;
    if (!/nofollow/i.test(attrs)) continue;
    const wc = wordCount(label);
    if (wc > 5) bad.push({ words: wc, label });
  }
  return bad;
}

async function main() {
  const site = loadSite();
  const auth = authHeader(site);
  const get = await fetch(`${site.siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/posts/8500?context=edit`, {
    headers: { Authorization: auth },
  });
  if (!get.ok) throw new Error(`GET ${get.status} ${await get.text()}`);
  const post = await get.json();
  const raw = String(post.content?.raw || post.content?.rendered || "");
  const { html, replaced } = naturalize(raw);
  const longBefore = longExternalNofollow(raw);
  const longAfter = longExternalNofollow(html);

  writeFileSync(join(ROOT, "scripts/_tmp-nd-fact/elementor-vs-divi-fixed.html"), html);

  if (html === raw && replaced === 0) {
    console.log(JSON.stringify({ ok: true, skipped: true, replaced, longBefore, longAfter }, null, 2));
    return;
  }

  const put = await fetch(`${site.siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/posts/8500`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ content: html }),
  });
  const text = await put.text();
  if (!put.ok) throw new Error(`POST ${put.status} ${text.slice(0, 300)}`);
  console.log(JSON.stringify({ ok: true, replaced, longBefore, longAfter, status: put.status }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
