import { loadSemrushApiKeyForAppRequests } from "@/lib/api";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import { backendApiUrl } from "@/lib/wordpress-api/connection";
import type {
  OrganicDashboardBundleResponse,
  OrganicDashboardFetchParams,
  OrganicDashboardSkippedBlock,
  OrganicDashboardSourceStatus,
} from "@/lib/organic-dashboard/organic-dashboard-types";
import { isOrganicSkippedBlock } from "@/lib/organic-dashboard/organic-dashboard-types";

const ORGANIC_DASHBOARD_CLIENT_TIMEOUT_MS = 120_000;

type OrganicDashboardPart = "ga4" | "gsc" | "semrush" | "googleAds" | "ndusLeads" | "gmbLeads";

export class OrganicDashboardFetchPartUnsupportedError extends Error {
  readonly code = "ORGANIC_FETCH_PART_UNSUPPORTED";

  constructor() {
    super("Organic dashboard fetch-part is not available on this API host.");
    this.name = "OrganicDashboardFetchPartUnsupportedError";
  }
}

function organicDashboardRequestHeaders(): Headers {
  // Session Bearer must accompany the cookie: hub routes 401 without it.
  const headers = neoPulseApiHeaders({ "Content-Type": "application/json" });
  const key = loadSemrushApiKeyForAppRequests();
  if (key) {
    headers.set("X-Semrush-Api-Key", key);
  }
  return headers;
}

function isPartialRequestStub(block: unknown): block is OrganicDashboardSkippedBlock {
  return isOrganicSkippedBlock(block) && block.reason === "partial_request";
}

function isFetchPartNotFound(response: Response): boolean {
  return response.status === 404;
}

export function mergeOrganicDashboardBundleParts(
  parts: OrganicDashboardBundleResponse[],
): OrganicDashboardBundleResponse {
  const meta =
    parts.map((p) => p.meta).find((m) => m && typeof m.fetchedAt === "string") ?? parts[0]?.meta;

  const pick = <K extends OrganicDashboardPart>(
    key: K,
  ): OrganicDashboardBundleResponse[K] | undefined => {
    for (const part of parts) {
      const block = part[key];
      if (block !== undefined && !isPartialRequestStub(block)) {
        return block;
      }
    }
    return undefined;
  };

  const sourceFromParts = (key: OrganicDashboardPart): OrganicDashboardSourceStatus | undefined => {
    for (const part of parts) {
      const status = part.sources?.[key];
      if (status && status !== "skipped") {
        return status;
      }
    }
    for (const part of parts) {
      const status = part.sources?.[key];
      if (status) {
        return status;
      }
    }
    return undefined;
  };

  const googleAdsPick = (): OrganicDashboardBundleResponse["googleAds"] => {
    for (const part of parts) {
      const block = part.googleAds;
      if (block !== undefined && !isPartialRequestStub(block)) {
        return block;
      }
    }
    return undefined;
  };

  const ndusLeadsPick = (): OrganicDashboardBundleResponse["ndusLeads"] => {
    for (const part of parts) {
      const block = part.ndusLeads;
      if (block !== undefined && !isPartialRequestStub(block)) {
        return block;
      }
    }
    return undefined;
  };

  const gmbLeadsPick = (): OrganicDashboardBundleResponse["gmbLeads"] => {
    for (const part of parts) {
      const block = part.gmbLeads;
      if (block !== undefined && !isPartialRequestStub(block)) {
        return block;
      }
    }
    return undefined;
  };

  const googleAdsSource = (): OrganicDashboardSourceStatus | undefined => {
    for (const part of parts) {
      const status = part.sources?.googleAds;
      if (status && status !== "skipped") {
        return status;
      }
    }
    for (const part of parts) {
      const status = part.sources?.googleAds;
      if (status) {
        return status;
      }
    }
    return undefined;
  };

  const ndusLeadsSource = (): OrganicDashboardSourceStatus | undefined => {
    for (const part of parts) {
      const status = part.sources?.ndusLeads;
      if (status && status !== "skipped") {
        return status;
      }
    }
    for (const part of parts) {
      const status = part.sources?.ndusLeads;
      if (status) {
        return status;
      }
    }
    return undefined;
  };

  const gmbLeadsSource = (): OrganicDashboardSourceStatus | undefined => {
    for (const part of parts) {
      const status = part.sources?.gmbLeads;
      if (status && status !== "skipped") {
        return status;
      }
    }
    for (const part of parts) {
      const status = part.sources?.gmbLeads;
      if (status) {
        return status;
      }
    }
    return undefined;
  };

  return {
    success: true,
    meta,
    ga4: pick("ga4"),
    gsc: pick("gsc"),
    semrush: pick("semrush"),
    googleAds: googleAdsPick(),
    ndusLeads: ndusLeadsPick(),
    gmbLeads: gmbLeadsPick(),
    sources: {
      ga4: sourceFromParts("ga4") ?? "skipped",
      gsc: sourceFromParts("gsc") ?? "skipped",
      semrush: sourceFromParts("semrush") ?? "skipped",
      googleAds: googleAdsSource() ?? "skipped",
      ndusLeads: ndusLeadsSource() ?? "skipped",
      gmbLeads: gmbLeadsSource() ?? "skipped",
    },
  };
}

