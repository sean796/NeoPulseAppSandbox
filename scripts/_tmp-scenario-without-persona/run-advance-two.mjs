import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../..");
mkdirSync(HERE, { recursive: true });

const seed = JSON.parse(
  readFileSync(join(ROOT, "src/components/integrations/default-properties-seed.json"), "utf8"),
);
const site = seed.sites.find((s) => String(s.siteUrl).includes("advanceblinds"));
const auth = Buffer.from(`${site.username}:${site.appPassword}`).toString("base64");
const base = String(site.siteUrl).replace(/\/$/, "");

async function get(id) {
  const r = await fetch(`${base}/wp-json/wp/v2/service-area/${id}?context=edit`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!r.ok) throw new Error(`get ${id} ${r.status}`);
  const j = await r.json();
  return j.content?.raw || j.content?.rendered || "";
}

for (const id of [5668, 5636]) {
  const html = await get(id);
  const path = join(HERE, `${id}.html`);
  writeFileSync(path, html);
  const r = spawnSync(
    process.execPath,
    [
      join(HERE, "neo-mcp-case-study-one.mjs"),
      "--html-file",
      path,
      "--title",
      `post ${id}`,
      "--business",
      "Advance Blinds",
    ],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  writeFileSync(join(HERE, `${id}-rewrite.json`), r.stdout || "");
  if (r.status) {
    console.error(JSON.stringify({ id, ok: false, err: (r.stderr || r.stdout || "").slice(0, 400) }));
  } else {
    const j = JSON.parse(r.stdout);
    console.log(
      JSON.stringify({
        id,
        ok: j.ok,
        reason: j.reason || null,
        findChars: j.findChars,
        replaceChars: j.replaceChars,
        removed: j.removedNames,
      }),
    );
  }
}
