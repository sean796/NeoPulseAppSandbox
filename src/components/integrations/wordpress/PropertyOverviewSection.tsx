import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pencil, Plus, Save, Trash2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  SelectField,
} from "@/ui";
import type { WordPressSite } from "../types";
import { propertyHostingLabel } from "./property-profile-view-model";
import { WordPressCardActions } from "./WordPressCardActions";
import { MasterInstructionsSection } from "./MasterInstructionsSection";
import { ProfileLocationSelect } from "./ProfileServiceAreaFields";
import {
  buildSiteAdditionalLocationsPatch,
  buildSiteLocationsPatch,
  readSiteAdditionalLocations,
  readSiteLocationsList,
  readSiteServiceCity,
  readSiteServiceCountry,
  readSiteServiceState,
} from "@/lib/wordpress-api/site-service-area";
import {
  buildSiteLocalKeywordsPatch,
  readSiteLocalKeywords,
  type SiteLocalKeyword,
} from "@/lib/wordpress-api/site-local-keywords";
import { persistGbpLocationIdInput } from "@/lib/gbp-post/normalize-gbp-location-id";
import {
  inferServiceCountry,
  isServiceCountry,
  nextStateForCountry,
  regionPlaceholder,
  serviceRegionOptions,
} from "@/lib/keyword-location-utils";
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
  PROPERTIES_OVERVIEW_CHIP_LITE_CLASS,
  PROPERTIES_OVERVIEW_CHIP_MUTED_CLASS,
  PROPERTIES_OVERVIEW_DL_CLASS,
  PROPERTIES_OVERVIEW_DL_LABEL_CLASS,
  PROPERTIES_OVERVIEW_DL_ROW_CLASS,
  PROPERTIES_OVERVIEW_DL_VALUE_CLASS,
  PROPERTIES_OVERVIEW_ACTION_PILL_CLASS,
  PROPERTIES_OVERVIEW_IDENTITY_ACTIONS_CLASS,
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
  /** Single Studio Edit pencil controls every field on this screen. */
  editing?: boolean;
  onToggleEditing?: () => void;
  onSaveProperty?: () => void;
  onDeleteProperty?: () => void;
  /** Keep form logo-box theme aligned when overview swatches patch the live site. */
  onLogoBoxThemeChange?: (theme: "black" | "white") => void;
};

function sitemapOptionLabel(url: string): string {
  try {
    const path = new URL(url).pathname.split("/").filter(Boolean).pop() ?? url;
    return path.replace(/\.xml$/i, "") || url;
  } catch {
    return url;
  }
}

function PanelHeading({ title }: { title: string }) {
  return (
    <div className="flex h-8 shrink-0 items-center">
      <h2 className={PROPERTIES_OVERVIEW_PANEL_TITLE_CLASS}>{title}</h2>
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

/** Value column stays right-aligned in view and edit (type boxes fill the right slot). */
const VALUE_EDIT_WRAP_CLASS =
  "flex h-8 w-full min-w-0 items-center justify-end gap-1.5 [&_input]:text-right [&_button]:justify-end [&_button>span]:text-right";

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
        {children ? (
          <div className={VALUE_EDIT_WRAP_CLASS}>{children}</div>
        ) : (
          <span className="truncate text-right">{empty ? "Not set" : value}</span>
        )}
      </dd>
    </div>
  );
}

