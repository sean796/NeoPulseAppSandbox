import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const SEED = join(ROOT, "src/components/integrations/default-properties-seed.json");

function loadSite() {
  const seed = JSON.parse(readFileSync(SEED, "utf8"));
  return (seed.sites || []).find((s) => String(s.siteUrl || "").includes("blindmagic.com"));
}

async function main() {
  const site = loadSite();
  const auth =
    "Basic " +
    Buffer.from(`${site.username}:${site.appPassword.replace(/\s+/g, "")}`).toString("base64");
  const id = 20543;
  const res = await fetch(`${site.siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/posts/${id}?context=edit`, {
    headers: { Authorization: auth },
  });
  const row = await res.json();
  const html = row.content?.raw || "";
  const spruce = [...html.matchAll(/<a[^>]+thespruce\.com[^>]*>[\s\S]*?<\/a>/gi)].map((m) => m[0]);
  const vacuumIdx = html.indexOf("vacuum with a brush");
  console.log(
    JSON.stringify(
      {
        spruceAnchors: spruce,
        aroundVacuum: vacuumIdx >= 0 ? html.slice(Math.max(0, vacuumIdx - 80), vacuumIdx + 280) : null,
        research: /research-and-fact-checking/.test(html),
      },
      null,
      2,
    ),
  );
}

main();
