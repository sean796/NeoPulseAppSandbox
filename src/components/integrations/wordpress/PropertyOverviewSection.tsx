import { useEffect, useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { Field, SelectField } from "@/ui";
import type { WordPressSite } from "../types";
import { propertyHostingLabel } from "./property-profile-view-model";
import { WordPressCardActions } from "./WordPressCardActions";
import { MasterInstructionsSection } from "./MasterInstructionsSection";
import { ProfileLocationSelect } from "./ProfileServiceAreaFields";
import {
  buildSiteLocationsPatch,
  readSiteServiceCity,
  readSiteServiceCountry,
  readSiteServiceState,
} from "@/lib/wordpress-api/site-service-area";
import { persistGbpLocationIdInput } from "@/lib/gbp-post/normalize-gbp-location-id";
import { regionPlaceholder, serviceRegionOptions } from "@/lib/keyword-location-utils";
import { cn } from "@/lib/utils";
import {
  editorialContentPackageShortLabelForSite,
  resolveEditorialContentPackageForSite,
} from "@/lib/editorial-content-package";
import {
  PROPERTIES_DIAGNOSTICS_SECTION_CLASS,
  PROPERTIES_OVERVIEW_CHIP_CLASS,
  PROPERTIES_OVERVIEW_CHIP_DOT_LITE_CLASS,
  PROPERTIES_OVERVIEW_CHIP_DOT_MUTED_CLASS,
  PROPERTIES_OVERVIEW_CHIP_DOT_OK_CLASS,
  PROPERTIES_OVERVIEW_CHIP_EDITORIAL_SLOT,
  PROPERTIES_OVERVIEW_CHIP_LITE_CLASS,
  PROPERTIES_OVERVIEW_CHIP_MUTED_CLASS,
  PROPERTIES_OVERVIEW_DL_CLASS,
  PROPERTIES_OVERVIEW_DL_LABEL_CLASS,
  PROPERTIES_OVERVIEW_DL_ROW_CLASS,
  PROPERTIES_OVERVIEW_DL_VALUE_CLASS,
  PROPERTIES_OVERVIEW_IDENTITY_CLASS,
  PROPERTIES_OVERVIEW_IDENTITY_NAME_CLASS,
  PROPERTIES_OVERVIEW_IDENTITY_PILLS_CLASS,
  PROPERTIES_OVERVIEW_IDENTITY_URL_CLASS,
  PROPERTIES_OVERVIEW_KPI_LABEL_CLASS,
  PROPERTIES_OVERVIEW_KPI_ROW_CLASS,
  PROPERTIES_OVERVIEW_KPI_TILE_CLASS,
  PROPERTIES_OVERVIEW_KPI_VALUE_CLASS,
  PROPERTIES_OVERVIEW_PANEL_CLASS,
  PROPERTIES_OVERVIEW_PANEL_TITLE_CLASS,
  PROPERTIES_OVERVIEW_PILL_ROW_CLASS,
  PROPERTIES_OVERVIEW_PROFILE_EMPTY_CLASS,
  PROPERTIES_OVERVIEW_STACK_CLASS,
} from "./wordpress-properties-surfaces";

export type PropertyOverviewSectionProps = {
  site: WordPressSite;
  isTesting: boolean;
  isDetecting: boolean;
  isExtractingNAPAndGraph: boolean;
  onTest: () => void;
  onDetect: () => void;
  onExtractNAPAndGraph?: () => void;
  onPatchSite?: (siteId: string, patch: Partial<WordPressSite>) => void;
  /** Kept for callers. Edits happen on this screen. */
  onOpenSettingsProfile?: () => void;
  settingsPanel?: ReactNode;
  sitemapPanel?: ReactNode;
};

function PanelPencil({
  label,
  editing,
  onToggle,
}: {
  label: string;
  editing: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-none border-0 bg-transparent text-white hover:bg-white/10"
      aria-label={editing ? `Done editing ${label}` : `Edit ${label}`}
      aria-pressed={editing}
      onClick={onToggle}
    >
      <Pencil className="h-4 w-4" aria-hidden />
    </button>
  );
}

function sitemapOptionLabel(url: string): string {
  try {
    const path = new URL(url).pathname.split("/").filter(Boolean).pop() ?? url;
    return path.replace(/\.xml$/i, "") || url;
  } catch {
    return url;
  }
}

function PanelHeading({
  title,
  editing,
  onToggle,
}: {
  title: string;
  editing: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2">
      <h2 className={PROPERTIES_OVERVIEW_PANEL_TITLE_CLASS}>{title}</h2>
      <PanelPencil label={title} editing={editing} onToggle={onToggle} />
    </div>
  );
}

function siteHostname(site: WordPressSite): string {
  try {
    return new URL(site.siteUrl?.trim() ?? "").hostname.replace(/^www\./, "");
  } catch {
    return site.siteUrl?.trim() || "";
  }
}

function KpiTile({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className={PROPERTIES_OVERVIEW_KPI_TILE_CLASS} title={title}>
      <div className={PROPERTIES_OVERVIEW_PILL_ROW_CLASS}>
        <span
          className={PROPERTIES_OVERVIEW_KPI_LABEL_CLASS}
          style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
        >
          {label}
        </span>
        <span
          className={PROPERTIES_OVERVIEW_KPI_VALUE_CLASS}
          title={value}
          style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
        >
          {value}
        </span>
      </div>
    </div>
  );
}

/** Display GBP as the numeric id, never the business.google.com URL. */
function gbpDisplayId(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^\d+$/.test(value)) return value;
  const fromPath = value.match(/business\.google\.com\/n\/(\d+)/i);
  if (fromPath?.[1]) return fromPath[1];
  const fromFid = value.match(/[?&]fid=(\d+)/i);
  if (fromFid?.[1]) return fromFid[1];
  const fromLocations = value.match(/locations\/(\d+)/i);
  if (fromLocations?.[1]) return fromLocations[1];
  const digits = value.match(/\d{6,}/);
  return digits?.[0] ?? value;
}

