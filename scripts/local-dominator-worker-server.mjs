#!/usr/bin/env node
import http from "node:http";
import { execFile } from "node:child_process";
import { handleLocalDominatorExportRequest, sendJson } from "./local-dominator-export-jobs.mjs";
import { handleChatGptAuditRequest } from "./chatgpt-audit-jobs.mjs";
import {
  handleBrowserAutomationRequest,
  handleResidentialProxyStatusRequest,
} from "./browser-automation-jobs.mjs";
import { handlePostCreatorServerRequest } from "./post-creator-server-jobs.mjs";
import { handleBlogIdeasStudioRequest } from "./blog-ideas-studio-jobs.mjs";

const port = Number(process.env.PORT || 10000);
const wpCronUrl = process.env.LOCAL_WP_CRON_URL || "https://neopulse.local/wp-cron.php?doing_wp_cron";
const SCHEDULE_TICK_MS = 5 * 60 * 1000;
const wpCronMs = Number(process.env.LOCAL_WP_CRON_INTERVAL_MS || SCHEDULE_TICK_MS);
const intervalMs = Number.isFinite(wpCronMs) && wpCronMs >= 30000 ? wpCronMs : SCHEDULE_TICK_MS;

function tickWpCron() {
  const bin = process.platform === "win32" ? "curl.exe" : "curl";
  execFile(bin, ["-k", "-s", "-o", process.platform === "win32" ? "NUL" : "/dev/null", wpCronUrl], () => {});
}

function msUntilNextTick(periodMs) {
  const rem = Date.now() % periodMs;
  return rem === 0 ? 0 : periodMs - rem;
}

function startWpCronTicks() {
  const delay = msUntilNextTick(intervalMs);
  const start = () => {
    tickWpCron();
    setInterval(tickWpCron, intervalMs);
  };
  if (delay === 0) {
    start();
    return;
  }
  setTimeout(start, delay);
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-LD-Worker-Token");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const pathname = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;

  if (pathname === "/health" || pathname === "/") {
    sendJson(res, 200, { ok: true, service: "local-dominator-worker" });
    return;
  }

  const handled = await handleLocalDominatorExportRequest(req, res, pathname);
  if (handled) return;

  const chatgptHandled = await handleChatGptAuditRequest(req, res, pathname);
  if (chatgptHandled) return;

  const proxyStatusHandled = await handleResidentialProxyStatusRequest(req, res, pathname);
  if (proxyStatusHandled) return;

  const browserAutomationHandled = await handleBrowserAutomationRequest(req, res, pathname);
  if (browserAutomationHandled) return;

  const postCreatorHandled = await handlePostCreatorServerRequest(req, res, pathname);
  if (postCreatorHandled) return;

  const blogIdeasHandled = await handleBlogIdeasStudioRequest(req, res, pathname);
  if (blogIdeasHandled) return;

  sendJson(res, 404, { ok: false, error: "Not found." });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[local-dominator-worker] listening on 0.0.0.0:${port}`);
  startWpCronTicks();
});
