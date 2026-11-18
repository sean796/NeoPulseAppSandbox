/**
 * Run Money Page Internal Links for Blind Magic via Pulse hub (profile credentials).
 * Usage: node scripts/_tmp-run-money-page-links.mjs
 */
import fs from "node:fs";
import path from "node:path";

const API = "http://127.0.0.1:8080/api";
const loginPath = path.join(process.cwd(), ".cursor-tmp-login.json");
const sitePath = path.join(process.cwd(), process.argv[2] || "tmp/blind-magic-run-site.json");
const outPath = path.join(process.cwd(), "tmp/money-links-blind-magic-run.json");

async function post(pathname, body, token, timeoutMs = 120_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${pathname}`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

async function get(pathname, token) {
  const res = await fetch(`${API}${pathname}`, {
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const login = JSON.parse(fs.readFileSync(loginPath, "utf8"));
const site = JSON.parse(fs.readFileSync(sitePath, "utf8"));

const auth = await post("/auth/login", {
  username: login.email,
  email: login.email,
  password: login.password,
});
if (!auth.data.sessionToken) {
  console.error("LOGIN_FAIL", JSON.stringify(auth));
  process.exit(1);
}
const token = auth.data.sessionToken;
const teamId = Number(
  auth.data.teamId ?? auth.data.activeTeamId ?? auth.data.user?.teamId ?? 1,
);
console.log("logged_in", {
  teamId,
  siteId: site.siteId,
  siteName: site.siteName,
});

console.log("starting money-page-internal-links (may take several minutes)...");
const started = await post(
  "/money-page-internal-links/run",
  {
    siteId: site.siteId,
    siteName: site.siteName,
    siteUrl: site.siteUrl,
    username: site.username,
    appPassword: site.appPassword,
    teamId,
    to: "sean@neodigital.ca",
  },
  token,
  900_000,
);
console.log("START", started.status, JSON.stringify(started.data));
const runId = started.data.runId;
if (!runId) process.exit(2);

for (let i = 0; i < 90; i += 1) {
  await new Promise((r) => setTimeout(r, 4000));
  const got = await get(`/agent-runs/${runId}?teamId=${teamId}`, token);
  const run = got.data?.run ?? got.data;
  if (!run || got.status >= 400) {
    console.log("poll", i, "statusHttp", got.status);
    continue;
  }
  const status = run.status;
  const err = run.errorMessage || "";
  const result = run.result ?? {};
  console.log(
    "poll",
    i,
    status,
    err,
    "email=",
    result.email,
    "applied=",
    result.applied,
    "failed=",
    result.failed,
    "planned=",
    result.planned,
  );
  if (status === "done" || status === "failed" || status === "cancelled") {
    fs.writeFileSync(outPath, JSON.stringify({ status, err, result, run }, null, 2));
    console.log(
      "FINAL",
      JSON.stringify({
        status,
        err,
        email: result.email,
        applied: result.applied,
        failed: result.failed,
        planned: result.planned,
        skipped: result.skipped,
      }),
    );
    process.exit(status === "done" && result.email ? 0 : 3);
  }
}

console.error("timeout");
process.exit(4);
