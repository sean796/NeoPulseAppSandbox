import { formatCanadianNumber } from "@/lib/gsc-reporting/gsc-number-format";
import type { OrganicGscMetricDelta } from "@/lib/organic-dashboard/organic-dashboard-view-model-types";
import type {
  OrganicDashboardGmbLeadsPayload,
  OrganicDashboardGmbLeadsPeriod,
} from "@/lib/organic-dashboard/organic-dashboard-types";
import { isOrganicSkippedBlock } from "@/lib/organic-dashboard/organic-dashboard-types";

const EMPTY_DELTA: OrganicGscMetricDelta = { deltaPercent: null, deltaPositive: null };

export const GMB_LEAD_METRIC_KEYS = ["calls", "chat", "directions", "websiteClicks"] as const;

export type OrganicGmbLeadMetricKey = (typeof GMB_LEAD_METRIC_KEYS)[number];

export const GMB_LEAD_LABELS: Record<OrganicGmbLeadMetricKey, string> = {
  calls: "Calls",
  chat: "Chat",
  directions: "Directions",
  websiteClicks: "Website clicks",
};

export type OrganicGmbLeadsSummary = {
  locationId: string;
  primary: OrganicDashboardGmbLeadsPeriod;
  compare: OrganicDashboardGmbLeadsPeriod | null;
};

function deltaFromPair(current: number, previous: number | null): OrganicGscMetricDelta {
  if (previous == null || !Number.isFinite(previous) || previous === 0) {
    if (previous === 0 && current > 0) {
      return { deltaPercent: 100, deltaPositive: true };
    }
    return EMPTY_DELTA;
  }
  const pct = ((current - previous) / previous) * 100;
  if (!Number.isFinite(pct)) return EMPTY_DELTA;
  return { deltaPercent: Math.abs(pct), deltaPositive: pct >= 0 };
}

function parsePeriod(raw: unknown): OrganicDashboardGmbLeadsPeriod | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  return {
    calls: Number(p.calls) || 0,
    chat: Number(p.chat) || 0,
    directions: Number(p.directions) || 0,
    websiteClicks: Number(p.websiteClicks) || 0,
  };
}

export function readOrganicGmbLeadsPayload(
  block: OrganicDashboardGmbLeadsPayload | undefined,
):
  | { ok: true; data: Exclude<OrganicDashboardGmbLeadsPayload, { skipped: true }> }
  | { ok: false; error: string | null } {
  if (!block || isOrganicSkippedBlock(block)) {
    return { ok: false, error: isOrganicSkippedBlock(block) ? block.error ?? null : null };
  }
  if (!block.success || !block.primary) {
    return { ok: false, error: "Google My Business Leads payload was incomplete." };
  }
  return { ok: true, data: block };
}

export function buildGmbLeadsSummary(
  payload: Exclude<OrganicDashboardGmbLeadsPayload, { skipped: true }>,
  showCompare: boolean,
): OrganicGmbLeadsSummary | null {
  const primary = parsePeriod(payload.primary);
  if (!primary) return null;
  const compare = showCompare ? parsePeriod(payload.compare) : null;
  return {
    locationId: payload.locationId?.trim() || "",
    primary,
    compare,
  };
}

export function gmbMetricDelta(
  current: number,
  previous: number | null,
): OrganicGscMetricDelta {
  return deltaFromPair(current, previous);
}

export function formatGmbMetricValue(value: number): string {
  return formatCanadianNumber(value);
}

/** No GBP location id on the property: omit the report section entirely. */
export function isGmbLeadsMissingLocationId(
  block: OrganicDashboardGmbLeadsPayload | undefined,
): boolean {
  return isOrganicSkippedBlock(block) && block.reason === "missing_gbp_location_id";
}

export function formatGmbLeadsLoadError(
  block: OrganicDashboardGmbLeadsPayload | undefined,
): string | null {
  if (!block) return null;
  if (isGmbLeadsMissingLocationId(block)) return null;
  if (isOrganicSkippedBlock(block)) {
    return block.error?.trim() || `Google My Business Leads skipped (${block.reason}).`;
  }
  return null;
}
