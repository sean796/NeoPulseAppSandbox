import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";

export type PostsContentGapRunResult = {
  ok?: boolean;
  started?: boolean;
  error?: string;
  runId?: number;
  runIds?: number[];
};

export async function runPostsContentGapCheck(opts: {
  siteId: string;
  siteName?: string;
  siteUrl: string;
  username: string;
  appPassword: string;
  teamId?: number;
}): Promise<PostsContentGapRunResult> {
  const res = await fetch(backendApiUrl("/posts-content-gap-check/run"), {
    method: "POST",
    credentials: "include",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      siteId: opts.siteId,
      siteName: opts.siteName,
      siteUrl: opts.siteUrl,
      username: opts.username,
      appPassword: opts.appPassword,
      teamId: opts.teamId,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as PostsContentGapRunResult;
  const runId =
    typeof data.runId === "number" && data.runId > 0
      ? data.runId
      : Array.isArray(data.runIds) && typeof data.runIds[0] === "number"
        ? data.runIds[0]
        : undefined;

  if (res.ok || res.status === 202) {
    return { ...data, ok: true, started: true, runId };
  }

  return {
    ...data,
    ok: false,
    runId,
    error: data.error || `HTTP ${res.status}`,
  };
}
