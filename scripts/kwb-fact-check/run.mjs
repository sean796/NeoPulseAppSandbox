/**
 * Orchestrate KWB fact-check:
 * parse → find sources → build HTML from live dump → write updates payload
 *
 * Usage:
 *   node scripts/in-the-shade-fact-check/run.mjs --parse
 *   node scripts/in-the-shade-fact-check/run.mjs --search
 *   node scripts/in-the-shade-fact-check/run.mjs --build   (needs live-contents.json)
 *   node scripts/in-the-shade-fact-check/run.mjs --all-local  (parse+search+build)
 *   node scripts/in-the-shade-fact-check/run.mjs --sheet
 *     fetch CSV → parse → dump live → build (research block) → apply → reweave → purge PHP
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPostHtml } from "./build-post.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = join(ROOT, "scripts/_tmp-kwb-fact");
const HERE = dirname(fileURLToPath(import.meta.url));

function runNode(script, env = {}) {
  const r = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    throw new Error(`${script} exited ${r.status}`);
  }
}

/**
 * @param {{ preferPostsJson?: boolean, insertResearch?: boolean }} [opts]
 */
function buildAll(opts = {}) {
  const preferPostsJson = opts.preferPostsJson === true;
  const insertResearch = opts.insertResearch === true;
  const resolvedPath =
    preferPostsJson || !existsSync(join(DIR, "posts-resolved.json"))
      ? join(DIR, "posts.json")
      : join(DIR, "posts-resolved.json");
  const livePath = join(DIR, "live-contents.json");
  if (!existsSync(livePath)) {
    throw new Error(`Missing ${livePath}. Dump post_content via Neo MCP first.`);
  }
  if (!existsSync(resolvedPath)) {
    throw new Error(`Missing ${resolvedPath}`);
  }
  const resolved = JSON.parse(readFileSync(resolvedPath, "utf8"));
  const live = JSON.parse(readFileSync(livePath, "utf8"));
  /** @type {Map<string, any>} */
  const byUrl = new Map();
  for (const row of live.posts || live) {
    const url = String(row.pageUrl || row.url || "").replace(/\/$/, "") + "/";
    byUrl.set(url, row);
    byUrl.set(url.replace(/\/$/, ""), row);
  }

  const updates = [];
  const reports = [];
  for (const post of resolved.posts) {
    const key = post.pageUrl;
    const liveRow =
      byUrl.get(key) || byUrl.get(key.replace(/\/$/, "")) || byUrl.get(key.replace(/\/$/, "") + "/");
    if (!liveRow || !liveRow.id) {
      reports.push({
        pageUrl: post.pageUrl,
        error: liveRow?.error || "missing-live-content",
      });
      continue;
    }
    const { html, report, sources } = buildPostHtml(String(liveRow.content || ""), post, {
      insertResearch,
    });
    updates.push({
      id: liveRow.id,
      pageUrl: post.pageUrl,
      content: html,
      sources,
      report,
    });
    reports.push({
      pageUrl: post.pageUrl,
      id: liveRow.id,
      ...report,
      sourceCount: sources.length,
    });
  }

  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, "updates.json"), JSON.stringify({ updates }, null, 2), "utf8");
  writeFileSync(join(DIR, "build-report.json"), JSON.stringify({ reports }, null, 2), "utf8");
  const chunkSize = 10;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize).map((u) => ({
      id: u.id,
      pageUrl: u.pageUrl,
      content: u.content,
    }));
    writeFileSync(
      join(DIR, `updates-chunk-${String(Math.floor(i / chunkSize) + 1).padStart(3, "0")}.json`),
      JSON.stringify(chunk),
      "utf8",
    );
  }
  console.log(
    JSON.stringify(
      {
        source: resolvedPath,
        updates: updates.length,
        chunks: Math.ceil(updates.length / chunkSize),
        missedPosts: reports.filter((r) => r.error).length,
        totalReplaced: reports.reduce((n, r) => n + (r.replaced || 0), 0),
        totalLinked: reports.reduce((n, r) => n + (r.linked || 0), 0),
        totalMissedClaims: reports.reduce((n, r) => n + ((r.missed && r.missed.length) || 0), 0),
        homepageSkipped: reports.reduce((n, r) => n + (r.homepageSkipped || 0), 0),
      },
      null,
      2,
    ),
  );
}

function runSheetPipeline() {
  mkdirSync(DIR, { recursive: true });
  const stale = join(DIR, "posts-resolved.json");
  if (existsSync(stale)) {
    unlinkSync(stale);
    console.log("removed stale posts-resolved.json");
  }
  runNode(join(HERE, "fetch-sheet.mjs"));
  runNode(join(HERE, "parse-sheet.mjs"));
  if (!existsSync(join(DIR, "urls.json"))) {
    throw new Error("parse-sheet did not write urls.json");
  }
  runNode(join(HERE, "dump-live-via-rest.mjs"));
  buildAll({ preferPostsJson: true, insertResearch: true });
  runNode(join(HERE, "apply-updates-via-rest.mjs"));
  // Re-dump then reweave branded/title leftovers on live HTML
  runNode(join(HERE, "dump-live-via-rest.mjs"));
  runNode(join(HERE, "reweave-citations.mjs"));
  if (existsSync(join(DIR, "updates-reweave.json"))) {
    const reweave = JSON.parse(readFileSync(join(DIR, "updates-reweave.json"), "utf8"));
    writeFileSync(join(DIR, "updates.json"), JSON.stringify(reweave, null, 2), "utf8");
    if ((reweave.updates || []).length) {
      runNode(join(HERE, "apply-updates-via-rest.mjs"));
    }
  }
  runNode(join(HERE, "make-purge-php.mjs"));
  console.log(
    JSON.stringify(
      {
        next: "Run scripts/_tmp-kwb-fact/purge.php.txt via KWB Neo MCP neo-mcp_php",
        purgeFile: join(DIR, "purge.php.txt"),
      },
      null,
      2,
    ),
  );
}

function main() {
  const args = new Set(process.argv.slice(2));
  mkdirSync(DIR, { recursive: true });
  if (args.has("--sheet")) {
    runSheetPipeline();
    return;
  }
  if (args.has("--parse") || args.has("--all-local")) {
    runNode(join(HERE, "parse-sheet.mjs"));
  }
  if (args.has("--search") || args.has("--all-local")) {
    runNode(join(HERE, "find-source.mjs"));
  }
  if (args.has("--build") || args.has("--all-local")) {
    if (!existsSync(join(DIR, "live-contents.json")) && args.has("--all-local")) {
      console.log("Skipping build: live-contents.json not present yet");
      return;
    }
    buildAll({ insertResearch: true });
  }
  if (args.has("--build-only")) {
    buildAll({ preferPostsJson: args.has("--from-sheet"), insertResearch: !args.has("--from-sheet") });
  }
}

main();
