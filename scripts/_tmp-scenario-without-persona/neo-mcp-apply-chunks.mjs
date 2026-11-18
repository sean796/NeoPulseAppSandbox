/**
 * Apply case-study find/replace chunks via Neo MCP HTTP JSON-RPC.
 * Usage: node neo-mcp-apply-chunks.mjs <mcpUrl> <basicAuthB64> <chunkGlobPrefix>
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const mcpUrl = process.argv[2];
const basic = process.argv[3];
const prefix = process.argv[4] || "bs-chunk-";
if (!mcpUrl || !basic) {
  console.error("usage: node neo-mcp-apply-chunks.mjs <mcpUrl> <basicAuthB64> [prefix]");
  process.exit(1);
}

let reqId = 1;
async function mcp(tool, args) {
  const body = {
    jsonrpc: "2.0",
    id: reqId++,
    method: "tools/call",
    params: { name: tool, arguments: args },
  };
  const res = await fetch(mcpUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  // SSE or JSON
  let parsed;
  if (text.startsWith("event:") || text.includes("data:")) {
    const dataLines = text
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .filter(Boolean);
    parsed = JSON.parse(dataLines[dataLines.length - 1] || "{}");
  } else {
    parsed = JSON.parse(text);
  }
  if (parsed.error) throw new Error(JSON.stringify(parsed.error));
  const content = parsed.result?.content;
  if (Array.isArray(content)) {
    const t = content.find((c) => c.type === "text")?.text;
    if (t) {
      try {
        return JSON.parse(t);
      } catch {
        return t;
      }
    }
  }
  return parsed.result ?? parsed;
}

const files = readdirSync(HERE)
  .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
  .sort((a, b) => {
    const na = Number(a.replace(prefix, "").replace(".json", ""));
    const nb = Number(b.replace(prefix, "").replace(".json", ""));
    return na - nb;
  });

const summary = [];
for (const file of files) {
  const json = readFileSync(join(HERE, file), "utf8");
  const remote = `wp-content/uploads/neo-tmp-${file}`;
  console.log("upload", file, json.length);
  await mcp("neo-mcp_files", {
    operation: "write",
    arguments: { path: remote, content: json },
  });
  const applied = await mcp("neo-mcp_php", {
    operation: "run",
    arguments: {
      note: `Apply case-study chunk ${file}`,
      code: `$jobs = json_decode(file_get_contents(WP_CONTENT_DIR . '/uploads/neo-tmp-${file}'), true);
$out = [];
foreach ($jobs as $job) {
  $id = (int)$job['id'];
  $find = base64_decode($job['find_b64']);
  $replace = base64_decode($job['replace_b64']);
  $p = get_post($id);
  if (!$p) { $out[] = ['id'=>$id,'ok'=>false,'err'=>'missing']; continue; }
  $c = $p->post_content;
  if (strpos($c, $find) === false) { $out[] = ['id'=>$id,'ok'=>false,'err'=>'find-missing']; continue; }
  $next = str_replace($find, $replace, $c, $count);
  if ($count !== 1) { $out[] = ['id'=>$id,'ok'=>false,'err'=>'count='.$count]; continue; }
  $r = wp_update_post(['ID'=>$id,'post_content'=>$next], true);
  if (is_wp_error($r)) { $out[] = ['id'=>$id,'ok'=>false,'err'=>$r->get_error_message()]; continue; }
  $out[] = ['id'=>$id,'ok'=>true];
}
@unlink(WP_CONTENT_DIR . '/uploads/neo-tmp-${file}');
return $out;`,
    },
  });
  console.log("applied", file, JSON.stringify(applied));
  summary.push({ file, applied });
}

console.log(JSON.stringify({ files: files.length, summary }, null, 2));
