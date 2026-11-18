/**
 * Download Neo Digital fact-checker sheet CSV (public export).
 * If Google returns 401/403 and a valid local CSV already exists, keep it.
 * Stops if the header row is not the expected fact-checker columns.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = join(ROOT, "scripts/_tmp-nd-fact");
const OUT = join(OUT_DIR, "fact-checker.csv");

const SHEET_ID =
  process.env.ND_FACT_SHEET_ID?.trim() || "1SwWr0yiNkWUjJhFNE97QJzBAKI2pMqzliQsT_nGIDLE";
const GID = process.env.ND_FACT_SHEET_GID?.trim() || "324575377";

const REQUIRED_HEADERS = ["Page title", "Page URL", "Claim", "Source URL", "Suggested wording"];

function assertHeader(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const headers = firstLine.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  for (const need of REQUIRED_HEADERS) {
    if (!headers.includes(need)) {
      throw new Error(`CSV header missing "${need}". Got: ${headers.slice(0, 14).join(" | ")}`);
    }
  }
  return text.split(/\r?\n/).filter((l) => l.trim()).length - 1;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    if ((res.status === 401 || res.status === 403) && existsSync(OUT)) {
      const local = readFileSync(OUT, "utf8").replace(/^\uFEFF/, "");
      const dataRows = assertHeader(local);
      console.log(
        JSON.stringify(
          {
            out: OUT,
            sheetId: SHEET_ID,
            gid: GID,
            dataRows,
            source: "local-cache",
            exportStatus: res.status,
            note: "Public CSV export blocked; using Drive-exported local CSV",
          },
          null,
          2,
        ),
      );
      return;
    }
    throw new Error(
      `Sheet export failed: HTTP ${res.status}. Export via Drive to ${OUT} then re-run.`,
    );
  }
  const text = (await res.text()).replace(/^\uFEFF/, "");
  if (!text.trim()) {
    throw new Error("Sheet export returned empty CSV");
  }
  const dataRows = assertHeader(text);
  writeFileSync(OUT, text, "utf8");
  console.log(JSON.stringify({ out: OUT, sheetId: SHEET_ID, gid: GID, dataRows, source: "export" }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
