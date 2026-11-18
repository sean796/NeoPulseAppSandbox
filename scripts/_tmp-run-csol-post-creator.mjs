/**
 * Start post_creator for Custom Shades (Dec schedule) and wait for a 2026-12 future post.
 * Usage: node scripts/_tmp-run-csol-post-creator.mjs
 */
import fs from "node:fs";
import path from "node:path";
import https from "node:https";

const BASE = "http://localhost:8080/api";
const loginPath = path.join(process.cwd(), ".cursor-tmp-login.json");
const SITE_ID = "wp-1791924906059-17";
const MONTH = "2026-12";
const POLL_MS = 5000;
const MAX_TICKS = 240;

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
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
  return { res, data };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadSite() {
  const seed = readJson(
    path.join(process.cwd(), "src/components/integrations/default-properties-seed.json"),
  );
  const site = seed.sites.find((s) => s.id === SITE_ID);
  if (!site?.appPassword) throw new Error("Custom Shades missing from seed");
  return site;
}

async function listFuture(site) {
  const base = String(site.siteUrl).replace(/\/+$/, "");
  const auth = Buffer.from(`${site.username}:${site.appPassword}`).toString("base64");
  const res = await fetch(
    `${base}/wp-json/wp/v2/posts?status=future&per_page=100&_fields=id,link,slug,title,date,status`,
    { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`WP future ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function main() {
  const { email, password } = readJson(loginPath);
  const site = loadSite();
  const login = await api("/auth/login", {
    method: "POST",
    body: { username: email, email, password },
  });
  if (!login.data.ok) throw new Error(`Login failed: ${JSON.stringify(login.data)}`);
  const token = login.data.sessionToken;
  const me = await api(`/auth/me?_=${Date.now()}`, { token });
  const teamId = me.data.activeTeam?.id ?? me.data.teams?.[0]?.id;
  if (!teamId) throw new Error("No teamId");

  const before = (await listFuture(site)).filter((p) => String(p.date).startsWith(MONTH));
  console.log(`Before ${MONTH}: ${before.length}`);

  const create = await api("/agent-runs", {
    method: "POST",
    token,
    body: {
      teamId,
      source: "pulse_assist",
      recipeKey: "post_creator",
      title: `Custom Shades Blog Ideas ${MONTH}`,
      context: { siteId: site.id, managerTab: "generator" },
      plan: {
        executionMode: "server",
        executionKind: "post_creator",
        executionPayload: {
          postCount: 2,
          scheduleTimesPerMonth: 2,
          keywordSource: "gsc",
          sitemapType: "post",
          featuredImage: true,
          postDestination: "wordpress",
          scheduleFrequency: "custom",
          scheduleCustomStartDate: `${MONTH}-01`,
          scheduleStartDay: 1,
          scheduleStartTime: "09:00",
          schedulePublishDays: [25, 26],
          scheduleStaggerOptimized: true,
          targetBucket: "posts",
          saveLocalArchive: true,
          siteId: site.id,
          wordpressSiteId: site.id,
        },
        site: {
          id: site.id,
          name: site.name,
          siteUrl: site.siteUrl,
          username: site.username,
          appPassword: site.appPassword,
        },
      },
    },
  });
  if (!create.data.ok || !create.data.run?.id) {
    throw new Error(`Create failed: ${JSON.stringify(create.data)}`);
  }
  const runId = create.data.run.id;
  console.log(`runId=${runId}`);

  for (let tick = 0; tick < MAX_TICKS; tick += 1) {
    const proc = await api(`/agent-runs/${runId}/process`, {
      method: "POST",
      token,
      body: { teamId },
    });
    const run = proc.data.run ?? proc.data;
    const server = run?.result?.checkpoint?.server ?? {};
    const label = run?.step?.label ?? run?.errorMessage ?? "";
    console.log(
      `pc[${tick}] status=${run?.status} phase=${server.phase ?? ""} intra=${server.intraRowPhase ?? ""} row=${server.rowIndex ?? ""} uploaded=${server.uploadedPosts?.length ?? 0} label=${String(label).slice(0, 120)}`,
    );

    const future = await listFuture(site);
    const next = future.filter((p) => String(p.date).startsWith(MONTH));
    if (next.length > before.length) {
      const newest = [...next].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
      console.log(
        JSON.stringify(
          {
            ok: true,
            month: MONTH,
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

    if (run?.status === "failed") {
      throw new Error(`post_creator failed: ${run.errorMessage || label}`);
    }
    if (run?.status === "done" && next.length <= before.length) {
      throw new Error(`post_creator done but no ${MONTH} scheduled post`);
    }

    await sleep(POLL_MS);
  }
  throw new Error(`Timed out waiting for ${MONTH} post`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
