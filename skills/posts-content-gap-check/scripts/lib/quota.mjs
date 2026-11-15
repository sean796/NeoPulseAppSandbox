/** Blog quota from site editorial package (no tier names in output). */

const QUOTAS = {
  standard: { blogsPerMonth: 2 },
  lite: { blogsPerMonth: 1 },
};

const STANDARD_NAMES = new Set(
  [
    "Blind Magic",
    "Lindsey Blinds",
    "Superior Blinds",
    "In the Shade",
    "Interiors by Laura",
    "DM Interiors",
    "Blinds West",
    "KWB",
    "Tailored Interiors",
    "Neo Digital",
    "Shutter Spot",
    "Custom Shades of London",
  ].map(normalizeName),
);

const LITE_NAMES = new Set(
  [
    "Advance Blinds",
    "Superior Tent Rentals",
    "You Junk It... I Dump It",
    "Phoenix Painting",
    "Posh Outdoors",
  ].map(normalizeName),
);

const PUBLISH_TIME_BY_NAME = new Map(
  [
    ["Superior Tent Rentals", "03:00"],
    ["You Junk It... I Dump It", "03:00"],
    ["KWB", "03:00"],
  ].map(([name, time]) => [normalizeName(name), time]),
);

export function normalizeName(raw) {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolvePackageTier(site) {
  const raw = String(site?.editorialContentPackage ?? "").trim();
  if (raw === "standard" || raw === "lite") return raw;
  const norm = normalizeName(site?.name);
  if (!norm) return null;
  if (STANDARD_NAMES.has(norm) || norm.startsWith("dm interiors") || norm.startsWith("superior blinds")) {
    return "standard";
  }
  if (LITE_NAMES.has(norm)) return "lite";
  return null;
}

export function blogsPerMonthForSite(site) {
  const tier = resolvePackageTier(site);
  if (!tier) return null;
  return QUOTAS[tier].blogsPerMonth;
}

export function publishTimeHintForSite(site) {
  const stored = String(site?.editorialPublishTimeLocal ?? "").trim();
  if (/^\d{2}:\d{2}$/.test(stored)) return stored;
  const mapped = PUBLISH_TIME_BY_NAME.get(normalizeName(site?.name));
  return mapped ?? "09:00";
}
