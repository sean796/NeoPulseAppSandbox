import fs from "node:fs";

const API = "http://127.0.0.1:8080/api";
const login = JSON.parse(fs.readFileSync(".cursor-tmp-login.json", "utf8"));
const seed = JSON.parse(
  fs.readFileSync("src/components/integrations/default-properties-seed.json", "utf8"),
);
const siteName = process.argv[2] || "Neo Digital";
const site = seed.sites.find((s) => s.name === siteName);
if (!site) {
  console.error("site not found", siteName);
  process.exit(1);
}

async function api(pathname, { method = "GET", body, token, timeoutMs = 180_000 } = {}) {
  const res = await fetch(`${API}${pathname}`, {
    method,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const auth = await api("/auth/login", {
  method: "POST",
  body: { username: login.email, email: login.email, password: login.password },
});
const token = auth.data.sessionToken;
const teamId = Number(auth.data.teamId ?? auth.data.activeTeamId ?? 1);
console.log("login", teamId, site.name);

const started = await api("/editorial-content-audit/run", {
  method: "POST",
  token,
  timeoutMs: 180_000,
  body: {
    siteId: site.id,
    siteName: site.name,
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
});
console.log("start", started.status, started.data);
const runId = started.data.runId;
if (!runId) process.exit(2);

for (let i = 0; i < 200; i += 1) {
  try {
    await api(`/agent-runs/${runId}/process`, {
      method: "POST",
      token,
      body: { teamId },
      timeoutMs: 300_000,
    });
  } catch (err) {
    console.log("process err", err instanceof Error ? err.message : err);
  }
  const got = await api(`/agent-runs/${runId}?teamId=${teamId}`, { token });
  const run = got.data?.run ?? got.data;
  console.log(
    "poll",
    i,
    run.status,
    run.step?.label || run.step?.stepKey || "",
    "email=",
    run.result?.email,
    "pages=",
    run.result?.pageCount,
    "findings=",
    run.result?.findingCount,
    run.errorMessage || "",
  );
  if (["done", "failed", "cancelled"].includes(run.status)) {
    fs.mkdirSync("tmp", { recursive: true });
    fs.writeFileSync(
      `tmp/editorial-audit-${site.name.replace(/\s+/g, "-").toLowerCase()}.json`,
      JSON.stringify(run, null, 2),
    );
    process.exit(run.status === "done" ? 0 : 3);
  }
  await new Promise((r) => setTimeout(r, 5000));
}
process.exit(4);
