import { readFileSync, writeFileSync } from "fs";

const res = await fetch("https://intheshadeflorida.com/blog/window-blind-repair/");
const html = await res.text();
writeFileSync(new URL("./state/repair.html", import.meta.url), html);
const phrases = [
  "provides professional",
  "repair service",
  "we repair",
  "our workshop",
  "certified repair",
  "In The Shade",
];
for (const phrase of phrases) {
  const at = html.toLowerCase().indexOf(phrase.toLowerCase());
  console.log(at >= 0 ? "HIT" : "miss", phrase);
  if (at >= 0) console.log(html.slice(at, at + 180).replace(/\s+/g, " "));
}
