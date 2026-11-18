import { readFileSync } from "fs";

const html = readFileSync(new URL("./state/repair.html", import.meta.url), "utf8");
let from = 0;
const needle = "repair service";
while (from < html.length) {
  const at = html.toLowerCase().indexOf(needle, from);
  if (at < 0) break;
  console.log("---");
  console.log(html.slice(Math.max(0, at - 200), at + 220).replace(/\s+/g, " "));
  from = at + needle.length;
}
