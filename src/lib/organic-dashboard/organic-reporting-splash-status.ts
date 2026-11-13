import type { BulkSplashVisualKind } from "@/lib/bulk/bulk-splash-status-agent";

const METRICS_STEP = "Loading GA4, Search Console, Semrush & Google Ads metrics";
const HIGHLIGHTS_STEP =
  "Generating AI overview, keyword narrative & SEO opportunities";
const PDF_STEP = "Preparing PDF report download";
const SHARE_STEP = "Publishing client report link";

/** Reporting splash copy and placeholder graphics without OpenRouter (no extra API calls). */
export function resolveReportingSplashStatus(activeStatusText: string): {
  status: string;
  visual: BulkSplashVisualKind;
} {
  const step = activeStatusText.trim();
  if (!step) {
    return { status: "Building your performance report…", visual: "research" };
  }
  if (step === PDF_STEP || step === SHARE_STEP) {
    return { status: step, visual: "publish" };
  }
  if (step === HIGHLIGHTS_STEP) {
    return { status: step, visual: "audit" };
  }
  if (step === METRICS_STEP) {
    return { status: step, visual: "research" };
  }
  return { status: step, visual: "generic" };
}
