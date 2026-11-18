import { readFileSync } from "fs";

const slug = process.argv[2];
const pages = JSON.parse(readFileSync(new URL("./pages.json", import.meta.url), "utf8"));
const page = pages.find((row) => row.url.includes(slug));
if (!page) {
  console.log("missing");
  process.exit(1);
}
for (const issue of page.issues) {
  console.log(`--- ${issue.sev}`);
  console.log(issue.fix);
  console.log(issue.before.slice(0, 280));
  console.log("");
}