function locationOptionLabel(loc: { id: string; city?: string; state?: string; name?: string }): string {
  const city = loc.city?.trim() ?? "";
  const state = loc.state?.trim() ?? "";
  if (city && state) return `${city}, ${state}`;
  return city || state || loc.name?.trim() || loc.id;
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
  editing = false,
  onToggleEditing,
  onSaveProperty,
  onDeleteProperty,
  onLogoBoxThemeChange,
}: PropertyOverviewSectionProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
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
  const siteLocations = readSiteLocationsList(site);
  const additionalLocations = readSiteAdditionalLocations(site);
  const localKeywords = readSiteLocalKeywords(site);
  const sitemapUrls =
    site.sitemaps?.type === "index"
      ? (site.sitemaps.childSitemaps ?? [])
      : (site.sitemaps?.urls ?? []);
  const sitemapKey = sitemapUrls.join("\n");
  const semrushKey: "semrushSiteAuditProjectId" | "semrushPositionTrackingProjectId" =
    site.semrushSiteAuditProjectId?.trim() || !site.semrushPositionTrackingProjectId?.trim()
      ? "semrushSiteAuditProjectId"
      : "semrushPositionTrackingProjectId";

  const [nameDraft, setNameDraft] = useState(site.name);
  const [logoDraft, setLogoDraft] = useState(logoUrl);
  const [keywordRows, setKeywordRows] = useState<SiteLocalKeyword[]>(() => readSiteLocalKeywords(site));
  const [cityDraft, setCityDraft] = useState(readSiteServiceCity(site));
  const [stateDraft, setStateDraft] = useState(readSiteServiceState(site));
  const [extraLocationRows, setExtraLocationRows] = useState(() =>
    readSiteAdditionalLocations(site).map((loc, idx) => ({
      id: loc.id || `loc-${site.id}-extra-${idx + 1}`,
      city: loc.city ?? "",
      state: loc.state ?? "",
      country: loc.country ?? serviceCountry,
    })),
  );
  const [ga4Draft, setGa4Draft] = useState(ga4);
  const [adsDraft, setAdsDraft] = useState(ads);
  const [gbpDraft, setGbpDraft] = useState(gbpRaw);
  const [semrushDraft, setSemrushDraft] = useState(semrush);
  const [sitemapPick, setSitemapPick] = useState(sitemapUrls[0] ?? "");
  const wasEditingRef = useRef(false);

  useEffect(() => {
    const urls = sitemapKey ? sitemapKey.split("\n") : [];
    setSitemapPick((current) => (urls.includes(current) ? current : urls[0] ?? ""));
  }, [site.id, sitemapKey]);

  const patch = (next: Partial<WordPressSite>) => {
    onPatchSite?.(site.id, next);
  };

  const commitPrimaryLocation = (city: string, state: string) => {
    patch(buildSiteLocationsPatch(site, city, state, serviceCountry));
  };

  const commitKeywordRows = (rows: SiteLocalKeyword[]) => {
    setKeywordRows(rows);
    patch(buildSiteLocalKeywordsPatch(site, rows));
  };

  const commitExtraLocations = (
    rows: Array<{ id: string; city: string; state: string; country: string }>,
  ) => {
    setExtraLocationRows(rows);
    const locationsPatch = buildSiteAdditionalLocationsPatch(site, rows);
    const staleKeywords = buildSiteLocalKeywordsPatch(
      { ...site, ...locationsPatch },
      keywordRows,
    );
    patch({ ...locationsPatch, ...staleKeywords });
  };

  useEffect(() => {
    if (editing && !wasEditingRef.current) {
      setNameDraft(site.name);
      setLogoDraft(logoUrl);
      setKeywordRows(readSiteLocalKeywords(site));
      setCityDraft(readSiteServiceCity(site));
      setStateDraft(readSiteServiceState(site));
      setExtraLocationRows(
        readSiteAdditionalLocations(site).map((loc, idx) => ({
          id: loc.id || `loc-${site.id}-extra-${idx + 1}`,
          city: loc.city ?? "",
          state: loc.state ?? "",
          country: (loc.country && isServiceCountry(loc.country) ? loc.country : "") || serviceCountry,
        })),
      );
      setGa4Draft(ga4);
      setAdsDraft(ads);
      setGbpDraft(gbpRaw);
      setSemrushDraft(semrush);
    }
    if (!editing && wasEditingRef.current) {
      const name = nameDraft.trim();
      const nextLogo = logoDraft.trim();
      const gbpNext = persistGbpLocationIdInput(gbpDraft);
      const keywordPatch = buildSiteLocalKeywordsPatch(site, keywordRows);
      const primaryLocPatch = buildSiteLocationsPatch(site, cityDraft, stateDraft, serviceCountry);
      const extraPatch = buildSiteAdditionalLocationsPatch(
        { ...site, ...primaryLocPatch },
        extraLocationRows,
      );
      const keywordAfterLoc = buildSiteLocalKeywordsPatch(
        { ...site, ...extraPatch },
        keywordRows,
      );
      patch({
        ...(name ? { name } : {}),
        clientLogoUrl: nextLogo || undefined,
        clientLogoSource: nextLogo ? "manual" : undefined,
        clientLogoFetchedAt: nextLogo ? Date.now() : undefined,
        ga4PropertyId: ga4Draft.trim() || undefined,
        googleAdsCustomerId: adsDraft.trim() || undefined,
        gbpLocationId: gbpNext || undefined,
        [semrushKey]: semrushDraft.trim() || undefined,
        ...primaryLocPatch,
        ...extraPatch,
        ...keywordPatch,
        ...keywordAfterLoc,
      });
    }
    wasEditingRef.current = editing;
    // Seed/commit only on edit enter/exit; drafts otherwise update via field handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional edge trigger
  }, [editing]);

  const workspacePanel = "h-full min-h-0";

  return (
    <div className={PROPERTIES_OVERVIEW_STACK_CLASS}>
      <section className={cn(PROPERTIES_OVERVIEW_IDENTITY_CLASS, "h-[6.75rem] max-h-[6.75rem] overflow-hidden")} aria-label="Property">
        <div className="flex h-14 shrink-0 items-center gap-1.5">
          <div
            className={cn(
              "flex h-14 w-36 shrink-0 items-center justify-center overflow-hidden rounded-none border border-white/15",
              logoTheme === "white" ? "bg-white" : "bg-black",
            )}
            aria-label={logoTheme === "white" ? "Logo box white" : "Logo box black"}
          >
            {logoUrl ? (
              <img src={logoUrl} alt="" className="max-h-12 max-w-[8rem] object-contain" />
            ) : (
              <span
                className={cn(
                  "px-2 text-center text-base font-medium",
                  logoTheme === "white" ? "text-black/50" : "text-white/40",
                )}
              >
                No logo
              </span>
            )}
          </div>
          <div
            className="flex h-14 w-5 shrink-0 flex-col justify-center gap-1"
            role="group"
            aria-label="Logo box theme"
          >
            <button
              type="button"
              className={cn(
                "h-5 w-5 shrink-0 rounded-none border border-white/20 bg-black shadow-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                logoTheme === "black" ? "opacity-100 ring-1 ring-white/40" : "opacity-40 hover:opacity-70",
              )}
              aria-label="Black logo box"
              aria-pressed={logoTheme === "black"}
              disabled={!onPatchSite}
              title="Black logo box"
              onClick={() => {
                patch({ clientLogoBoxTheme: "black" });
                onLogoBoxThemeChange?.("black");
              }}
            />
            <button
              type="button"
              className={cn(
                "h-5 w-5 shrink-0 rounded-none border border-white/20 bg-white shadow-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                logoTheme === "white" ? "opacity-100 ring-1 ring-white/40" : "opacity-40 hover:opacity-70",
              )}
              aria-label="White logo box"
              aria-pressed={logoTheme === "white"}
              disabled={!onPatchSite}
              title="White logo box"
              onClick={() => {
                patch({ clientLogoBoxTheme: "white" });
                onLogoBoxThemeChange?.("white");
              }}
            />
          </div>
        </div>
        <div className="flex h-16 min-w-0 flex-1 basis-[12rem] flex-col justify-center gap-0">
          <div className="flex h-8 items-center overflow-hidden">
            {editing ? (
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
            {editing ? (
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
        <div className={PROPERTIES_OVERVIEW_IDENTITY_PILLS_CLASS}>
          <span
            className={`${
              editorialPackage === "lite"
                ? PROPERTIES_OVERVIEW_CHIP_LITE_CLASS
                : editorialPackage === "standard"
                  ? PROPERTIES_OVERVIEW_CHIP_CLASS
                  : PROPERTIES_OVERVIEW_CHIP_MUTED_CLASS
            } w-full`}
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
          <div className={PROPERTIES_OVERVIEW_IDENTITY_ACTIONS_CLASS}>
            {onToggleEditing ? (
              <button
                type="button"
                className={PROPERTIES_OVERVIEW_ACTION_PILL_CLASS}
                aria-label={editing ? "Done editing property" : "Edit property"}
                aria-pressed={editing}
                onClick={onToggleEditing}
              >
                <Pencil aria-hidden />
              </button>
            ) : null}
            {onSaveProperty ? (
              <button
                type="button"
                className={PROPERTIES_OVERVIEW_ACTION_PILL_CLASS}
                aria-label="Save property"
                onClick={onSaveProperty}
              >
                <Save aria-hidden />
              </button>
            ) : null}
            {onDeleteProperty ? (
              <button
                type="button"
                className={PROPERTIES_OVERVIEW_ACTION_PILL_CLASS}
                aria-label="Delete property"
                onClick={() => {
                  setDeleteConfirmText("");
                  setDeleteOpen(true);
                }}
              >
                <Trash2 aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeleteConfirmText("");
        }}
      >
        <DialogContent className="rounded-none border-0 bg-zinc-950 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Delete property</DialogTitle>
            <DialogDescription className="text-base text-muted-foreground">
              This removes {site.name} from NEO Pulse. Type DELETE to confirm.
            </DialogDescription>
          </DialogHeader>
          <Field
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="Type DELETE"
            aria-label="Type DELETE to confirm"
            autoComplete="off"
          />
          <DialogFooter>
            <Button
              type="button"
              variant="quiet"
              onClick={() => {
                setDeleteOpen(false);
                setDeleteConfirmText("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="run"
              disabled={deleteConfirmText !== "DELETE"}
              onClick={() => {
                onDeleteProperty?.();
                setDeleteOpen(false);
                setDeleteConfirmText("");
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section className="grid shrink-0 grid-cols-2 gap-3" aria-label="Platform">
        <KpiTile
          label="WordPress"
          value={propertyHostingLabel(site)}
          title={wpEngineAccountId || undefined}
        />
        <KpiTile label="Scheduled" value={scheduled ? String(scheduled.count) : "0"} />
      </section>

      <div className="grid w-full grid-cols-2 items-stretch gap-3">
        <section className={cn(PROPERTIES_OVERVIEW_PANEL_CLASS, workspacePanel)} aria-label="Profile">
          <PanelHeading title="Profile" />
          <dl className={PROPERTIES_OVERVIEW_DL_CLASS}>
            {editing ? (
              <>
                {keywordRows.map((row, idx) => (
                  <IntegrationRow key={row.id} label={idx === 0 ? "Keyword" : `Keyword ${idx + 1}`}>
                    <Field
                      value={row.keyword}
                      onChange={(e) => {
                        const next = keywordRows.map((k, i) =>
                          i === idx ? { ...k, keyword: e.target.value } : k,
                        );
                        setKeywordRows(next);
                      }}
                      onBlur={(e) => {
                        commitKeywordRows(
                          keywordRows.map((k, i) =>
                            i === idx ? { ...k, keyword: e.target.value } : k,
                          ),
                        );
                      }}
                      placeholder="Keyword"
                      aria-label={idx === 0 ? "Keyword" : `Keyword ${idx + 1}`}
                    />
                    <SelectField
                      placeholder="Assign location"
                      width="sm"
                      value={row.locationId ?? "__unassigned__"}
                      options={[
                        { value: "__unassigned__", label: "Unassigned" },
                        ...siteLocations.map((loc) => ({
                          value: loc.id,
                          label: locationOptionLabel(loc),
                        })),
                      ]}
                      onValueChange={(next) => {
                        const locationId = next === "__unassigned__" ? undefined : next;
                        commitKeywordRows(
                          keywordRows.map((k, i) => (i === idx ? { ...k, locationId } : k)),
                        );
                      }}
                    />
                    <Button
                      type="button"
                      variant="tool"
                      size="icon"
                      icon={Trash2}
                      className="h-8 w-8 shrink-0"
                      aria-label={`Remove keyword ${idx + 1}`}
                      onClick={() => commitKeywordRows(keywordRows.filter((_, i) => i !== idx))}
                    />
                  </IntegrationRow>
                ))}
                <div className="flex h-11 max-h-11 items-center justify-end">
                  <Button
                    type="button"
                    variant="tool"
                    icon={Plus}
                    className="h-8"
                    onClick={() =>
                      commitKeywordRows([
                        ...keywordRows,
                        {
                          id: `kw-${site.id}-${Date.now()}`,
                          keyword: "",
                        },
                      ])
                    }
                  >
                    Add keyword
                  </Button>
                </div>
                <IntegrationRow label="City">
                  <Field
                    value={cityDraft}
                    onChange={(e) => setCityDraft(e.target.value)}
                    onBlur={(e) => commitPrimaryLocation(e.target.value, stateDraft)}
                    placeholder="City"
                    aria-label="City"
                  />
                </IntegrationRow>
                <IntegrationRow label={regionPlaceholder(serviceCountry)}>
                  <ProfileLocationSelect
                    placeholder={regionPlaceholder(serviceCountry)}
                    value={stateDraft}
                    options={serviceRegionOptions(serviceCountry)}
                    disabled={!serviceCountry}
                    onChange={(next) => {
                      setStateDraft(next);
                      commitPrimaryLocation(cityDraft, next);
                    }}
                  />
                </IntegrationRow>
                {extraLocationRows.map((row, idx) => {
                  const country =
                    (row.country && isServiceCountry(row.country) ? row.country : "") ||
                    serviceCountry ||
                    inferServiceCountry(row.state, "");
                  return (
                    <IntegrationRow key={row.id} label={`City ${idx + 2}`}>
                      <Field
                        value={row.city}
                        onChange={(e) => {
                          const next = extraLocationRows.map((r, i) =>
                            i === idx ? { ...r, city: e.target.value } : r,
                          );
                          setExtraLocationRows(next);
                        }}
                        onBlur={(e) => {
                          commitExtraLocations(
                            extraLocationRows.map((r, i) =>
                              i === idx ? { ...r, city: e.target.value } : r,
                            ),
                          );
                        }}
                        placeholder="City"
                        aria-label={`Additional city ${idx + 1}`}
                      />
                      <ProfileLocationSelect
                        placeholder={regionPlaceholder(country)}
                        value={row.state}
                        options={serviceRegionOptions(country)}
                        disabled={!country}
                        onChange={(next) => {
                          commitExtraLocations(
                            extraLocationRows.map((r, i) =>
                              i === idx ? { ...r, state: next, country } : r,
                            ),
                          );
                        }}
                      />
                      <Button
                        type="button"
                        variant="tool"
                        size="icon"
                        icon={Trash2}
                        className="h-8 w-8 shrink-0"
                        aria-label={`Remove location ${idx + 2}`}
                        onClick={() =>
                          commitExtraLocations(extraLocationRows.filter((_, i) => i !== idx))
                        }
                      />
                    </IntegrationRow>
                  );
                })}
                <div className="flex h-11 max-h-11 items-center justify-end">
                  <Button
                    type="button"
                    variant="tool"
                    icon={Plus}
                    className="h-8"
                    onClick={() => {
                      const country = isServiceCountry(serviceCountry) ? serviceCountry : "Canada";
                      commitExtraLocations([
                        ...extraLocationRows,
                        {
                          id: `loc-${site.id}-extra-${Date.now()}`,
                          city: "",
                          state: nextStateForCountry(stateDraft, country),
                          country,
                        },
                      ]);
                    }}
                  >
                    Add location
                  </Button>
                </div>
              </>
            ) : (
              <>
                <IntegrationRow
                  label="Keyword"
                  value={
                    localKeywords[0]?.keyword || primaryKeyword
                      ? `${localKeywords[0]?.keyword || primaryKeyword}${
                          localKeywords.length > 1 ? ` (+${localKeywords.length - 1})` : ""
                        }`
                      : ""
                  }
                />
                <IntegrationRow
                  label="City"
                  value={
                    readSiteServiceCity(site)
                      ? `${readSiteServiceCity(site)}${
                          additionalLocations.length > 0
                            ? ` (+${additionalLocations.length})`
                            : ""
                        }`
                      : ""
                  }
                />
                <IntegrationRow
                  label={regionPlaceholder(serviceCountry)}
                  value={readSiteServiceState(site)}
                />
              </>
            )}
          </dl>
        </section>

        <section className={cn(PROPERTIES_OVERVIEW_PANEL_CLASS, workspacePanel)} aria-label="Integrations">
          <PanelHeading title="Integrations" />
          <dl className={PROPERTIES_OVERVIEW_DL_CLASS}>
            <IntegrationRow label="GA4" value={editing ? undefined : ga4}>
              {editing ? (
                <Field
                  value={ga4Draft}
                  onChange={(e) => setGa4Draft(e.target.value)}
                  onBlur={(e) => patch({ ga4PropertyId: e.target.value.trim() || undefined })}
                  placeholder="GA4"
                  aria-label="GA4"
                />
              ) : null}
            </IntegrationRow>
            <IntegrationRow label="Google Ads" value={editing ? undefined : ads}>
              {editing ? (
                <Field
                  value={adsDraft}
                  onChange={(e) => setAdsDraft(e.target.value)}
                  onBlur={(e) => patch({ googleAdsCustomerId: e.target.value.trim() || undefined })}
                  placeholder="Google Ads"
                  aria-label="Google Ads"
                />
              ) : null}
            </IntegrationRow>
            <IntegrationRow label="GBP" value={editing ? undefined : gbp} title={gbpRaw || undefined}>
              {editing ? (
                <Field
                  value={gbpDraft}
                  onChange={(e) => setGbpDraft(e.target.value)}
                  onBlur={(e) => patch({ gbpLocationId: persistGbpLocationIdInput(e.target.value) || undefined })}
                  placeholder="GBP"
                  aria-label="GBP"
                />
              ) : null}
            </IntegrationRow>
            <IntegrationRow label="Semrush" value={editing ? undefined : semrush}>
              {editing ? (
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
          <PanelHeading title="Settings" />
          <dl className={PROPERTIES_OVERVIEW_DL_CLASS}>
            <IntegrationRow label="Site URL" value={editing ? undefined : site.siteUrl?.trim() ?? ""}>
              {editing ? (
                <Field
                  defaultValue={site.siteUrl ?? ""}
                  onBlur={(e) => patch({ siteUrl: e.target.value.trim() })}
                  placeholder="Site URL"
                  aria-label="Site URL"
                />
              ) : null}
            </IntegrationRow>
            <IntegrationRow label="Username" value={editing ? undefined : site.username?.trim() ?? ""}>
              {editing ? (
                <Field
                  defaultValue={site.username ?? ""}
                  onBlur={(e) => patch({ username: e.target.value })}
                  placeholder="Username"
                  aria-label="Username"
                />
              ) : null}
            </IntegrationRow>
            <IntegrationRow label="Password" value={editing ? undefined : site.appPassword?.trim() ? "Set" : ""}>
              {editing ? (
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
            <IntegrationRow label="Benchmark" value={editing ? undefined : site.benchmarkCustomTag?.trim() ?? ""}>
              {editing ? (
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

        <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-3">
          <section
            className={cn(PROPERTIES_OVERVIEW_PANEL_CLASS, "flex min-h-0 flex-1 flex-col")}
            aria-label="Master Rules"
          >
            <PanelHeading title="Master Rules" />
            <MasterInstructionsSection
              siteId={site.id}
              siteUrl={site.siteUrl}
              siteName={site.name}
              disabled={site.enabled === false}
              layout="dropdown"
              editing={editing}
            />
          </section>
          <section className={cn(PROPERTIES_OVERVIEW_PANEL_CLASS, "h-auto shrink-0")} aria-label="Sitemaps">
            <PanelHeading title="Sitemaps" />
            <div className="flex h-8 shrink-0 items-center overflow-hidden">
              {sitemapUrls.length > 0 ? (
                <SelectField
                  placeholder="Sitemap"
                  tone="data"
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