async function fetchOrganicDashboardMonolith(
  params: OrganicDashboardFetchParams,
  signal: AbortSignal,
): Promise<OrganicDashboardBundleResponse> {
  const response = await fetch(backendApiUrl("/organic-dashboard/fetch"), {
    method: "POST",
    credentials: "include",
    headers: organicDashboardRequestHeaders(),
    body: JSON.stringify(params),
    signal,
  });

  const data = (await response.json().catch(() => ({}))) as OrganicDashboardBundleResponse & {
    error?: string;
  };

  if (!response.ok || data.success === false) {
    const message =
      typeof data.error === "string" && data.error.trim()
        ? data.error.trim()
        : `Organic dashboard HTTP ${response.status}`;
    throw new Error(message);
  }

  return data;
}

async function fetchOrganicDashboardPart(
  params: OrganicDashboardFetchParams,
  part: OrganicDashboardPart,
  signal: AbortSignal,
): Promise<OrganicDashboardBundleResponse> {
  const response = await fetch(backendApiUrl("/organic-dashboard/fetch-part"), {
    method: "POST",
    credentials: "include",
    headers: organicDashboardRequestHeaders(),
    body: JSON.stringify({ ...params, part }),
    signal,
  });

  const data = (await response.json().catch(() => ({}))) as OrganicDashboardBundleResponse & {
    error?: string;
    path?: string;
  };

  if (isFetchPartNotFound(response)) {
    throw new OrganicDashboardFetchPartUnsupportedError();
  }

  if (!response.ok || data.success === false) {
    const message =
      typeof data.error === "string" && data.error.trim()
        ? data.error.trim()
        : `Organic dashboard ${part} HTTP ${response.status}`;
    throw new Error(message);
  }

  return data;
}

const ORGANIC_DASHBOARD_PARTS: OrganicDashboardPart[] = [
  "ga4",
  "gsc",
  "semrush",
  "googleAds",
  "ndusLeads",
  "gmbLeads",
];

/** One failed part must not blank the whole report; merge a skipped/error stub instead. */
function organicDashboardPartFailureStub(
  part: OrganicDashboardPart,
  error: unknown,
): OrganicDashboardBundleResponse {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : `Organic dashboard ${part} failed`;
  const sources: NonNullable<OrganicDashboardBundleResponse["sources"]> = {
    ga4: "skipped",
    gsc: "skipped",
    semrush: "skipped",
    googleAds: "skipped",
    ndusLeads: "skipped",
    gmbLeads: "skipped",
  };
  sources[part] = "error";
  return {
    success: true,
    [part]: {
      skipped: true,
      reason: "part_error",
      error: message,
    },
    sources,
  };
}

async function fetchOrganicDashboardViaParts(
  params: OrganicDashboardFetchParams,
  signal: AbortSignal,
): Promise<OrganicDashboardBundleResponse> {
  const settled = await Promise.allSettled(
    ORGANIC_DASHBOARD_PARTS.map((part) => fetchOrganicDashboardPart(params, part, signal)),
  );

  const parts: OrganicDashboardBundleResponse[] = [];
  let unsupportedCount = 0;
  let firstFatal: unknown = null;

  for (let i = 0; i < settled.length; i += 1) {
    const result = settled[i]!;
    const part = ORGANIC_DASHBOARD_PARTS[i]!;
    if (result.status === "fulfilled") {
      parts.push(result.value);
      continue;
    }
    if (result.reason instanceof OrganicDashboardFetchPartUnsupportedError) {
      unsupportedCount += 1;
      continue;
    }
    if (!firstFatal) firstFatal = result.reason;
    parts.push(organicDashboardPartFailureStub(part, result.reason));
  }

  if (parts.length === 0) {
    if (unsupportedCount === ORGANIC_DASHBOARD_PARTS.length) {
      throw new OrganicDashboardFetchPartUnsupportedError();
    }
    throw firstFatal instanceof Error
      ? firstFatal
      : new Error("Organic dashboard parts failed");
  }

  return mergeOrganicDashboardBundleParts(parts);
}

function normalizedAdsCustomerIdFromParams(params: OrganicDashboardFetchParams): string {
  return (params.googleAdsCustomerId ?? "").replace(/\D/g, "");
}

/** Monolith or stale part merges can omit googleAds even when the property is configured. */
async function supplementMissingGoogleAdsPart(
  params: OrganicDashboardFetchParams,
  bundle: OrganicDashboardBundleResponse,
  signal: AbortSignal,
): Promise<OrganicDashboardBundleResponse> {
  if (bundle.googleAds !== undefined) return bundle;
  if (normalizedAdsCustomerIdFromParams(params).length !== 10) return bundle;
  try {
    const adsPart = await fetchOrganicDashboardPart(params, "googleAds", signal);
    return mergeOrganicDashboardBundleParts([bundle, adsPart]);
  } catch (error) {
    if (error instanceof OrganicDashboardFetchPartUnsupportedError) {
      return bundle;
    }
    throw error;
  }
}

export async function fetchOrganicDashboardBundle(
  params: OrganicDashboardFetchParams,
): Promise<OrganicDashboardBundleResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ORGANIC_DASHBOARD_CLIENT_TIMEOUT_MS);

  try {
    let bundle: OrganicDashboardBundleResponse;
    try {
      bundle = await fetchOrganicDashboardViaParts(params, controller.signal);
    } catch (error) {
      if (error instanceof OrganicDashboardFetchPartUnsupportedError) {
        bundle = await fetchOrganicDashboardMonolith(params, controller.signal);
      } else {
        throw error;
      }
    }
    return supplementMissingGoogleAdsPart(params, bundle, controller.signal);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        "Organic dashboard load timed out after 2 minutes. Try a shorter date range or reload.",
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
