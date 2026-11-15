import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRequestBody, sendJson } from "./local-dominator-export-jobs.mjs";
import { checkWorkerAuth, isWorkerProgressNoise } from "./post-creator-server-jobs.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const entryScript = path.join(repoRoot, "scripts", "blog-ideas-studio-job-entry.ts");
const jobsDir =
  process.env.BLOG_IDEAS_STUDIO_JOBS_DIR ||
  path.join(os.tmpdir(), "flowbie-blog-ideas-studio-jobs");

/** @type {Map<string, { child: import("node:child_process").ChildProcess | null, exitCode: number | null, progressPath: string }>} */
const activeJobs = new Map();

function ensureJobsDir() {
  fs.mkdirSync(jobsDir, { recursive: true });
}

function appendProgress(progressPath, data) {
  fs.appendFileSync(progressPath, `${JSON.stringify(data)}\n`, "utf8");
}

function parseProgressFile(progressPath) {
  if (!fs.existsSync(progressPath)) {
    return { status: "running", label: "Starting" };
  }
  const lines = fs.readFileSync(progressPath, "utf8").split(/\r?\n/).filter(Boolean);
  let label = "Starting";
  let result = null;
  let error = null;
  let status = "running";
  for (const line of lines) {
    let data;
    try {
      data = JSON.parse(line);
    } catch {
      continue;
    }
    if (!data?.type) continue;
    if (data.type === "step" && data.label && !isWorkerProgressNoise(data.label)) {
      label = data.label;
    }
    if (data.type === "done") {
      status = "done";
      result = data.result ?? null;
    }
    if (data.type === "error") {
      status = "error";
      error = data.message || "Blog Ideas Studio job failed.";
      label = error;
    }
  }
  return { status, label, result, error };
}

function startJob(input) {
  if (!fs.existsSync(entryScript)) {
    return {
      ok: false,
      error: "Blog Ideas Studio entry script is missing.",
      code: "BLOG_IDEAS_STUDIO_EXEC_BLOCKED",
    };
  }
  ensureJobsDir();
  const jobId = crypto.randomUUID();
  const progressPath = path.join(jobsDir, `${jobId}.jsonl`);
  fs.writeFileSync(progressPath, "", "utf8");

  const child = spawn(process.execPath, ["--import", "tsx", entryScript], {
    cwd: repoRoot,
    env: {
      ...process.env,
      JOB_PAYLOAD: JSON.stringify(input),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  activeJobs.set(jobId, { child, exitCode: null, progressPath });

  const ingestWorkerLine = (raw) => {
    const text = String(raw).trim();
    if (!text || isWorkerProgressNoise(text)) return;
    for (const line of text.split(/\r?\n/).filter(Boolean)) {
      try {
        const parsed = JSON.parse(line);
        if (parsed?.type === "step" || parsed?.type === "done" || parsed?.type === "error") {
          appendProgress(progressPath, parsed);
        }
      } catch {
        /* Logger and API lines stay off the task status. */
      }
    }
  };

  child.stdout?.on("data", ingestWorkerLine);
  child.stderr?.on("data", ingestWorkerLine);

  child.on("exit", (code) => {
    const entry = activeJobs.get(jobId);
    if (!entry) return;
    entry.exitCode = code ?? 1;
    entry.child = null;
    const parsed = parseProgressFile(progressPath);
    if (parsed.status === "running") {
      if (code === 0) {
        appendProgress(progressPath, { type: "done", result: { ok: true } });
      } else {
        const startedOnly =
          !parsed.error &&
          (!parsed.label || parsed.label === "Blog Ideas Studio job started" || parsed.label === "Starting");
        appendProgress(progressPath, {
          type: "error",
          message: startedOnly
            ? "Blog Ideas Studio process exited unexpectedly."
            : parsed.error || parsed.label,
        });
      }
    }
  });

  appendProgress(progressPath, { type: "step", label: "Blog Ideas Studio job started" });
  return { ok: true, jobId };
}

function readJobProgress(jobId) {
  const entry = activeJobs.get(jobId);
  const progressPath = entry?.progressPath ?? path.join(jobsDir, `${jobId}.jsonl`);
  if (!fs.existsSync(progressPath)) {
    return { ok: false, error: "Job not found." };
  }
  const parsed = parseProgressFile(progressPath);
  if (parsed.status === "done") {
    activeJobs.delete(jobId);
    return { ok: true, status: "done", label: parsed.label, result: parsed.result };
  }
  if (parsed.status === "error") {
    activeJobs.delete(jobId);
    return {
      ok: true,
      status: "error",
      label: parsed.label,
      error: parsed.error || parsed.label,
    };
  }
  const exitCode = entry?.exitCode ?? entry?.child?.exitCode ?? null;
  const running = Boolean(entry?.child && entry.child.exitCode === null);
  if (!running && entry && exitCode != null && exitCode !== 0) {
    activeJobs.delete(jobId);
    const startedOnly =
      !parsed.error &&
      (!parsed.label || parsed.label === "Blog Ideas Studio job started" || parsed.label === "Starting");
    const error = startedOnly
      ? "Blog Ideas Studio process exited unexpectedly."
      : parsed.error || parsed.label || "Blog Ideas Studio process exited unexpectedly.";
    return {
      ok: true,
      status: "error",
      label: error,
      error,
    };
  }
  return { ok: true, status: "running", label: parsed.label };
}

export async function handleBlogIdeasStudioRequest(req, res, pathname) {
  const url = pathname.replace(/\/+$/, "");
  const method = req.method ?? "GET";

  const jobMatch = url.match(/^\/blog-ideas-studio\/jobs\/([a-f0-9-]{8,64})$/i);
  if (method === "GET" && jobMatch) {
    if (!checkWorkerAuth(req)) {
      sendJson(res, 401, { ok: false, error: "Unauthorized." });
      return true;
    }
    sendJson(res, 200, readJobProgress(jobMatch[1].toLowerCase()));
    return true;
  }

  if (method === "POST" && url === "/blog-ideas-studio/jobs") {
    if (!checkWorkerAuth(req)) {
      sendJson(res, 401, { ok: false, error: "Unauthorized." });
      return true;
    }
    let body = {};
    try {
      const raw = await readRequestBody(req);
      body = raw ? JSON.parse(raw) : {};
    } catch {
      sendJson(res, 400, { ok: false, error: "Invalid JSON body." });
      return true;
    }
    if (!body.site || !body.bearerToken || !body.apiBase || !body.postCount) {
      sendJson(res, 400, {
        ok: false,
        error: "Missing required fields: site, bearerToken, apiBase, postCount",
      });
      return true;
    }
    sendJson(res, 200, startJob(body));
    return true;
  }

  return false;
}
