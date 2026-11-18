import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(
  readFileSync(join(dir, "../../src/components/integrations/default-properties-seed.json"), "utf8"),
);
const site = seed.sites.find((row) => String(row.siteUrl).includes("intheshadeflorida.com"));
const auth = `Basic ${Buffer.from(`${site.username}:${site.appPassword}`, "utf8").toString("base64")}`;
const code = `$methods = get_class_methods('NitroPack\\\\WordPress\\\\NitroPack');
$keep = array();
foreach ((array) $methods as $method) {
  if (stripos($method, 'purge') !== false || stripos($method, 'cache') !== false) $keep[] = $method;
}
return $keep;`;
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
