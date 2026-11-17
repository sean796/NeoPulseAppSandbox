import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import { logger } from "@/lib/logger";
import type { WordPressSite } from "@/components/integrations/types-wordpress-site";

export type FactCheckerRunResult = {
  ok?: boolean;
  started?: boolean;
  error?: string;
  runId?: number;
  runIds?: number[];
};

export async function runFactChecker(opts: {
  siteId: string;
  siteName?: string;
  siteUrl: string;
  username: string;
  appPassword: string;
  teamId?: number;
  to?: string;
  site?: WordPressSite;
}): Promise<FactCheckerRunResult> {
  const site = opts.site;
  const started = performance.now();
  logger.start(`POST /api/fact-checker/run | ${opts.siteName ?? opts.siteId}`);
  const res = await fetch(backendApiUrl("/fact-checker/run"), {
    method: "POST",
    credentials: "include",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      siteId: opts.siteId,
      siteName: opts.siteName ?? site?.name,
      siteUrl: opts.siteUrl,
      username: opts.username,
      appPassword: opts.appPassword,
      teamId: opts.teamId,
      to: opts.to,
      entitySitemapUrl: site?.entitySitemapUrl,
      manualEndpoint: site?.manualEndpoint,
      serviceCity: site?.serviceCity,
      serviceState: site?.serviceState,
      serviceCountry: site?.serviceCountry,
      locations: site?.locations,
      napInfo: site?.napInfo,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as FactCheckerRunResult;
  logger.success(
    `POST /api/fact-checker/run | ${res.status} | ${((performance.now() - started) / 1000).toFixed(1)}s | ${data.runId ?? data.error ?? ""}`,
  );
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
