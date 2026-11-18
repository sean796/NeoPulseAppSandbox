import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "scripts/_tmp-elite-audit-fix");
let html = fs.readFileSync(path.join(ROOT, "20829.html"), "utf8");

html = html.replace(
  /<blockquote><p>Brenda[\s\S]*?<\/blockquote>/,
  "<p>Homeowners renovating west-facing rooms often want adjustable light and privacy without losing daytime views. Banded blinds can filter harsh afternoon sun across Manteca while keeping living areas usable through peak heat.</p>",
);

html = html.replace(
  /The article also includes a labeled real-world hypothetical featuring Brenda[\s\S]*?\./,
  "Later sections compare product options for Manteca homes with large west-facing glass.",
);

const pairs = [
  ["Lindsey Blinds Etc.", "Elite Shutters, Shadings &amp; Flooring"],
  ["Lindsey Blinds Etc", "Elite Shutters, Shadings &amp; Flooring"],
  [
    "https://en.wikipedia.org/wiki/Naples%2C_Florida",
    "https://en.wikipedia.org/wiki/Manteca,_California",
  ],
  ["Vanderbilt Beach, Naples, FL", "Manteca, CA"],
  ["Vanderbilt Beach, Naples", "Manteca"],
  ["Vanderbilt Beach Naples", "Manteca"],
  ["Naples, FL", "Manteca, CA"],
  ["Naples homes", "Manteca homes"],
  ["Naples", "Manteca"],
  ["Vanderbilt Beach", "Manteca"],
  ["vanderbilt-beach", "manteca"],
  ["facing the Gulf in Manteca", "facing west-facing yards in Spreckels Park"],
  ["Gulf-facing glass walls", "west-facing glass walls"],
  ["Gulf-facing windows", "west-facing windows"],
  ["Gulf-facing", "west-facing"],
  ["from the Gulf in", "across"],
  ["from the Gulf", "across the lot"],
  ["Gulf views", "yard and street views"],
  ["the Gulf", "afternoon sun"],
  ["salt air and moisture", "Central Valley heat and dust"],
  ["salt air and humidity", "triple-digit heat and dry dust"],
  ["High humidity and salt air", "Triple-digit summer heat and agricultural dust"],
  ["salt air", "fine valley dust"],
  ["coastal environment", "Central Valley climate"],
  ["coastal environments", "Central Valley conditions"],
  ["coastal decor", "Central Valley interior styles"],
  ["coastal properties", "Central Valley properties"],
  ["coastal living environment", "Central Valley living environment"],
  ["Coastal architectural styles", "Local architectural styles"],
  ["waterfront condo", "street-facing ranch home"],
  ["waterfront views", "open backyard views"],
  ["waterfront", "street-facing"],
  ["Conners neighborhood", "Spreckels Park"],
  ["condominiums built in the 1970s", "ranch homes built in the 1970s"],
  [
    "condominiums built from the 1970s to the 2000s",
    "ranch and two-story homes built from the 1970s to the 2000s",
  ],
  ["local condominiums", "local two-story homes"],
  ["Seasonal resident influx", "Summer heat spikes"],
  ["seasonal influx of residents in winter", "peak summer cooling season"],
  ["the Florida climate", "the Central Valley climate"],
  ["Florida climate", "Central Valley climate"],
  ["Florida", "California"],
  [" explore operating systems", ""],
  [". explore operating systems", "."],
  ["enhancing-a-waterfront-condo", "enhancing-a-street-facing-ranch-home"],
  ["beach house", "ranch home"],
];

for (const [from, to] of pairs) {
  html = html.split(from).join(to);
}

const forbidden = [
  "Lindsey",
  "Naples",
  "Vanderbilt",
  "Gulf",
  "salt air",
  "explore operating systems",
  "Brenda",
  "beach house",
  "Florida",
];
const hits = forbidden.filter((b) => html.includes(b));
if (hits.length) {
  console.error("Forbidden remaining:", hits);
  for (const b of hits) {
    const i = html.indexOf(b);
    console.error(b, "→", html.slice(Math.max(0, i - 60), i + 80));
  }
  process.exit(1);
}
if (!html.includes("Manteca") || !html.includes("Elite Shutters, Shadings &amp; Flooring")) {
  console.error("Missing required Manteca / full business name");
  process.exit(1);
}

const out = {
  title: "Banded Blinds Near Manteca California",
  slug: "banded-blinds-manteca-ca",
  excerpt:
    "Upgrade your home with stylish banded blinds in Manteca, CA. Get expert installation from Elite Shutters, Shadings & Flooring.",
  content: html,
};
fs.writeFileSync(path.join(ROOT, "20829.rewritten.json"), JSON.stringify(out, null, 2), "utf8");
fs.writeFileSync(path.join(ROOT, "20829.rewritten.html"), html, "utf8");
console.log(JSON.stringify({ ok: true, contentLen: html.length, title: out.title, slug: out.slug }, null, 2));
