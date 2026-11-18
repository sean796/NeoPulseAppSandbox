import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const out = "b:/Neo Pulse/scripts/_tmp-nd-fact/elementor-vs-divi-live.html";
const url = `https://neodigital.ca/blog/elementor-vs-divi/?nocache=${Date.now()}`;
execSync(`curl.exe -sL "${url}" -o "${out}"`, { stdio: "inherit" });
const h = readFileSync(out, "utf8");
const i = h.indexOf("pricing-and-licensing");
console.log(i < 0 ? "NO PRICING SECTION" : h.slice(i, i + 1400));
const re = /<a\b([^>]*)>([^<]+)<\/a>/gi;
let m;
const bad = [];
const pricingLinks = [];
while ((m = re.exec(h))) {
  const a = m[1] || "";
  const t = String(m[2] || "").trim();
  const href = (a.match(/href=["']([^"']+)/) || [])[1] || "";
  if (!/howtowp|kinsta|cleverops/i.test(href)) continue;
  const wc = t.split(/\s+/).filter(Boolean).length;
  if (wc > 5) bad.push({ wc, t, href });
  if (m.index >= i && m.index < i + 2000) pricingLinks.push({ t, href, wc });
}
console.log("PRICING_LINKS", JSON.stringify(pricingLinks, null, 2));
console.log("LONG_EXTERNAL", JSON.stringify(bad, null, 2));
writeFileSync(
  "b:/Neo Pulse/scripts/_tmp-nd-fact/elementor-vs-divi-live-audit.json",
  JSON.stringify({ pricingLinks, bad, hasSentenceSpan: /Elementor provides a free version with limited features/i.test(h) }, null, 2),
);
