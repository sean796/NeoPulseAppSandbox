import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import { readGbpApiError } from "@/lib/gbp-post/gbp-api-error";

export type GbpCategoryRef = {
  name: string;
  displayName: string;
};

export type GbpCategoriesCurrentOrWritten = {
  primary: GbpCategoryRef | null;
  additional: GbpCategoryRef[];
};

export type GbpRecommendCategoriesInput = {
  gbpLocationId: string;
  siteName: string;
  siteUrl: string;
  keyword: string;
  categoryBenchmarks: Array<{ category: string; top3SharePct?: number }>;
  competitorCategoryHints: Array<{ primary: string; secondary: string }>;
  openRouterApiKey?: string;
};

export type GbpRecommendCategoriesResult = {
  location: string;
  regionCode: string;
  current: GbpCategoriesCurrentOrWritten;
  proposed: {
    primary: GbpCategoryRef;
    additional: GbpCategoryRef[];
  };
  rationale: string;
};

export type GbpApplyCategoriesInput = {
  gbpLocationId: string;
  siteName?: string;
  siteUrl?: string;
  primaryCategoryName: string;
  additionalCategoryNames: string[];
};

export type GbpApplyCategoriesResult = {
  location: string;
  written: GbpCategoriesCurrentOrWritten;
};

function parseCategoryRef(raw: unknown): GbpCategoryRef | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (!name) return null;
  const displayName =
    typeof row.displayName === "string" && row.displayName.trim()
      ? row.displayName.trim()
      : name;
  return { name, displayName };
}

function parseCategoriesBlock(raw: unknown): GbpCategoriesCurrentOrWritten {
  if (!raw || typeof raw !== "object") {
    return { primary: null, additional: [] };
  }
  const row = raw as Record<string, unknown>;
  const primary = parseCategoryRef(row.primary);
  const additional = Array.isArray(row.additional)
    ? row.additional.map(parseCategoryRef).filter((c): c is GbpCategoryRef => c != null)
    : [];
  return { primary, additional };
}

export function buildRecommendCategoriesBody(input: GbpRecommendCategoriesInput): Record<string, unknown> {
  const gbpLocationId = input.gbpLocationId.trim();
  const siteName = input.siteName.trim();
  const siteUrl = input.siteUrl.trim();
  const benchmarks = input.categoryBenchmarks
    .map((b) => ({
      category: String(b.category ?? "").trim(),
      ...(typeof b.top3SharePct === "number" && Number.isFinite(b.top3SharePct)
        ? { top3SharePct: b.top3SharePct }
        : {}),
    }))
    .filter((b) => b.category !== "");
  if (benchmarks.length === 0) {
    throw new Error("No category benchmarks from the Local Grid report.");
  }
  if (!gbpLocationId && !siteUrl && !siteName) {
    throw new Error("GBP location ID or site URL is required.");
  }
  return {
    ...(gbpLocationId ? { gbpLocationId } : {}),
    siteName,
    siteUrl,
    keyword: input.keyword.trim(),
    categoryBenchmarks: benchmarks,
    competitorCategoryHints: input.competitorCategoryHints
      .map((h) => ({
        primary: String(h.primary ?? "").trim(),
        secondary: String(h.secondary ?? "").trim(),
      }))
      .filter((h) => h.primary !== "" || h.secondary !== ""),
    ...(input.openRouterApiKey?.trim()
      ? { openRouterApiKey: input.openRouterApiKey.trim() }
      : {}),
  };
}

export function parseRecommendCategoriesResponse(
  data: Record<string, unknown>,
  response: Response,
): GbpRecommendCategoriesResult {
  if (!response.ok || !data.success) {
    throw new Error(readGbpApiError(data, response, "Failed to recommend GBP categories"));
  }
  const proposedRaw =
    data.proposed && typeof data.proposed === "object"
      ? (data.proposed as Record<string, unknown>)
      : null;
  const primary = proposedRaw ? parseCategoryRef(proposedRaw.primary) : null;
  if (!primary) {
    throw new Error("GBP category recommendation returned no primary category.");
  }
  const additional = proposedRaw && Array.isArray(proposedRaw.additional)
    ? proposedRaw.additional.map(parseCategoryRef).filter((c): c is GbpCategoryRef => c != null)
    : [];
  return {
    location: typeof data.location === "string" ? data.location : "",
    regionCode: typeof data.regionCode === "string" ? data.regionCode : "",
    current: parseCategoriesBlock(data.current),
    proposed: { primary, additional },
    rationale: typeof data.rationale === "string" ? data.rationale.trim() : "",
  };
}

