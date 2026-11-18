import fs from "node:fs";

const seed = JSON.parse(
  fs.readFileSync("src/components/integrations/default-properties-seed.json", "utf8"),
);
const site = seed.sites.find((s) => String(s.siteUrl || "").includes("eliteshadings"));
const auth = Buffer.from(`${site.username}:${site.appPassword}`).toString("base64");
const base = site.siteUrl.replace(/\/$/, "");

const liveChecks = [
  {
    url: "https://eliteshadings.com/blog/banded-shades-window-treatment/",
    bad: ["South Land Park", "East Sacramento", "Curtis Park"],
    good: ["Laguna West", "Spreckels Park", "Springtown"],
  },
  {
    url: "https://eliteshadings.com/service-area/banded-blinds-manteca-ca/",
    bad: ["Lindsey", "Naples", "Vanderbilt", "Gulf", "salt air", "explore operating systems"],
    good: ["Manteca", "Elite Shutters, Shadings"],
  },
  {
    url: "https://eliteshadings.com/service-area/custom-blinds-la-loma-modesto-ca/",
    bad: ["Speed Freak", "investigation"],
    good: ["La Loma", "Modesto"],
  },
  {
    url: "https://eliteshadings.com/service-area/blinds-installation-college-area-modesto/",
    bad: ["Demographics of Filipino"],
    good: ["College Area", "Modesto"],
  },
  {
    url: "https://eliteshadings.com/service-area/hunter-douglas-blinds-san-ramon/",
    bad: [],
    good: ["Elite Shutters, Shadings & Flooring"],
  },
  {
    url: "https://eliteshadings.com/service-area/custom-window-treatments-san-ramon/",
    bad: ["labeled real-world hypothetical featuring Lena"],
    good: ["Custom Window Treatments"],
  },
];

const restChecks = [
  {
    id: 21999,
    endpoint: "posts",
    bad: ["Plano", "Richardson", "Kessler", "Highland Park"],
  },
  {
    id: 21994,
    endpoint: "posts",
    bad: [
      "Milwaukee",
      "Lincoln Park",
      "Oak Park",
      "Gold Coast",
      "Walker's Point",
      "Rogers Park",
      "Bay View",
      "Wauwatosa",
      "lake-effect",
    ],
  },
  {
    id: 22063,
    endpoint: "service-area",
    bad: ["family room in Manteca"],
  },
];

const out = [];
for (const c of liveChecks) {
  const res = await fetch(c.url, { headers: { "User-Agent": "NeoPulseAuditFix/1.0" } });
  const html = await res.text();
  const badHits = c.bad.filter((b) => html.includes(b));
  const missingGood = c.good.filter((b) => !html.includes(b));
  out.push({
    kind: "live",
    url: c.url,
    status: res.status,
    badHits,
    missingGood,
    ok: res.ok && badHits.length === 0 && missingGood.length === 0,
  });
}

for (const c of restChecks) {
  const res = await fetch(`${base}/wp-json/wp/v2/${c.endpoint}/${c.id}?context=edit`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  const j = await res.json();
  const content = j.content?.raw || "";
  const badHits = c.bad.filter((b) => content.includes(b));
  out.push({
    kind: "rest",
    id: c.id,
    status: j.status,
    badHits,
    ok: res.ok && badHits.length === 0,
  });
}

fs.writeFileSync(
  "scripts/_tmp-elite-audit-fix/verify-results.json",
  JSON.stringify(out, null, 2),
  "utf8",
);
console.log(JSON.stringify(out, null, 2));
if (out.some((r) => !r.ok)) process.exit(1);
