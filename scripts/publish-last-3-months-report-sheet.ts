/**
 * Live hub: publish last-3-months organic client report decks (GMB section hidden in template),
 * write CSV, and print sheet rows:
 * Client | Last 3 Month Report | Profile Link | Second Report Link
 *
 * Usage: npx tsx scripts/publish-last-3-months-report-sheet.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setSessionToken } from "../src/lib/auth-device";
import { setPostCreatorWorkerApiBase } from "../src/lib/wordpress-api/connection";
import { buildGa4ReportingRanges } from "../src/lib/reporting/ga4-analytics-date-ranges";
import { buildOrganicDashboardFetchParams } from "../src/lib/organic-dashboard/organic-dashboard-fetch-params";
import { fetchOrganicDashboardBundle } from "../src/lib/organic-dashboard/organic-dashboard-fetch";
import { buildOrganicDashboardViewModel } from "../src/lib/organic-dashboard/organic-dashboard-view-model";
import {
  buildOrganicReportingHighlightsSnapshot,
  normalizeOrganicReportingHighlights,
} from "../src/lib/organic-dashboard/organic-reporting-highlights";
import { publishOrganicClientReportDeckAndBuildShareUrl } from "../src/lib/organic-dashboard/organic-client-report-deck-publish";
import { fetchAllLocalGridScansForSite } from "../src/lib/organic-dashboard/local-grid-client-report";
import type { Ga4ReportingDateHarness } from "../src/components/research/reporting/Ga4ReportingDateRangePopover";
import type { WordPressSite } from "../src/components/integrations/types";
import { resolveOrganicClientReportClientLogoUrl } from "../src/lib/integrations/client-site-logo";
import { normalizeClientLogoBoxTheme } from "../src/lib/organic-dashboard/organic-client-report-property-branding";
import { propertyDashboardSlug, propertyDashboardPath } from "../src/lib/properties/property-dashboard-slug";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_CSV = path.join(REPO_ROOT, "tmp/organic-last-3-months-report-sheet.csv");
const HUB = "https://pulse-host-wp-hub.onrender.com";
const STATIC = "https://neo-pulse-static.onrender.com";
const LOGIN_EMAIL = (process.env.NEO_PULSE_SMOKE_EMAIL || "sean@neodigital.ca").trim();

async function login(): Promise<string> {
  const res = await fetch(`${HUB}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: LOGIN_EMAIL }),
  });
  const data = (await res.json().catch(() => ({}))) as { sessionToken?: string; error?: string };
  if (!res.ok || !data.sessionToken) {
    throw new Error(`Login failed ${res.status}: ${data.error || "no token"}`);
  }
  return data.sessionToken;
}

async function loadSites(token: string): Promise<WordPressSite[]> {
  const res = await fetch(`${HUB}/api/manager-wordpress-properties/load?_=${Date.now()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { sites?: WordPressSite[] };
  if (!res.ok || !Array.isArray(data.sites) || data.sites.length === 0) {
    throw new Error(`Load sites HTTP ${res.status}`);
  }
  return data.sites.filter((s) => !/staging/i.test(`${s.name} ${s.siteUrl}`));
}

const dateHarness: Ga4ReportingDateHarness = {
  primaryPreset: "last_3_months",
  compareBaseline: "previous_period",
  compareEnabled: false,
  compareRangeDraft: buildGa4ReportingRanges({
    primaryPreset: "last_3_months",
    primaryCustom: { startDate: "", endDate: "" },
    compareEnabled: false,
    compareBaseline: "previous_period",
    compareCustom: { startDate: "", endDate: "" },
  }),
};

function csvCell(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

async function publishOne(site: WordPressSite, token: string): Promise<string> {
  setSessionToken(token);
  setPostCreatorWorkerApiBase(HUB);
  const fetchParams = buildOrganicDashboardFetchParams(
    site,
    dateHarness,
    site.ga4PropertyId ?? "",
    site.googleAdsCustomerId,
  );
  if (!fetchParams) throw new Error("Invalid reporting date harness for last_3_months.");

  // Do not pull GMB for this publish pass.
  const bundle = await fetchOrganicDashboardBundle({
    ...fetchParams,
    gbpLocationId: "",
  });
  const viewModel = buildOrganicDashboardViewModel(bundle, {
    showCompare: false,
    googleAdsCustomerIdForReporting: site.googleAdsCustomerId,
  });

  const snapshot = buildOrganicReportingHighlightsSnapshot(viewModel, site.name, site.siteUrl, false, null);
  const hlRes = await fetch(`${HUB}/api/organic-dashboard/reporting-highlights`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ siteId: site.id, snapshot: { ...snapshot, periods: undefined } }),
  });
  const hlData = (await hlRes.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    highlights?: unknown;
  };
  if (!hlRes.ok || hlData.success === false) {
    throw new Error(hlData.error ?? `Highlights HTTP ${hlRes.status}`);
  }
  const highlights = normalizeOrganicReportingHighlights(hlData.highlights);
  if (!highlights) throw new Error("Highlights model returned empty content.");

  let gridScans = await fetchAllLocalGridScansForSite(site.id).catch(() => []);
  const { shareUrl } = await publishOrganicClientReportDeckAndBuildShareUrl({
    siteId: site.id,
    siteDisplayName: site.name,
    sitePublicUrl: site.siteUrl,
    shareState: { section: "performance", ...dateHarness },
    viewModel,
    readyHighlights: highlights,
    showCompare: false,
    localGridScans: gridScans,
    clientLogoUrl: resolveOrganicClientReportClientLogoUrl(site.id, site.clientLogoUrl ?? null, STATIC),
    clientLogoBoxTheme: normalizeClientLogoBoxTheme(site.clientLogoBoxTheme),
    origin: STATIC,
  });
  if (!shareUrl.startsWith(`${STATIC}/`)) throw new Error(`Share link is not on ${STATIC}: ${shareUrl}`);
  return shareUrl;
}

async function main() {
  const token = await login();
  setSessionToken(token);
  setPostCreatorWorkerApiBase(HUB);
  const sites = await loadSites(token);
  const rows: Array<{ client: string; report: string; profile: string; second: string }> = [];
  const failures: string[] = [];

  for (const site of sites) {
    const slug = propertyDashboardSlug(site);
    const profileLink = `${STATIC}${propertyDashboardPath(site)}`;
    const secondReportLink = `${STATIC}/sites/${encodeURIComponent(slug || site.id)}/organic`;
    try {
      let shareUrl = "";
      for (let attempt = 1; ; attempt++) {
        try {
          shareUrl = await publishOne(site, token);
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (attempt >= 3 || !/\b50[234]\b/.test(msg)) throw err;
          console.warn(`[RETRY ${attempt}/2] ${site.name}: ${msg}`);
          await new Promise((r) => setTimeout(r, 5000 * attempt));
        }
      }
      rows.push({
        client: site.name,
        report: shareUrl,
        profile: profileLink,
        second: secondReportLink,
      });
      console.log(`[OK] ${site.name} -> ${shareUrl}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`${site.name}: ${msg}`);
      console.error(`[FAIL] ${site.name}: ${msg}`);
    }
  }

  const csv = [
    "Client,Last 3 Month Report,Profile Link,Second Report Link",
    ...rows.map(
      (r) =>
        `${csvCell(r.client)},${csvCell(r.report)},${csvCell(r.profile)},${csvCell(r.second)}`,
    ),
  ].join("\n");
  fs.mkdirSync(path.dirname(OUT_CSV), { recursive: true });
  fs.writeFileSync(OUT_CSV, `${csv}\n`, "utf8");
  console.log(`\nWrote ${rows.length}/${sites.length} rows to ${OUT_CSV}`);
  if (failures.length) {
    console.error(`\n${failures.length} failure(s):\n${failures.join("\n")}`);
  }
  console.log("\n__SHEET_JSON__");
  console.log(JSON.stringify({ rows, failures, outCsv: OUT_CSV }));
  if (rows.length === 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
