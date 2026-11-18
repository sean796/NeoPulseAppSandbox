import { readFileSync } from "node:fs";
const r = JSON.parse(readFileSync("b:/Neo Pulse/scripts/_tmp-nd-fact/apply-report.json", "utf8"));
const rows = r.results || r.updates || r;
const list = Array.isArray(rows) ? rows : rows.results || [];
const ok = list.filter((x) => x.ok).length;
const fail = list.filter((x) => !x.ok);
console.log(JSON.stringify({ total: list.length, ok, fail: fail.length, failIds: fail.map((x) => x.id) }, null, 2));
