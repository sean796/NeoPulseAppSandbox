import fs from "fs";

const p =
  "C:/Users/Sean Craig/wpstaging/sites/neopulse.local/data/php/neo-pulse-data/manager-settings.json";
const j = JSON.parse(fs.readFileSync(p, "utf8"));
const blob = JSON.stringify(j);
const hits = [...blob.matchAll(/research[_A-Za-z]*":"[^"]+"/g)].map((m) => m[0]);
console.log(hits.slice(0, 20).join("\n"));
