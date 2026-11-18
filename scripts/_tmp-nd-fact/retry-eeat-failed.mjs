import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const DIR = "b:/Neo Pulse/scripts/_tmp-nd-fact";
const reportPath = `${DIR}/eeat-or-report.json`;
if (!existsSync(reportPath)) {
  console.log("no eeat report");
  process.exit(1);
}
const report = JSON.parse(readFileSync(reportPath, "utf8"));
const results = report.applyResults || report.results || report.applied || [];
const failed = (Array.isArray(results) ? results : []).filter((x) => x && x.ok === false);
const updatesPath = `${DIR}/updates-eeat-or.json`;
const all = JSON.parse(readFileSync(updatesPath, "utf8")).updates || [];
const failIds = new Set(failed.map((x) => x.id));
const retry = all.filter((u) => failIds.has(u.id));
if (!retry.length) {
  // fallback: parse sampleFail from stdout style report
  const alt = report.failedIds || [];
  console.log(JSON.stringify({ retrying: 0, note: "no failed apply rows in report", keys: Object.keys(report) }, null, 2));
  process.exit(0);
}
writeFileSync(updatesPath, JSON.stringify({ updates: retry }, null, 2));
console.log(JSON.stringify({ retrying: retry.length }, null, 2));
const r = spawnSync(process.execPath, ["scripts/neo-digital-fact-check/generate-eeat-openrouter.mjs", "--apply-only"], {
  cwd: "b:/Neo Pulse",
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status || 0);
