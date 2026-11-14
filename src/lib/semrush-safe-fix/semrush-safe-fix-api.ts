import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

export type SemrushSafeFixRunResult = {
  ok?: boolean;
  started?: boolean;
  error?: string;
  runId?: number;
  runIds?: number[];
  fixed?: number;
  failed?: number;
  skipped?: number;
};

export async function runSemrushSafeFix(opts: {
  siteId: string;
  siteName?: string;
  siteUrl: string;
  username: string;
  appPassword: string;
  semrushSiteAuditProjectId?: string;
  teamId?: number;
}): Promise<SemrushSafeFixRunResult> {
  const res = await fetch(backendApiUrl("/semrush-safe-fix/run"), {
    method: "POST",
    credentials: "include",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      siteId: opts.siteId,
      siteName: opts.siteName,
      siteUrl: opts.siteUrl,
      username: opts.username,
      appPassword: opts.appPassword,
      semrushSiteAuditProjectId: opts.semrushSiteAuditProjectId,
      teamId: opts.teamId,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as SemrushSafeFixRunResult;
  const runId =
    typeof data.runId === "number" && data.runId > 0
      ? data.runId
      : Array.isArray(data.runIds) && typeof data.runIds[0] === "number"
        ? data.runIds[0]
        : undefined;

  // 202 = task created and work continues in the background.
  if (res.ok || res.status === 202) {
    return { ...data, ok: true, started: true, runId };
  }

  // Keep runId even when the HTTP status is an error so Task Manager can track it.
  return {
    ...data,
    ok: false,
    runId,
    error: data.error || `HTTP ${res.status}`,
  };
}
