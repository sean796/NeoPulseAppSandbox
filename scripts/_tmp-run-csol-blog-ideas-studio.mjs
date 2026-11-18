/**
 * Call Blog Ideas Studio worker API for Custom Shades (no UI).
 * Usage: node scripts/_tmp-run-csol-blog-ideas-studio.mjs
 */
import fs from "node:fs";
import path from "node:path";

const SITE_ID = "wp-1791924906059-17";
const POST_COUNT = 2;
const WORKER = "http://127.0.0.1:10000";
const API_ORIGIN = "http://127.0.0.1:8080";
const API = `${API_ORIGIN}/api`;

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function api(pathname, { method = "GET", token, body } = {}) {
  const url = `${API}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`Non-JSON ${res.status}: ${raw.slice(0, 300)}`);
  }
  return { res, data };
}

async function main() {
  const loginPath = path.join(process.cwd(), ".cursor-tmp-login.json");
  const { email, password } = readJson(loginPath);
  const seed = readJson(
    path.join(process.cwd(), "src/components/integrations/default-properties-seed.json"),
  );
  const site = seed.sites.find((s) => s.id === SITE_ID);
  if (!site) throw new Error("Custom Shades missing from seed");

  const login = await api("/auth/login", {
    method: "POST",
    body: { username: email, email, password },
  });
  if (!login.data.ok) throw new Error(`Login failed: ${JSON.stringify(login.data)}`);
  const token = login.data.sessionToken;

  const startRes = await fetch(`${WORKER}/blog-ideas-studio/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      site,
      postCount: POST_COUNT,
      apiBase: API_ORIGIN,
      bearerToken: token,
    }),
  });
  const start = await startRes.json();
  if (!startRes.ok || !start.ok || !start.jobId) {
    throw new Error(`Worker start failed: ${JSON.stringify(start)}`);
  }
  console.log(`job ${start.jobId}`);

  for (let i = 0; i < 720; i += 1) {
    await new Promise((r) => setTimeout(r, 5000));
    const pollRes = await fetch(`${WORKER}/blog-ideas-studio/jobs/${start.jobId}`);
    const poll = await pollRes.json();
    console.log(`[${i}] ${poll.status} ${poll.label || ""}`);
    if (poll.status === "done") {
      console.log(JSON.stringify(poll.result, null, 2));
      process.exit(0);
    }
    if (poll.status === "error") {
      console.error(poll.error || poll.label);
      process.exit(1);
    }
  }
  console.error("timeout");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
