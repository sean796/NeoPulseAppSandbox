import type { WordPressSite } from "@/components/integrations/types";
import { BENCHMARK_CATEGORY_TAG_BY_HOST_LABEL } from "@/lib/benchmark-category-tag-defaults";
import { siteHostLabel } from "@/lib/wp-engine-install-defaults";
import { readSiteBenchmarkCustomTag } from "@/lib/vertical-benchmark/client-tag-from-site";

/** Hosts that sell blinds while tagged Interior design. */
const EXTRA_BLINDS_HOSTS = new Set(["tailoredinteriors", "interiorsbylaura"]);

function isWindowTreatmentsLabel(label: string): boolean {
  return label.trim().toLocaleLowerCase() === "window treatments";
}

/** True when Details drawer and content inject should apply this skill. */
export function siteUsesWindowTreatmentsSkill(
  site: Pick<WordPressSite, "id" | "name" | "siteUrl" | "productionSiteUrl" | "benchmarkCustomTag" | "industryVertical"> | null | undefined,
): boolean {
  if (!site) return false;
  const host = siteHostLabel(site as WordPressSite);
  if (host && EXTRA_BLINDS_HOSTS.has(host)) return true;
  if (host && isWindowTreatmentsLabel(BENCHMARK_CATEGORY_TAG_BY_HOST_LABEL[host] ?? "")) {
    return true;
  }
  const tag = readSiteBenchmarkCustomTag(site as WordPressSite);
  if (isWindowTreatmentsLabel(tag)) return true;
  const vertical = String(site.industryVertical ?? "").trim();
  return isWindowTreatmentsLabel(vertical);
}
