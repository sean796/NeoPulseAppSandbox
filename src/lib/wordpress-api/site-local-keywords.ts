import type { WordPressSite } from "@/components/integrations/types";

export type SiteLocalKeyword = {
  id: string;
  keyword: string;
  locationId?: string;
};

function asCleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Read local keywords; seed from primaryLocalKeyword when the list is empty. */
export function readSiteLocalKeywords(site?: WordPressSite | null): SiteLocalKeyword[] {
  const list = site?.localKeywords;
  if (Array.isArray(list) && list.length > 0) {
    return list.map((row, idx) => ({
      id: asCleanString(row.id) || `kw-${site?.id ?? "site"}-${idx + 1}`,
      keyword: asCleanString(row.keyword),
      locationId: asCleanString(row.locationId) || undefined,
    }));
  }
  const primary = asCleanString(site?.primaryLocalKeyword);
  if (!primary) return [];
  return [
    {
      id: `kw-${site?.id ?? "site"}-primary`,
      keyword: primary,
    },
  ];
}

/** Normalize keyword rows and sync primaryLocalKeyword to the first non-empty keyword. */
export function buildSiteLocalKeywordsPatch(
  site: WordPressSite,
  rows: Array<{ id?: string; keyword?: string; locationId?: string | null }>,
): Pick<WordPressSite, "localKeywords" | "primaryLocalKeyword"> {
  const locationIds = new Set(
    (site.locations ?? site.napInfo?.locations ?? [])
      .map((loc) => asCleanString(loc.id))
      .filter(Boolean),
  );

  const localKeywords: SiteLocalKeyword[] = rows.map((row, idx) => {
    const locationId = asCleanString(row.locationId);
    return {
      id: asCleanString(row.id) || `kw-${site.id}-${idx + 1}`,
      keyword: asCleanString(row.keyword),
      locationId: locationId && locationIds.has(locationId) ? locationId : undefined,
    };
  });

  const primary = localKeywords.find((row) => row.keyword)?.keyword;
  return {
    localKeywords,
    primaryLocalKeyword: primary || undefined,
  };
}

/** Drop assignments that point at deleted locations. */
export function clearStaleKeywordLocationIds(
  site: WordPressSite,
  locations: Array<{ id?: string }> = site.locations ?? site.napInfo?.locations ?? [],
): Pick<WordPressSite, "localKeywords" | "primaryLocalKeyword"> | null {
  const keywords = readSiteLocalKeywords(site);
  if (keywords.length === 0) return null;
  const locationIds = new Set(locations.map((loc) => asCleanString(loc.id)).filter(Boolean));
  const next = keywords.map((row) => ({
    ...row,
    locationId: row.locationId && locationIds.has(row.locationId) ? row.locationId : undefined,
  }));
  const changed = next.some((row, idx) => row.locationId !== keywords[idx]?.locationId);
  if (!changed) return null;
  return buildSiteLocalKeywordsPatch(site, next);
}