function IntegrationRow({
  label,
  value,
  title,
  children,
}: {
  label: string;
  value?: string;
  title?: string;
  children?: ReactNode;
}) {
  const empty = !children && !value;
  return (
    <div className={cn(PROPERTIES_OVERVIEW_DL_ROW_CLASS, "h-11 max-h-11 items-center overflow-hidden py-1")}>
      <dt
        className={PROPERTIES_OVERVIEW_DL_LABEL_CLASS}
        style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
      >
        {label}
      </dt>
      <dd
        className={cn(
          "flex h-8 min-w-0 flex-1 items-center justify-end overflow-hidden",
          empty ? PROPERTIES_OVERVIEW_PROFILE_EMPTY_CLASS : PROPERTIES_OVERVIEW_DL_VALUE_CLASS,
        )}
        title={empty || children ? undefined : title || value}
        style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
      >
        {children ?? <span className="truncate">{empty ? "Not set" : value}</span>}
      </dd>
    </div>
  );
}

export function PropertyOverviewSection({
  site,
  isTesting,
  isDetecting,
  isExtractingNAPAndGraph,
  onTest,
  onDetect,
  onExtractNAPAndGraph,
  onPatchSite,
}: PropertyOverviewSectionProps) {
  const scheduled = site.scheduledPosts;
  const ga4 = site.ga4PropertyId?.trim() ?? "";
  const ads = site.googleAdsCustomerId?.trim() ?? "";
  const gbpRaw = site.gbpLocationId?.trim() ?? "";
  const gbp = gbpDisplayId(gbpRaw);
  const semrush = (site.semrushSiteAuditProjectId ?? site.semrushPositionTrackingProjectId)?.trim() ?? "";
  const editorialTier = editorialContentPackageShortLabelForSite(site);
  const editorialPackage = resolveEditorialContentPackageForSite(site);
  const wpEngineAccountId = site.wpEngineAccountId?.trim() ?? "";
  const primaryKeyword = site.primaryLocalKeyword?.trim() ?? "";
  const serviceCountry = readSiteServiceCountry(site);
  const logoUrl = site.clientLogoUrl?.trim() ?? "";
  const logoTheme = site.clientLogoBoxTheme === "white" ? "white" : "black";
  const sitemapUrls =
    site.sitemaps?.type === "index"
      ? (site.sitemaps.childSitemaps ?? [])
      : (site.sitemaps?.urls ?? []);
  const sitemapKey = sitemapUrls.join("\n");
  const semrushKey: "semrushSiteAuditProjectId" | "semrushPositionTrackingProjectId" =
    site.semrushSiteAuditProjectId?.trim() || !site.semrushPositionTrackingProjectId?.trim()
      ? "semrushSiteAuditProjectId"
      : "semrushPositionTrackingProjectId";

  const [editIdentity, setEditIdentity] = useState(false);
  const [editProfile, setEditProfile] = useState(false);
  const [editIntegrations, setEditIntegrations] = useState(false);
  const [editSettings, setEditSettings] = useState(false);
  const [editRules, setEditRules] = useState(false);
  const [editSitemaps, setEditSitemaps] = useState(false);
  const [nameDraft, setNameDraft] = useState(site.name);
  const [logoDraft, setLogoDraft] = useState(logoUrl);
  const [keywordDraft, setKeywordDraft] = useState(primaryKeyword);
  const [cityDraft, setCityDraft] = useState(readSiteServiceCity(site));
  const [stateDraft, setStateDraft] = useState(readSiteServiceState(site));
  const [ga4Draft, setGa4Draft] = useState(ga4);
  const [adsDraft, setAdsDraft] = useState(ads);
  const [gbpDraft, setGbpDraft] = useState(gbpRaw);
  const [semrushDraft, setSemrushDraft] = useState(semrush);
  const [sitemapPick, setSitemapPick] = useState(sitemapUrls[0] ?? "");

  useEffect(() => {
    setEditIdentity(false);
    setEditProfile(false);
    setEditIntegrations(false);
    setEditSettings(false);
    setEditRules(false);
    setEditSitemaps(false);
  }, [site.id]);

  useEffect(() => {
    const urls = sitemapKey ? sitemapKey.split("\n") : [];
    setSitemapPick((current) => (urls.includes(current) ? current : urls[0] ?? ""));
  }, [site.id, sitemapKey]);

  const patch = (next: Partial<WordPressSite>) => {
    onPatchSite?.(site.id, next);
  };

  const commitLocations = (city: string, state: string) => {
    patch(buildSiteLocationsPatch(site, city, state, serviceCountry));
  };

  const workspacePanel = "h-auto";

  return (
    <div className={PROPERTIES_OVERVIEW_STACK_CLASS}>
      <section className={cn(PROPERTIES_OVERVIEW_IDENTITY_CLASS, "h-[6.75rem] max-h-[6.75rem] overflow-hidden")} aria-label="Property">
        <div
          className={cn(
            "flex h-14 w-36 shrink-0 items-center justify-center overflow-hidden bg-zinc-900",
            logoTheme === "white" && "bg-white",
          )}
        >
          {logoUrl ? (
            <img src={logoUrl} alt="" className="max-h-12 max-w-[8rem] object-contain" />
          ) : null}
        </div>
        <div className="flex h-16 min-w-0 flex-1 basis-[12rem] flex-col justify-center gap-0">
          <div className="flex h-8 items-center overflow-hidden">
            {editIdentity ? (
              <Field
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (name) patch({ name });
                }}
                placeholder="Site name"
                aria-label="Site name"
              />
            ) : (
              <div className={PROPERTIES_OVERVIEW_IDENTITY_NAME_CLASS}>{site.name}</div>
            )}
          </div>
          <div className="flex h-8 items-center overflow-hidden">
            {editIdentity ? (
              <Field
                value={logoDraft}
                onChange={(e) => setLogoDraft(e.target.value)}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  patch({
                    clientLogoUrl: next || undefined,
                    clientLogoSource: next ? "manual" : undefined,
                    clientLogoFetchedAt: next ? Date.now() : undefined,
                  });
                }}
                placeholder="Logo URL"
                aria-label="Logo URL"
              />
            ) : (
              <div
                className={PROPERTIES_OVERVIEW_IDENTITY_URL_CLASS}
                title={site.siteUrl}
                style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
              >
                {siteHostname(site)}
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className={PROPERTIES_OVERVIEW_IDENTITY_PILLS_CLASS}>
            <span
              className={`${
                editorialPackage === "lite"
                  ? PROPERTIES_OVERVIEW_CHIP_LITE_CLASS
                  : editorialPackage === "standard"
                    ? PROPERTIES_OVERVIEW_CHIP_CLASS
                    : PROPERTIES_OVERVIEW_CHIP_MUTED_CLASS
              } ${PROPERTIES_OVERVIEW_CHIP_EDITORIAL_SLOT}`}
            >
              <span
                className={
                  editorialPackage === "lite"
                    ? PROPERTIES_OVERVIEW_CHIP_DOT_LITE_CLASS
                    : editorialPackage === "standard"
                      ? PROPERTIES_OVERVIEW_CHIP_DOT_OK_CLASS
                      : PROPERTIES_OVERVIEW_CHIP_DOT_MUTED_CLASS
                }
                aria-hidden
              />
              <span>{editorialTier ?? "No editorial"}</span>
            </span>
          </div>
          <PanelPencil
            label="name and logo"
            editing={editIdentity}
            onToggle={() => {
              if (editIdentity) {
                const name = nameDraft.trim();
                const nextLogo = logoDraft.trim();
                patch({
                  ...(name ? { name } : {}),
                  clientLogoUrl: nextLogo || undefined,
                  clientLogoSource: nextLogo ? "manual" : undefined,
                  clientLogoFetchedAt: nextLogo ? Date.now() : undefined,
                });
                setEditIdentity(false);
                return;
              }
              setNameDraft(site.name);
              setLogoDraft(logoUrl);
              setEditIdentity(true);
            }}
          />
        </div>
      </section>

      <section className="grid shrink-0 grid-cols-2 gap-2" aria-label="Platform">
        <KpiTile
          label="WordPress"
          value={propertyHostingLabel(site)}
          title={wpEngineAccountId || undefined}
        />
        <KpiTile label="Scheduled" value={scheduled ? String(scheduled.count) : "0"} />
      </section>

      <div className="grid w-full grid-cols-2 items-start gap-x-3 gap-y-2">
        <section className={cn(PROPERTIES_OVERVIEW_PANEL_CLASS, workspacePanel)} aria-label="Profile">
          <PanelHeading
            title="Profile"
            editing={editProfile}
            onToggle={() => {
              if (editProfile) {
                patch({ primaryLocalKeyword: keywordDraft.trim() || undefined });
                commitLocations(cityDraft, stateDraft);
                setEditProfile(false);
                return;
              }
              setKeywordDraft(primaryKeyword);
              setCityDraft(readSiteServiceCity(site));
              setStateDraft(readSiteServiceState(site));
              setEditProfile(true);
            }}
          />
          <dl className={PROPERTIES_OVERVIEW_DL_CLASS}>
            <IntegrationRow label="Keyword" value={editProfile ? undefined : primaryKeyword}>
              {editProfile ? (
                <Field
                  value={keywordDraft}
                  onChange={(e) => setKeywordDraft(e.target.value)}
                  onBlur={(e) => patch({ primaryLocalKeyword: e.target.value.trim() || undefined })}
                  placeholder="Keyword"
                  aria-label="Keyword"
                />
              ) : null}
            </IntegrationRow>
            <IntegrationRow label="City" value={editProfile ? undefined : readSiteServiceCity(site)}>
              {editProfile ? (
                <Field
                  value={cityDraft}
                  onChange={(e) => setCityDraft(e.target.value)}
                  onBlur={(e) => commitLocations(e.target.value, stateDraft)}
                  placeholder="City"
                  aria-label="City"
                />
              ) : null}
            </IntegrationRow>
            <IntegrationRow
              label={regionPlaceholder(serviceCountry)}
              value={editProfile ? undefined : readSiteServiceState(site)}
            >
              {editProfile ? (
                <ProfileLocationSelect
                  placeholder={regionPlaceholder(serviceCountry)}
                  value={stateDraft}
                  options={serviceRegionOptions(serviceCountry)}
                  disabled={!serviceCountry}
                  onChange={(next) => {
                    setStateDraft(next);
                    commitLocations(cityDraft, next);
                  }}
                />
              ) : null}
            </IntegrationRow>
          </dl>
        </section>

        <section className={cn(PROPERTIES_OVERVIEW_PANEL_CLASS, workspacePanel)} aria-label="Integrations">
          <PanelHeading
            title="Integrations"
            editing={editIntegrations}
            onToggle={() => {
              if (editIntegrations) {
                const gbpNext = persistGbpLocationIdInput(gbpDraft);
                patch({
                  ga4PropertyId: ga4Draft.trim() || undefined,
                  googleAdsCustomerId: adsDraft.trim() || undefined,
                  gbpLocationId: gbpNext || undefined,
                  [semrushKey]: semrushDraft.trim() || undefined,
                });
                setEditIntegrations(false);
                return;
              }
              setGa4Draft(ga4);
              setAdsDraft(ads);
              setGbpDraft(gbp);
              setSemrushDraft(semrush);
              setEditIntegrations(true);
            }}
          />
          <dl className={PROPERTIES_OVERVIEW_DL_CLASS}>
            <IntegrationRow label="GA4" value={editIntegrations ? undefined : ga4}>
              {editIntegrations ? (
                <Field
                  value={ga4Draft}
                  onChange={(e) => setGa4Draft(e.target.value)}
                  onBlur={(e) => patch({ ga4PropertyId: e.target.value.trim() || undefined })}
                  placeholder="GA4"
                  aria-label="GA4"
                />
              ) : null}
            </IntegrationRow>
            <IntegrationRow label="Google Ads" value={editIntegrations ? undefined : ads}>
              {editIntegrations ? (
                <Field
                  value={adsDraft}
                  onChange={(e) => setAdsDraft(e.target.value)}
                  onBlur={(e) => patch({ googleAdsCustomerId: e.target.value.trim() || undefined })}
                  placeholder="Google Ads"
                  aria-label="Google Ads"
                />
              ) : null}
            </IntegrationRow>
            <IntegrationRow label="GBP" value={editIntegrations ? undefined : gbp} title={gbpRaw || undefined}>
              {editIntegrations ? (
                <Field
                  value={gbpDraft}
                  onChange={(e) => setGbpDraft(e.target.value)}
                  onBlur={(e) => patch({ gbpLocationId: persistGbpLocationIdInput(e.target.value) || undefined })}
                  placeholder="GBP"
                  aria-label="GBP"
                />
              ) : null}
            </IntegrationRow>
            <IntegrationRow label="Semrush" value={editIntegrations ? undefined : semrush}>
              {editIntegrations ? (
                <Field
                  value={semrushDraft}
                  onChange={(e) => setSemrushDraft(e.target.value)}
                  onBlur={(e) => patch({ [semrushKey]: e.target.value.trim() || undefined })}
                  placeholder="Semrush"
                  aria-label="Semrush"
                />
              ) : null}
            </IntegrationRow>
          </dl>
        </section>

        <section className={cn(PROPERTIES_OVERVIEW_PANEL_CLASS, workspacePanel)} aria-label="Settings">
          <PanelHeading title="Settings" editing={editSettings} onToggle={() => setEditSettings((open) => !open)} />
          <dl className={PROPERTIES_OVERVIEW_DL_CLASS}>
            <IntegrationRow label="Site URL" value={editSettings ? undefined : site.siteUrl?.trim() ?? ""}>
              {editSettings ? (
                <Field
                  defaultValue={site.siteUrl ?? ""}
                  onBlur={(e) => patch({ siteUrl: e.target.value.trim() })}
                  placeholder="Site URL"
                  aria-label="Site URL"
                />
              ) : null}
            </IntegrationRow>
            <IntegrationRow label="Production" value={editSettings ? undefined : site.productionSiteUrl?.trim() ?? ""}>
              {editSettings ? (
                <Field
                  defaultValue={site.productionSiteUrl ?? ""}
                  onBlur={(e) => patch({ productionSiteUrl: e.target.value.trim() || undefined })}
                  placeholder="Production"
                  aria-label="Production"
                />
              ) : null}
            </IntegrationRow>
            <IntegrationRow label="Username" value={editSettings ? undefined : site.username?.trim() ?? ""}>
              {editSettings ? (
                <Field
                  defaultValue={site.username ?? ""}
                  onBlur={(e) => patch({ username: e.target.value })}
                  placeholder="Username"
                  aria-label="Username"
                />
              ) : null}
            </IntegrationRow>
            <IntegrationRow label="Password" value={editSettings ? undefined : site.appPassword?.trim() ? "Set" : ""}>
              {editSettings ? (
                <Field
                  type="password"
                  defaultValue={site.appPassword ?? ""}
                  onBlur={(e) => patch({ appPassword: e.target.value })}
                  placeholder="Password"
                  aria-label="Password"
                />
              ) : null}
            </IntegrationRow>
            <IntegrationRow label="Editorial" value={editorialTier ?? ""} />
            <IntegrationRow label="Publish time" value={editSettings ? undefined : site.editorialPublishTimeLocal?.trim() ?? ""}>
              {editSettings ? (
                <Field
                  defaultValue={site.editorialPublishTimeLocal ?? ""}
                  onBlur={(e) => patch({ editorialPublishTimeLocal: e.target.value.trim() || undefined })}
                  placeholder="Publish time"
                  aria-label="Publish time"
                />
              ) : null}
            </IntegrationRow>
            <IntegrationRow label="Benchmark" value={editSettings ? undefined : site.benchmarkCustomTag?.trim() ?? ""}>
              {editSettings ? (
                <Field
                  defaultValue={site.benchmarkCustomTag ?? ""}
                  onBlur={(e) => patch({ benchmarkCustomTag: e.target.value.trim() || undefined })}
                  placeholder="Benchmark"
                  aria-label="Benchmark"
                />
              ) : null}
            </IntegrationRow>
          </dl>
        </section>

        <div className="flex min-w-0 flex-col gap-2">
          <section className={cn(PROPERTIES_OVERVIEW_PANEL_CLASS, workspacePanel)} aria-label="Master Rules">
            <PanelHeading title="Master Rules" editing={editRules} onToggle={() => setEditRules((open) => !open)} />
            <MasterInstructionsSection
              siteId={site.id}
              siteUrl={site.siteUrl}
              siteName={site.name}
              disabled={site.enabled === false}
              layout="dropdown"
              editing={editRules}
            />
          </section>
          <section className={cn(PROPERTIES_OVERVIEW_PANEL_CLASS, workspacePanel)} aria-label="Sitemaps">
            <PanelHeading title="Sitemaps" editing={editSitemaps} onToggle={() => setEditSitemaps((open) => !open)} />
            <div className="flex h-8 shrink-0 items-center overflow-hidden">
              {sitemapUrls.length > 0 ? (
                <SelectField
                  placeholder="Sitemap"
                  width="full"
                  value={sitemapPick || sitemapUrls[0]}
                  options={sitemapUrls.map((url) => ({ value: url, label: sitemapOptionLabel(url) }))}
                  onValueChange={setSitemapPick}
                />
              ) : (
                <span className="truncate text-base text-white">Not set</span>
              )}
            </div>
          </section>
        </div>
      </div>

      <section className={PROPERTIES_DIAGNOSTICS_SECTION_CLASS} aria-label="Diagnostics">
        <WordPressCardActions
          site={site}
          isTesting={isTesting}
          isDetecting={isDetecting}
          isExtractingNAPAndGraph={isExtractingNAPAndGraph}
          onTest={onTest}
          onDetect={onDetect}
          onExtractNAPAndGraph={onExtractNAPAndGraph}
          onPatchSite={onPatchSite}
          tone="propertyBlack"
          layout="profileCard"
        />
      </section>
    </div>
  );
}
