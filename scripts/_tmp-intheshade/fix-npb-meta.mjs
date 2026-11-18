import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, "../..");
const seed = JSON.parse(readFileSync(join(root, "src/components/integrations/default-properties-seed.json"), "utf8"));
const site = seed.sites.find((row) => String(row.siteUrl).includes("intheshadeflorida.com"));
const auth = `Basic ${Buffer.from(`${site.username}:${site.appPassword}`, "utf8").toString("base64")}`;

const description =
  "Hunter Douglas Dealer North Palm Beach Heights FL. In The Shade serves this area from showrooms in Stuart and Port St. Lucie. Schedule a showroom visit.";
if (description.length < 150 || description.length > 160) {
  throw new Error(`description length ${description.length}`);
}

const code = `$id = 4361;
$keyword = (string) get_post_meta($id, 'neo_pulse_seo_focus_keyword', true);
$desc = '${description.replace(/'/g, "\\'")}';
foreach (array('neo_pulse_seo_description', 'meta_description', 'seo_meta_description', 'rank_math_description') as $key) {
  update_post_meta($id, $key, $desc);
}
if (function_exists('update_field')) {
  update_field('meta_description', $desc, $id);
  update_field('seo_meta_description', $desc, $id);
}
clean_post_cache($id);
return array('keyword' => $keyword, 'description' => $desc, 'length' => strlen($desc));`;

const res = await fetch("https://intheshadeflorida.com/wp-json/neo-mcp/v1/mcp", {
  method: "POST",
  headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "neo-mcp_php", arguments: { operation: "run", arguments: { code } } },
  }),
});
const data = await res.json();
console.log((data.result?.content || []).map((part) => part.text || "").join("\n").slice(0, 2000));
