import { readFileSync } from "node:fs";
const t = readFileSync("b:/Neo Pulse/scripts/_tmp-nd-fact/fact-checker.csv", "utf8");
const lines = t.split(/\r?\n/).filter(Boolean);
console.log("rows", lines.length - 1);
console.log("header", lines[0].slice(0, 220));
const hosts = {};
for (const line of lines.slice(1)) {
  const m = line.match(/https?:\/\/([^/,"]+)/);
  if (m) hosts[m[1]] = (hosts[m[1]] || 0) + 1;
}
console.log(JSON.stringify(hosts, null, 2));
console.log("sample url lines:");
for (const line of lines.slice(1, 4)) console.log(line.slice(0, 200));
