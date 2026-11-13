import type { QuarterEditorialTileStats } from "@/lib/wordpress-api/types";

export function postsStripLoading(stats: QuarterEditorialTileStats): boolean {
  return stats.loading;
}

export function entityStripLoading(stats: QuarterEditorialTileStats, showEntityCount: boolean): boolean {
  return stats.loading && showEntityCount;
}

export function quarterPairTotalForStrip(
  a: number | null,
  b: number | null,
  loading: boolean,
): number | null {
  if (loading) return null;
  if (typeof a === "number" && Number.isFinite(a) && typeof b === "number" && Number.isFinite(b)) {
    return a + b;
  }
  if (a === null || b === null) return null;
  return a + b;
}

export function formatQuarterCountCell(n: number | null, _loading: boolean): string {
  if (typeof n === "number" && Number.isFinite(n)) return String(n);
  return "0";
}

/** Document icon total = published in month + scheduled in month. */
export function editorialPostsMonthBreakdown(
  published: number | null,
  scheduled: number | null,
  loading: boolean,
): { total: number | null; summary: string } {
  const total = quarterPairTotalForStrip(published, scheduled, loading);
  if (loading && total === null) {
    return { total: null, summary: "" };
  }
  const pub = typeof published === "number" && Number.isFinite(published) ? published : 0;
  const sched = typeof scheduled === "number" && Number.isFinite(scheduled) ? scheduled : 0;
  const t = typeof total === "number" ? total : pub + sched;
  return {
    total: t,
    summary: `${pub} published + ${sched} scheduled (${t} in month)`,
  };
}
