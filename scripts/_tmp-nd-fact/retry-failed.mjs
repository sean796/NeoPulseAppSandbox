import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const DIR = "b:/Neo Pulse/scripts/_tmp-nd-fact";
const report = JSON.parse(readFileSync(`${DIR}/apply-report.json`, "utf8"));
const list = report.results || [];
const failIds = new Set(list.filter((x) => !x.ok).map((x) => x.id));
const updates = JSON.parse(readFileSync(`${DIR}/updates.json`, "utf8")).updates;
const retry = updates.filter((u) => failIds.has(u.id));
writeFileSync(`${DIR}/updates.json`, JSON.stringify({ updates: retry }, null, 2));
console.log(JSON.stringify({ retrying: retry.length }, null, 2));
const r = spawnSync(process.execPath, ["scripts/neo-digital-fact-check/apply-updates-via-rest.mjs"], {
  cwd: "b:/Neo Pulse",
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  env: { ...process.env, ND_APPLY_LIMIT: "0" },
});
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status || 0);
