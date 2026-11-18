import https from "node:https";
import fs from "node:fs";

function req(url, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body == null ? null : Buffer.from(body);
    const r = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers: {
          "User-Agent": "NeoPulse",
          Accept: "application/json",
          ...headers,
          ...(payload
            ? { "Content-Length": String(payload.length), "Content-Type": "application/json" }
            : {}),
        },
        timeout: 50000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    r.on("error", reject);
    r.on("timeout", () => r.destroy(new Error("timeout")));
    if (payload) r.write(payload);
    r.end();
  });
}

const seed = JSON.parse(
  fs.readFileSync("src/components/integrations/default-properties-seed.json", "utf8"),
);
const site = seed.sites.find((row) => String(row.siteUrl).includes("nightanddaydecor.com"));
const auth =
  "Basic " +
  Buffer.from(`${site.username}:${String(site.appPassword).replace(/\s+/g, "")}`).toString("base64");

async function wp(command) {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "neo-mcp_wp", arguments: { operation: "run", arguments: { command } } },
  });
  const res = await req("https://nightanddaydecor.com/wp-json/neo-mcp/v1/mcp", {
    method: "POST",
    headers: { Authorization: auth },
    body,
  });
  const parsed = JSON.parse(res.text);
  return JSON.parse(parsed?.result?.content?.[0]?.text || "{}");
}

const php = `
global $wpdb;
$types = $wpdb->get_col("SELECT DISTINCT post_type FROM {$wpdb->posts}");
echo 'post_types=' . implode(',', $types) . PHP_EOL;
$taxes = get_taxonomies(array(), 'objects');
foreach ($taxes as $tax) {
  if (preg_match('/service|area|location/i', $tax->name . ' ' . $tax->label)) {
    echo 'tax|' . $tax->name . '|' . $tax->label . PHP_EOL;
  }
}
`.trim();

const b64 = Buffer.from(php).toString("base64");
const out = await wp(`eval "eval(base64_decode('${b64}'));"`);
console.log("exit", out.exit);
console.log(out.stdout);
console.log(out.stderr || "");
