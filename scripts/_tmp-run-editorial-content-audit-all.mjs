/**
 * Start Editorial Content Audit for every Integrations seed property.
 * Emails sean@neodigital.ca per finished property.
 *
 * Usage: node scripts/_tmp-run-editorial-content-audit-all.mjs
 */
import fs from "node:fs";
import path from "node:path";

const API = "http://127.0.0.1:8080/api";
const loginPath = path.join(process.cwd(), ".cursor-tmp-login.json");
const seedPath = path.join(
  process.cwd(),
  "src/components/integrations/default-properties-seed.json",
);
const outPath = path.join(process.cwd(), "tmp/editorial-content-audit-all.json");

async function api(pathname, { method = "GET", body, token, timeoutMs = 120_000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${pathname}`, {
      method,
      signal: ctrl.signal,
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const login = JSON.parse(fs.readFileSync(loginPath, "utf8"));
const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
const sites = Array.isArray(seed.sites) ? seed.sites : [];

const auth = await api("/auth/login", {
  method: "POST",
  body: {
    username: login.email,
    email: login.email,
    password: login.password,
  },
});
if (!auth.data.sessionToken) {
  console.error("LOGIN_FAIL", JSON.stringify(auth));
  process.exit(1);
}
const token = auth.data.sessionToken;
const teamId = Number(
  auth.data.teamId ?? auth.data.activeTeamId ?? auth.data.user?.teamId ?? 1,
);
console.log("logged_in", { teamId, siteCount: sites.length });

const started = [];
for (const site of sites) {
  const siteId = String(site.id || "");
  const siteName = String(site.name || siteId);
  console.log("start", siteName);
  try {
    const res = await api(
      "/editorial-content-audit/run",
      {
        method: "POST",
        token,
        timeoutMs: 180_000,
        body: {
          siteId,
          siteName,
          siteUrl: site.siteUrl,
          username: site.username,
          appPassword: site.appPassword,
          teamId,
          to: "sean@neodigital.ca",
          entitySitemapUrl: site.entitySitemapUrl,
          manualEndpoint: site.manualEndpoint,
          serviceCity: site.serviceCity,
          serviceState: site.serviceState,
          serviceCountry: site.serviceCountry,
          locations: site.locations,
          napInfo: site.napInfo,
        },
      },
    );
    const runId =
      typeof res.data.runId === "number"
        ? res.data.runId
        : Array.isArray(res.data.runIds)
          ? res.data.runIds[0]
          : null;
    console.log("  HTTP", res.status, "runId", runId, res.data.error || "");
    started.push({
      siteId,
      siteName,
      runId,
      startStatus: res.status,
      startError: res.data.error || null,
      ok: Boolean(runId),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log("  FAIL", message);
    started.push({
      siteId,
      siteName,
      runId: null,
      startStatus: 0,
      startError: message,
      ok: false,
    });
  }
  await sleep(1500);
}

const active = started.filter((s) => s.runId);
console.log("started_ok", active.length, "of", sites.length);

const maxRounds = 400;
for (let round = 0; round < maxRounds; round += 1) {
  let pending = 0;
  for (const row of active) {
    if (row.finalStatus && ["done", "failed", "cancelled"].includes(row.finalStatus)) {
      continue;
    }
    pending += 1;
    try {
      await api(`/agent-runs/${row.runId}/process`, {
        method: "POST",
        token,
        body: { teamId },
        timeoutMs: 300_000,
      });
    } catch {
      // keep polling
    }
    const got = await api(`/agent-runs/${row.runId}?teamId=${teamId}`, { token });
    const run = got.data?.run ?? got.data;
    if (!run || got.status >= 400) {
      continue;
    }
    row.finalStatus = run.status;
    row.errorMessage = run.errorMessage || "";
    row.result = run.result ?? {};
    row.step = run.step?.label || run.step?.stepKey || "";
    if (round % 5 === 0 || ["done", "failed", "cancelled"].includes(run.status)) {
      console.log(
        "poll",
        round,
        row.siteName,
        run.status,
        row.step,
        "email=",
        row.result?.email,
        "findings=",
        row.result?.findingCount,
        row.errorMessage || "",
      );
    }
  }
  if (pending === 0) {
    break;
  }
  await sleep(8000);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ teamId, started: active, all: started }, null, 2));

const done = active.filter((r) => r.finalStatus === "done");
const emailed = done.filter((r) => r.result?.email);
const failed = active.filter((r) => r.finalStatus === "failed");
const zeroPages = done.filter((r) => r.result?.pageCount === 0);
console.log(
  "FINAL",
  JSON.stringify({
    started: active.length,
    done: done.length,
    emailed: emailed.length,
    zeroPages: zeroPages.length,
    failed: failed.length,
    failedNames: failed.map((f) => f.siteName),
    emailedNames: emailed.map((f) => f.siteName),
  }),
);

const stillRunning = active.filter(
  (r) => !["done", "failed", "cancelled"].includes(r.finalStatus || ""),
);
process.exit(stillRunning.length === 0 && failed.length === 0 ? 0 : 3);
