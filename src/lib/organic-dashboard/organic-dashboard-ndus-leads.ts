import { formatCanadianNumber } from "@/lib/gsc-reporting/gsc-number-format";
import type { OrganicGscMetricDelta } from "@/lib/organic-dashboard/organic-dashboard-view-model";
import type {
  OrganicDashboardNdusLeadsPayload,
  OrganicDashboardNdusLeadsPeriod,
} from "@/lib/organic-dashboard/organic-dashboard-types";
import { isOrganicSkippedBlock } from "@/lib/organic-dashboard/organic-dashboard-types";

const EM = "—";
const EMPTY_DELTA: OrganicGscMetricDelta = { deltaPercent: null, deltaPositive: null };

/** Organic Website Leads: Google search only (must match server allowlist). */
export const ORGANIC_SEO_LEAD_SOURCES = ["google_organic"] as const;

export type OrganicSeoLeadSource = (typeof ORGANIC_SEO_LEAD_SOURCES)[number];

export type OrganicNdusLeadsTableRow = {
  label: string;
  current: string;
  previous: string;
  delta: OrganicGscMetricDelta;
};

export type OrganicNdusLeadsBreakdownRow = {
  key: string;
  label: string;
  count: number;
  sharePercent: number | null;
};

export type OrganicNdusLeadsSummary = {
  leads: number;
  compareLeads: number | null;
  leadsLabel: string;
  compareLeadsLabel: string;
  leadsDelta: OrganicGscMetricDelta;
  bySource: OrganicNdusLeadsBreakdownRow[];
  byForm: OrganicNdusLeadsBreakdownRow[];
  siteName: string;
  siteUrl: string;
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

export function sumOrganicSeoSources(
  bySource: Record<string, number> | null | undefined,
): number {
  if (!bySource || typeof bySource !== "object") return 0;
  let total = 0;
  for (const key of ORGANIC_SEO_LEAD_SOURCES) {
    const n = Number(bySource[key]);
    if (Number.isFinite(n) && n > 0) total += n;
  }
  return total;
}

/**
 * Aggregate day-level by_source maps into organic SEO totals.
 * When a day mixes paid + organic, only organic keys count toward leads;
 * by_form is taken only from all-organic days.
 */
export function aggregateOrganicSeoLeadDays(
  days: Array<{
    by_source?: Record<string, number>;
    by_form?: Record<string, number>;
    spam?: number;
  }>,
): { leads: number; spam: number; by_source: Record<string, number>; by_form: Record<string, number> } {
  const allow = new Set<string>(ORGANIC_SEO_LEAD_SOURCES);
  const out = {
    leads: 0,
    spam: 0,
    by_source: {} as Record<string, number>,
    by_form: {} as Record<string, number>,
  };
  for (const day of days) {
    out.spam += Number(day.spam) || 0;
    const bySource = day.by_source ?? {};
    const byForm = day.by_form ?? {};
    let dayOrganic = 0;
    let allOrganic = true;
    for (const [key, raw] of Object.entries(bySource)) {
      const n = Number(raw) || 0;
      if (n <= 0) continue;
      if (!allow.has(key)) {
        allOrganic = false;
        continue;
      }
      dayOrganic += n;
      out.by_source[key] = (out.by_source[key] ?? 0) + n;
    }
    out.leads += dayOrganic;
    if (allOrganic && dayOrganic > 0) {
      for (const [key, raw] of Object.entries(byForm)) {
        const n = Number(raw) || 0;
        if (n <= 0) continue;
        out.by_form[key] = (out.by_form[key] ?? 0) + n;
      }
    }
  }
  return out;
}

function parsePeriod(raw: unknown): OrganicDashboardNdusLeadsPeriod | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const bySource =
    p.by_source && typeof p.by_source === "object"
      ? (p.by_source as Record<string, number>)
      : {};
  const byForm =
    p.by_form && typeof p.by_form === "object" ? (p.by_form as Record<string, number>) : {};
  return {
    leads: Number(p.leads) || 0,
    spam: Number(p.spam) || 0,
    by_source: bySource,
    by_form: byForm,
  };
}

function breakdownRows(
  counts: Record<string, number>,
  labels: Record<string, string> | undefined,
  total: number,
  limit = 8,
): OrganicNdusLeadsBreakdownRow[] {
  return Object.entries(counts)
    .map(([key, count]) => ({
      key,
      label: labels?.[key]?.trim() || key,
      count: Number(count) || 0,
      sharePercent: total > 0 ? Math.round(((Number(count) || 0) * 100) / total) : null,
    }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function readOrganicNdusLeadsPayload(
  block: OrganicDashboardNdusLeadsPayload | undefined,
):
  | { ok: true; data: Exclude<OrganicDashboardNdusLeadsPayload, { skipped: true }> }
  | { ok: false; error: string | null } {
  if (!block || isOrganicSkippedBlock(block)) {
    return { ok: false, error: isOrganicSkippedBlock(block) ? block.error ?? null : null };
  }
  if (!block.success || !block.primary) {
    return { ok: false, error: "Organic Website Leads payload was incomplete." };
  }
  return { ok: true, data: block };
}

export function buildNdusLeadsSummary(
  payload: Exclude<OrganicDashboardNdusLeadsPayload, { skipped: true }>,
  showCompare: boolean,
): OrganicNdusLeadsSummary | null {
  const primary = parsePeriod(payload.primary);
  if (!primary) return null;
  // Re-sum from allowlisted organic keys only; never trust imported/paid totals.
  const leads = sumOrganicSeoSources(primary.by_source);
  if (leads <= 0) return null;
  const compare = showCompare ? parsePeriod(payload.compare) : null;
  const compareLeads = compare ? sumOrganicSeoSources(compare.by_source) : null;
  const organicBySource: Record<string, number> = {};
  for (const key of ORGANIC_SEO_LEAD_SOURCES) {
    const n = Number(primary.by_source[key]) || 0;
    if (n > 0) organicBySource[key] = n;
  }
  return {
    leads,
    compareLeads,
    leadsLabel: formatCanadianNumber(leads),
    compareLeadsLabel: compareLeads == null ? EM : formatCanadianNumber(compareLeads),
    leadsDelta: deltaFromPair(leads, compareLeads),
    bySource: breakdownRows(organicBySource, payload.labels, leads),
    byForm: [],
    siteName: payload.siteName?.trim() || "",
    siteUrl: payload.siteUrl?.trim() || "",
  };
}

export function buildNdusLeadsTable(
  summary: OrganicNdusLeadsSummary | null,
  showCompare: boolean,
): OrganicNdusLeadsTableRow[] {
  if (!summary) return [];
  const rows: OrganicNdusLeadsTableRow[] = [
    {
      label: "Organic Website Leads",
      current: summary.leadsLabel,
      previous: summary.compareLeadsLabel,
      delta: summary.leadsDelta,
    },
  ];
  if (!showCompare) {
    return rows.map((r) => ({ ...r, previous: EM, delta: EMPTY_DELTA }));
  }
  return rows;
}

export function formatNdusLeadsLoadError(
  block: OrganicDashboardNdusLeadsPayload | undefined,
): string | null {
  if (!block) return null;
  if (isOrganicSkippedBlock(block)) {
    return block.error?.trim() || `Organic Website Leads skipped (${block.reason}).`;
  }
  return null;
}
