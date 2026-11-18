/**
 * Run Posts Content Gap Check for Custom Shades of London; poll until Blog Ideas
 * schedules a next-month post. Usage: node scripts/_tmp-run-csol-gap.mjs
 */
import fs from "node:fs";
import path from "node:path";
import https from "node:https";

const BASE = "http://localhost:8080/api";
const loginPath = path.join(process.cwd(), ".cursor-tmp-login.json");
const SITE_ID = "wp-1791924906059-17";
const POLL_MS = 4000;
const MAX_TICKS = 180; // ~12 min

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function api(pathname, { method = "GET", token, body } = {}) {
  const url = `${BASE}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
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
    throw new Error(`Non-JSON ${res.status} from ${url}: ${raw.slice(0, 300)}`);
  }
  return { res, data, url };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function nextMonthKey(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 2; // next month (1-indexed for display math)
  const year = m > 12 ? y + 1 : y;
  const month = m > 12 ? m - 12 : m;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function loadCsolSite() {
  const seed = readJson(
    path.join(process.cwd(), "src/components/integrations/default-properties-seed.json"),
  );
  const site = seed.sites.find((s) => s.id === SITE_ID || /custom shades/i.test(s.name));
  if (!site) throw new Error("Custom Shades site not in seed");
  if (!site.appPassword) throw new Error("Custom Shades missing appPassword in seed");
  return site;
}

async function listFuturePostsViaWp(site) {
  const base = String(site.siteUrl).replace(/\/+$/, "");
  const auth = Buffer.from(`${site.username}:${site.appPassword}`).toString("base64");
  const url = `${base}/wp-json/wp/v2/posts?status=future&per_page=100&_fields=id,link,slug,title,date,status`;
  // Direct to WordPress REST from this server script (agent verification), not browser.
  const agent = new https.Agent({ rejectUnauthorized: true });
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
    agent,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`WP future posts failed ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

async function main() {
  const { email, password } = readJson(loginPath);
  const site = loadCsolSite();
  const month = nextMonthKey();
  console.log(`Target site: ${site.name} (${site.id})`);
  console.log(`Next month key: ${month}`);

  const login = await api("/auth/login", {
    method: "POST",
    body: { username: email, email, password },
  });
  if (!login.data.ok) throw new Error(`Login failed: ${JSON.stringify(login.data)}`);
  const token = login.data.sessionToken;
  if (!token) throw new Error("No sessionToken");

  const me = await api(`/auth/me?_=${Date.now()}`, { token });
  const teamId = me.data.activeTeam?.id ?? me.data.teams?.[0]?.id;
  if (!teamId) throw new Error("No teamId");
  console.log(`teamId=${teamId}`);

  const before = await listFuturePostsViaWp(site);
  const beforeNext = before.filter((p) => String(p.date || "").startsWith(month));
  console.log(
    `Before: ${before.length} future posts, ${beforeNext.length} in ${month}`,
  );

  const started = await api("/posts-content-gap-check/run", {
    method: "POST",
    token,
    body: {
      siteId: site.id,
      siteName: site.name,
      siteUrl: site.siteUrl,
      username: site.username,
      appPassword: site.appPassword,
      teamId,
    },
  });
  console.log("gap start:", started.res.status, JSON.stringify(started.data));
  if (!started.data.ok && started.res.status !== 202) {
    throw new Error(`Gap start failed: ${JSON.stringify(started.data)}`);
  }
  const gapRunId = started.data.runId ?? started.data.runIds?.[0];
  console.log(`gapRunId=${gapRunId}`);

  let childPostCreatorId = null;
  let lastStatus = "";

  for (let tick = 0; tick < MAX_TICKS; tick += 1) {
    // Keep agent runs moving (gap finish may already be async; post_creator needs process ticks)
    if (gapRunId) {
      await api(`/agent-runs/${gapRunId}/process`, {
        method: "POST",
        token,
        body: { teamId },
      }).catch(() => null);
      const gapGet = await api(`/agent-runs/${gapRunId}?teamId=${teamId}`, { token });
      const gapRun = gapGet.data.run ?? gapGet.data;
      const gapStatus = gapRun?.status;
      const gapLabel = gapRun?.step?.label ?? gapRun?.errorMessage ?? "";
      const line = `gap[${tick}] status=${gapStatus} label=${gapLabel}`;
      if (line !== lastStatus) {
        console.log(line);
        lastStatus = line;
      }
      const childId =
        gapRun?.result?.postsGap?.childRunId ??
        gapRun?.result?.childRunId ??
        gapRun?.result?.checkpoint?.childRunId ??
        null;
      if (childId && !childPostCreatorId) {
        childPostCreatorId = childId;
        console.log(`child post_creator runId=${childPostCreatorId}`);
      }
      // Also scan recent runs for post_creator for this site
      if (!childPostCreatorId) {
        const list = await api(`/agent-runs?teamId=${teamId}&limit=20`, { token });
        const runs = list.data.runs ?? list.data.items ?? [];
        const hit = runs.find(
          (r) =>
            (r.recipeKey === "post_creator" || r.plan?.executionKind === "post_creator") &&
            (r.context?.siteId === site.id ||
              r.plan?.executionPayload?.siteId === site.id ||
              r.plan?.site?.id === site.id) &&
            (r.status === "running" || r.status === "queued" || r.status === "done"),
        );
        if (hit?.id) {
          childPostCreatorId = hit.id;
          console.log(`found post_creator runId=${childPostCreatorId} status=${hit.status}`);
        }
      }
    }

    if (childPostCreatorId) {
      const proc = await api(`/agent-runs/${childPostCreatorId}/process`, {
        method: "POST",
        token,
        body: { teamId },
      });
      const run = proc.data.run ?? proc.data;
      const label = run?.step?.label ?? run?.errorMessage ?? "";
      const status = run?.status;
      console.log(`pc[${tick}] status=${status} label=${label}`);
      if (status === "failed") {
        throw new Error(`post_creator failed: ${label || JSON.stringify(run?.errorMessage)}`);
      }
    }

    const future = await listFuturePostsViaWp(site);
    const nextMonth = future.filter((p) => String(p.date || "").startsWith(month));
    if (nextMonth.length > beforeNext.length) {
      const newest = nextMonth.sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
      console.log(
        JSON.stringify(
          {
            ok: true,
            month,
            postId: newest.id,
            title: newest.title?.rendered ?? newest.title,
            date: newest.date,
            link: newest.link,
          },
          null,
          2,
        ),
      );
      return;
    }

    await sleep(POLL_MS);
  }

  throw new Error(`Timed out waiting for ${month} scheduled post`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
