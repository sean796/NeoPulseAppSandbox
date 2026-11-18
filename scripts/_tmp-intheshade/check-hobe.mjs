import { readFileSync } from "fs";

const html = readFileSync(new URL("./state/hobe.html", import.meta.url), "utf8");
const needles = [
  "Aluminum Shutters",
  "hurricane",
  "Board and Batten",
  "board-and-batten",
  "Shutters For Sale In Hobe Sound, Florida, can find",
  "Homeowners in Shutters",
  "occasional humidity",
  "Top-Down Bottom-Up",
  "Top-Down/Bottom-Up",
  "Free Premium Upgrades",
  "Palm Beach",
  "NewStyle",
  "Heritance",
  "exterior storm",
  "For exterior options",
  "newsletter",
  "high year-round humidity",
  "year-round humidity",
];
for (const needle of needles) {
  const at = html.toLowerCase().indexOf(needle.toLowerCase());
  console.log(at >= 0 ? "HIT " : "miss", needle);
}
const body = html.indexOf("entry-content");
console.log("entry", body);
const article = html.match(/<div class="entry-content[\s\S]{0,1500}/);
console.log(article ? article[0].replace(/\s+/g, " ").slice(0, 800) : "no entry");
