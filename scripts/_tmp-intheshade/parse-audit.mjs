import fs from "fs";

const md = fs.readFileSync(new URL("./audit.md", import.meta.url), "utf8");
const parts = md.split("\n### ").slice(1);
const pages = [];

for (const part of parts) {
  const lines = part.split("\n");
  const title = lines[0].replace(/^\*\*/, "").replace(/\*\*$/, "").trim();
  const body = lines.slice(1).join("\n");
  const urlMatch = body.match(/https?:\\?\/\\?\/intheshadeflorida\.com[^)\s]*/);
  let url = urlMatch ? urlMatch[0].replace(/\\/g, "") : "";
  if (url.endsWith("/")) url = url.slice(0, -1);
  const meta = lines.find((line) => /Service-area page|Blog post/.test(line)) || "";
  const status = /scheduled/.test(meta)
    ? "future"
    : /draft/.test(meta)
      ? "draft"
      : /published/.test(meta)
        ? "publish"
        : "unknown";
  const kind = /Blog post/.test(meta) ? "post" : /Service-area/.test(meta) ? "service-area" : "other";
  const issues = [];
  for (const chunk of body.split("\n> * **").slice(1)) {
    const sev = (chunk.match(/^(High|Medium|Low)\./) || [])[1] || "";
    const [beforeRaw, fixRaw = ""] = chunk.split("*Fix:*");
    issues.push({
      sev,
      fix: fixRaw.replace(/\s+/g, " ").trim(),
      before: beforeRaw.replace(/\s+/g, " ").trim(),
    });
  }
  pages.push({ title, url, status, kind, issues });
}

fs.writeFileSync(new URL("./pages.json", import.meta.url), JSON.stringify(pages, null, 2));

const issues = pages.flatMap((page) => page.issues);
const tally = (items, keyFn) =>
  items.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

console.log(
  JSON.stringify(
    {
      pages: pages.length,
      issues: issues.length,
      missingUrl: pages.filter((page) => !page.url).length,
      emptyIssues: pages.filter((page) => page.issues.length === 0).map((page) => page.title),
      byKind: tally(pages, (page) => page.kind),
      byStatus: tally(pages, (page) => page.status),
      bySev: tally(issues, (issue) => issue.sev || "none"),
      unpublish: pages.filter((page) => page.issues.some((issue) => /unpublish/i.test(issue.fix))).length,
      confirm: pages.filter((page) => page.issues.some((issue) => /confirm with (the )?client/i.test(issue.fix))).length,
    },
    null,
    2,
  ),
);