export function buildApplyCategoriesBody(input: GbpApplyCategoriesInput): Record<string, unknown> {
  const gbpLocationId = input.gbpLocationId.trim();
  const primaryCategoryName = input.primaryCategoryName.trim();
  if (!gbpLocationId) {
    throw new Error("Google Business Profile Location ID is required.");
  }
  if (!primaryCategoryName) {
    throw new Error("Primary category is required.");
  }
  return {
    gbpLocationId,
    ...(input.siteName?.trim() ? { siteName: input.siteName.trim() } : {}),
    ...(input.siteUrl?.trim() ? { siteUrl: input.siteUrl.trim() } : {}),
    primaryCategoryName,
    additionalCategoryNames: input.additionalCategoryNames
      .map((n) => n.trim())
      .filter((n) => n !== "" && n !== primaryCategoryName),
  };
}

export function parseApplyCategoriesResponse(
  data: Record<string, unknown>,
  response: Response,
): GbpApplyCategoriesResult {
  if (!response.ok || !data.success) {
    throw new Error(readGbpApiError(data, response, "Failed to apply GBP categories"));
  }
  return {
    location: typeof data.location === "string" ? data.location : "",
    written: parseCategoriesBlock(data.written),
  };
}

export async function recommendGbpCategories(
  input: GbpRecommendCategoriesInput,
): Promise<GbpRecommendCategoriesResult> {
  const body = buildRecommendCategoriesBody(input);
  const res = await fetch(`${BACKEND_API_BASE}/api/gmb/recommend-categories`, {
    method: "POST",
    credentials: "include",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return parseRecommendCategoriesResponse(data, res);
}

export async function applyGbpCategories(
  input: GbpApplyCategoriesInput,
): Promise<GbpApplyCategoriesResult> {
  const body = buildApplyCategoriesBody(input);
  const res = await fetch(`${BACKEND_API_BASE}/api/gmb/apply-categories`, {
    method: "POST",
    credentials: "include",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return parseApplyCategoriesResponse(data, res);
}

export type GbpWriteCategoriesResult = GbpApplyCategoriesResult & {
  rationale: string;
  proposed: {
    primary: GbpCategoryRef;
    additional: GbpCategoryRef[];
  };
};

export function parseWriteCategoriesResponse(
  data: Record<string, unknown>,
  response: Response,
): GbpWriteCategoriesResult {
  if (!response.ok || !data.success) {
    throw new Error(readGbpApiError(data, response, "Failed to write GBP categories"));
  }
  const applied = parseApplyCategoriesResponse(data, response);
  const proposedRaw =
    data.proposed && typeof data.proposed === "object"
      ? (data.proposed as Record<string, unknown>)
      : null;
  const primary = proposedRaw ? parseCategoryRef(proposedRaw.primary) : null;
  if (!primary) {
    throw new Error("GBP category write returned no primary category.");
  }
  const additional =
    proposedRaw && Array.isArray(proposedRaw.additional)
      ? proposedRaw.additional.map(parseCategoryRef).filter((c): c is GbpCategoryRef => c != null)
      : [];
  return {
    ...applied,
    rationale: typeof data.rationale === "string" ? data.rationale.trim() : "",
    proposed: { primary, additional },
  };
}

/** Recommend + patch GBP categories in one server call (no preview step). */
export async function writeGbpCategories(
  input: GbpRecommendCategoriesInput,
): Promise<GbpWriteCategoriesResult> {
  const body = buildRecommendCategoriesBody(input);
  const res = await fetch(`${BACKEND_API_BASE}/api/gmb/write-categories`, {
    method: "POST",
    credentials: "include",
    headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return parseWriteCategoriesResponse(data, res);
}
