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
const takedown = JSON.parse(readFileSync(join(dir, "state/takedown.json"), "utf8"));
const ids = takedown.rows.map((row) => row.id);
const b64 = Buffer.from(JSON.stringify(ids), "utf8").toString("base64");
const code = `$ids = json_decode(base64_decode('${b64}'), true);
$bad = array();
foreach ($ids as $id) {
  $status = get_post_status((int) $id);
  if ($status !== 'draft' && $status !== 'trash') $bad[] = array('id' => (int) $id, 'status' => $status);
}
$needles = array('Professional Blind Repair', 'we offer repair', 'repair services', 'our repair');
$hits = array();
$posts = get_posts(array(
  'post_type' => array('post', 'service-area'),
  'post_status' => 'publish',
  'posts_per_page' => -1,
  'fields' => 'ids',
  'suppress_filters' => true,
));
foreach ($posts as $id) {
  $blob = get_post_field('post_content', $id) . "\\n" . get_post_meta($id, 'faq', true) . "\\n" . get_post_meta($id, 'seo_faq', true) . "\\n" . get_post_meta($id, 'neo_pulse_seo_description', true);
  foreach ($needles as $needle) {
    $at = stripos($blob, $needle);
    if ($at !== false) {
      $hits[] = array(
        'id' => (int) $id,
        'needle' => $needle,
        'slug' => get_post_field('post_name', $id),
        'snippet' => trim(preg_replace('/\s+/', ' ', substr($blob, max(0, $at - 80), 220))),
      );
    }
  }
}
return array(
  'takedown_not_offline' => $bad,
  'published' => count($posts),
  'hits' => $hits,
  'redirects' => count((array) get_option('intheshade_audit_redirects')),
  'post_4850' => get_post_status(4850),
);`;

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
const text = (data.result?.content || []).map((part) => part.text || "").join("\n");
console.log(text.slice(0, 8000));
