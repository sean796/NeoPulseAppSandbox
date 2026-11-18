import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(
  readFileSync(join(dir, "../../src/components/integrations/default-properties-seed.json"), "utf8"),
);
const site = seed.sites.find((row) => String(row.siteUrl).includes("intheshadeflorida.com"));
const auth = `Basic ${Buffer.from(`${site.username}:${site.appPassword}`, "utf8").toString("base64")}`;
const code = `$out = array('wpe' => class_exists('WpeCommon'));
if (class_exists('WpeCommon')) {
  if (method_exists('WpeCommon', 'purge_memcached')) { WpeCommon::purge_memcached(); $out['memcached'] = true; }
  if (method_exists('WpeCommon', 'purge_varnish_cache')) { WpeCommon::purge_varnish_cache(); $out['varnish'] = true; }
}
foreach (array('nitropack_sdk_purge_cache', 'nitropack_purge_cache', 'nitropack_clean_cache') as $fn) {
  $out[$fn] = function_exists($fn);
  if (function_exists($fn)) $fn();
}
if (class_exists('NitroPack\\\\WordPress\\\\NitroPack')) $out['nitro_class'] = true;
if (function_exists('wp_cache_flush')) { wp_cache_flush(); $out['wp_cache'] = true; }
if (class_exists('Neo_Pulse_Wp_Cache_Flush')) {
  Neo_Pulse_Wp_Cache_Flush::purge_html_caches();
  $out['neo_pulse'] = true;
}
return $out;`;

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
console.log((data.result?.content || []).map((part) => part.text || "").join("\n"));
