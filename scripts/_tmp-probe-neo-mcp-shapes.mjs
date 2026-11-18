const auth =
  "Basic " + Buffer.from("sean@neodigital.ca:THeA pJLz 356t KDvQ 1Nel 2Dvr").toString("base64");
const url = "https://www.customshadesoflondon.ca/wp-json/neo-mcp/v1/mcp";
let id = 0;
async function rpc(method, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  });
  const text = await res.text();
  if (text.includes("data:")) {
    for (const l of text.split(/\r?\n/).filter((x) => x.startsWith("data:"))) {
      try {
        const j = JSON.parse(l.slice(5).trim());
        if (j.result || j.error) return j;
      } catch {
        /* ignore */
      }
    }
  }
  return JSON.parse(text);
}
await rpc("initialize", {
  protocolVersion: "2025-03-26",
  capabilities: {},
  clientInfo: { name: "t", version: "1" },
});
await fetch(url, {
  method: "POST",
  headers: { Authorization: auth, "Content-Type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
});
const r = await rpc("tools/call", {
  name: "neo-mcp_php",
  arguments: { operation: "run", arguments: { code: 'return array("ok"=>true,"n"=>1);' } },
});
console.log("PHP", JSON.stringify(r, null, 2).slice(0, 1500));
const w = await rpc("tools/call", {
  name: "neo-mcp_wp",
  arguments: {
    operation: "run",
    arguments: {
      command: "post list --post_type=post --post_status=publish --posts_per_page=1 --format=count",
    },
  },
});
console.log("WP", JSON.stringify(w, null, 2).slice(0, 1500));
