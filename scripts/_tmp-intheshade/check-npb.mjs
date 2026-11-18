import { readFileSync } from "fs";

const html = readFileSync(new URL("./state/npb.html", import.meta.url), "utf8");
const needle = "for expert guidance";
const at = html.toLowerCase().indexOf(needle);
console.log("idx", at);
if (at >= 0) console.log(html.slice(Math.max(0, at - 140), at + 180).replace(/\s+/g, " "));
const meta = html.match(/name="description" content="([^"]+)"/);
console.log("meta", meta ? meta[1] : "none");
