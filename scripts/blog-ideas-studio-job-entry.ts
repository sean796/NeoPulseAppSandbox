#!/usr/bin/env node
/**
 * Headless Blog Ideas Studio: Ideas + create. No UI.
 * Uses the signed-in user's session and their saved settings. No separate worker keys.
 * Env: JOB_PAYLOAD JSON { site, postCount, apiBase, bearerToken }
 */
function ensureViteEnvShim(): void {
  if (typeof import.meta === "undefined") return;
  const meta = import.meta as ImportMeta & { env?: Record<string, string | boolean> };
  if (meta.env) return;
  meta.env = {
    DEV: false,
    PROD: true,
    MODE: "production",
    VITE_BASE_PATH: "",
    VITE_BACKEND_API_BASE: process.env.VITE_BACKEND_API_BASE?.trim() ?? "",
    VITE_MCP_API_BASE: "",
    VITE_NEO_PULSE: "",
    VITE_OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY?.trim() ?? "",
  };
}

const raw = process.env.JOB_PAYLOAD?.trim() ?? "";
if (!raw) {
  console.error("[blog-ideas-studio] Missing JOB_PAYLOAD");
  process.exit(1);
}

type JobPayload = {
  site: import("../src/components/integrations/types").WordPressSite;
  postCount: number;
  apiBase: string;
  bearerToken: string;
};

let payload: JobPayload;
try {
  payload = JSON.parse(raw) as JobPayload;
} catch {
  console.error("[blog-ideas-studio] Invalid JOB_PAYLOAD JSON");
  process.exit(1);
}

const apiBaseRaw = typeof payload.apiBase === "string" ? payload.apiBase.trim() : "";
const apiBase = apiBaseRaw.replace(/\/api\/?$/, "").replace(/\/+$/, "");
if (apiBase) {
  // Origin only — backendApiUrl prepends /api.
  process.env.VITE_BACKEND_API_BASE = apiBase;
  try {
    if (/\.local$/i.test(new URL(apiBase).hostname)) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
  } catch {
    /* ignore */
  }
  payload = { ...payload, apiBase };
}

ensureViteEnvShim();
if (apiBase && typeof import.meta !== "undefined") {
  const meta = import.meta as ImportMeta & { env?: Record<string, string | boolean> };
  if (meta.env) meta.env.VITE_BACKEND_API_BASE = apiBase;
}

const { setSessionToken } = await import("../src/lib/auth-device.ts");
const { backendApiUrl, setPostCreatorWorkerApiBase } = await import(
  "../src/lib/wordpress-api/connection.ts"
);
const { hydrateRuntimeApiKeysFromCloud, setServerHarnessSitesOverride } = await import(
  "../src/components/integrations/storage.ts"
);
const { loadDataForSEOApiKey } = await import("../src/lib/api.ts");
const { runBlogIdeasStudioBackgroundJob } = await import(
  "../src/lib/bulk/blog-ideas-studio-background-job.ts"
);

const bearerToken = payload.bearerToken?.trim() ?? "";
if (!bearerToken) {
  console.error("[blog-ideas-studio] Sign in required.");
  process.exit(1);
}
setSessionToken(bearerToken);
if (apiBase) setPostCreatorWorkerApiBase(apiBase);
delete process.env.DATAFORSEO_API_KEY;
delete process.env.DATAFORSEO_LOGIN;
delete process.env.OPENROUTER_API_KEY;

const meRes = await fetch(backendApiUrl("/auth/me"), {
  headers: { Authorization: `Bearer ${bearerToken}`, Accept: "application/json" },
});
const me = (await meRes.json().catch(() => ({}))) as {
  activeTeam?: { id?: number };
  teams?: Array<{ id?: number }>;
};
const teamId = me.activeTeam?.id ?? me.teams?.[0]?.id ?? null;
await hydrateRuntimeApiKeysFromCloud(teamId);
if (!loadDataForSEOApiKey()?.trim()) {
  console.error(
    JSON.stringify({
      type: "error",
      message: "Add a DataForSEO API key in Settings.",
    }),
  );
  process.exit(1);
}
setServerHarnessSitesOverride([payload.site]);

const postCount = Math.max(1, Math.floor(Number(payload.postCount) || 0));
console.log(
  JSON.stringify({ type: "step", label: `Blog Ideas Studio: ${postCount} ideas` }),
);

runBlogIdeasStudioBackgroundJob({
  site: payload.site,
  postCount,
  onProgress: (step, progress) => {
    console.log(JSON.stringify({ type: "step", label: step, progress }));
  },
})
  .then((result) => {
    console.log(JSON.stringify({ type: "done", result }));
    if (result.created < postCount) {
      console.error(
        `[blog-ideas-studio] created ${result.created}/${postCount}`,
      );
      process.exit(1);
    }
    process.exit(0);
  })
  .catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ type: "error", message }));
    console.error("[blog-ideas-studio]", message);
    process.exit(1);
  });
