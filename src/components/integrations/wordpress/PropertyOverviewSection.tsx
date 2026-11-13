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

/** Fade text/controls only (edit toggle + client select). Pill chrome stays put. */
function FadeText({
  fadeKey,
  className,
  children,
}: {
  fadeKey: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div key={fadeKey} className={cn("properties-overview-edit-fade min-w-0", className)}>
      {children}
    </div>
  );
}

function KpiTile({
  fadeKey,
  label,
  value,
  title,
}: {
  fadeKey: string;
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className={PROPERTIES_OVERVIEW_KPI_TILE_CLASS} title={title}>
      <div className={cn(PROPERTIES_OVERVIEW_PILL_ROW_CLASS, "min-h-11")}>
        <span
          className={PROPERTIES_OVERVIEW_KPI_LABEL_CLASS}
          style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
        >
          {label}
        </span>
        <FadeText fadeKey={fadeKey} className="flex min-w-0 flex-1 items-center">
          <span
            className={PROPERTIES_OVERVIEW_KPI_VALUE_CLASS}
            title={value}
            style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
          >
            {value}
          </span>
        </FadeText>
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

/** Inline edit controls after the label; fixed height so pills do not shift. */
const VALUE_EDIT_WRAP_CLASS =
  "flex h-8 min-w-0 flex-1 items-center justify-start gap-1.5 overflow-hidden [&_input]:min-w-0 [&_input]:flex-1 [&_input]:bg-black [&_input]:text-left [&_input]:text-white [&_button]:shrink-0 [&_[data-slot=select-trigger]]:min-w-0 [&_[data-slot=select-trigger]]:flex-1";

function IntegrationRow({
  fadeKey,
  label,
  value,
  title,
  children,
}: {
  fadeKey: string;
  label: string;
  value?: string;
  title?: string;
  children?: ReactNode;
}) {
  const empty = !children && !value;
  return (
    <div
      className={cn(
        PROPERTIES_OVERVIEW_DL_ROW_CLASS,
        "h-11 max-h-11 min-h-11 w-full items-center overflow-hidden py-1",
      )}
    >
      <dt
        className={PROPERTIES_OVERVIEW_DL_LABEL_CLASS}
        style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
      >
        {label}
      </dt>
      <dd
        className={cn(
          "flex h-8 min-w-0 flex-1 items-center justify-start overflow-hidden",
          empty ? PROPERTIES_OVERVIEW_PROFILE_EMPTY_CLASS : PROPERTIES_OVERVIEW_DL_VALUE_CLASS,
        )}
        title={empty || children ? undefined : title || value}
        style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
      >
        <FadeText fadeKey={fadeKey} className="flex h-8 min-w-0 flex-1 items-center">
          {children ? (
            <div className={VALUE_EDIT_WRAP_CLASS}>{children}</div>
          ) : (
            <span className="truncate text-left">{empty ? "Not set" : value}</span>
          )}
        </FadeText>
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
  /** Sync pick without an empty frame (avoids SelectField flicker on client switch). */
  const sitemapValue =
    sitemapUrls.length > 0 && sitemapUrls.includes(sitemapPick)
      ? sitemapPick
      : (sitemapUrls[0] ?? "");
  if (sitemapPick !== sitemapValue) {
    setSitemapPick(sitemapValue);
  }

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
  const contentFadeKey = `${site.id}-${editing ? "edit" : "view"}`;

  return (
    <div className={PROPERTIES_OVERVIEW_STACK_CLASS}>
      <section className={cn(PROPERTIES_OVERVIEW_IDENTITY_CLASS, "overflow-hidden")} aria-label="Property">
        <div className="flex h-[4.25rem] min-w-0 flex-1 items-stretch gap-1">
          <div
            className={cn(
              "flex h-[4.25rem] w-36 shrink-0 items-center justify-center overflow-hidden rounded-none border border-white/15",
              logoTheme === "white" ? "bg-white" : "bg-black",
            )}
            aria-label={logoTheme === "white" ? "Logo box white" : "Logo box black"}
          >
            <FadeText
              fadeKey={contentFadeKey}
              className="flex h-full w-full items-center justify-center"
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt=""
                  className="pointer-events-none h-full w-full object-contain object-center p-1"
                />
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
            </FadeText>
          </div>
          <div
            className="flex h-[4.25rem] w-5 shrink-0 flex-col gap-1"
            role="group"
            aria-label="Logo box theme"
          >
            <button
              type="button"
              className={cn(
                "min-h-0 w-5 flex-1 rounded-none border border-white/20 bg-black shadow-none",
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
                "min-h-0 w-5 flex-1 rounded-none border border-white/20 bg-white shadow-none",
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
          <div className="flex h-full min-w-0 flex-1 flex-col gap-1">
            <div
              className={cn(
                PROPERTIES_OVERVIEW_PILL_ROW_CLASS,
                "h-8 max-h-8 w-full gap-0 border-0 bg-black px-2",
                editing && "[&_input]:bg-black [&_input]:text-white",
              )}
            >
              <FadeText fadeKey={contentFadeKey} className="flex h-8 min-w-0 flex-1 items-center">
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
                  <div className={cn(PROPERTIES_OVERVIEW_IDENTITY_NAME_CLASS, "truncate")}>{site.name}</div>
                )}
              </FadeText>
            </div>
            <div
              className={cn(
                PROPERTIES_OVERVIEW_PILL_ROW_CLASS,
                "h-8 max-h-8 w-full gap-0 border-0 bg-black px-2",
                editing && "[&_input]:bg-black [&_input]:text-white",
              )}
            >
              <FadeText fadeKey={contentFadeKey} className="flex h-8 min-w-0 flex-1 items-center">
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
                    className={cn(PROPERTIES_OVERVIEW_IDENTITY_URL_CLASS, "truncate")}
                    title={site.siteUrl}
                    style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
                  >
                    {siteHostname(site)}
                  </div>
                )}
              </FadeText>
            </div>
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
        <KpiTile fadeKey={contentFadeKey}
          label="WordPress"
          value={propertyHostingLabel(site)}
          title={wpEngineAccountId || undefined}
        />
        <KpiTile fadeKey={contentFadeKey}
          label="Scheduled"
          value={scheduled ? String(scheduled.count) : "0"}
        />
      </section>

      <div className="grid w-full grid-cols-2 items-stretch gap-3">
        <section className={cn(PROPERTIES_OVERVIEW_PANEL_CLASS, workspacePanel)} aria-label="Profile">
          <PanelHeading title="Profile" />
          <dl className={PROPERTIES_OVERVIEW_DL_CLASS}>
            {editing ? (
              <>
                {keywordRows.length === 0 ? (
                  <IntegrationRow fadeKey={contentFadeKey} label="Keyword">
                    <Button
                      type="button"
                      variant="tool"
                      size="icon"
                      icon={Plus}
                      className="h-8 w-8 shrink-0"
                      aria-label="Add keyword"
                      onClick={() =>
                        commitKeywordRows([
                          {
                            id: `kw-${site.id}-${Date.now()}`,
                            keyword: "",
                          },
                        ])
                      }
                    />
                  </IntegrationRow>
                ) : null}
                {keywordRows.map((row, idx) => {
                  const isLastKeyword = idx === keywordRows.length - 1;
                  return (
                    <IntegrationRow
                      fadeKey={contentFadeKey}
                      key={row.id}
                      label={idx === 0 ? "Keyword" : `Keyword ${idx + 1}`}
                    >
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
                      {isLastKeyword ? (
                        <Button
                          type="button"
                          variant="tool"
                          size="icon"
                          icon={Plus}
                          className="h-8 w-8 shrink-0"
                          aria-label="Add keyword"
                          onClick={() =>
                            commitKeywordRows([
                              ...keywordRows,
                              {
                                id: `kw-${site.id}-${Date.now()}`,
                                keyword: "",
                              },
                            ])
                          }
                        />
                      ) : null}
                    </IntegrationRow>
                  );
                })}
                <IntegrationRow fadeKey={contentFadeKey} label="City">
                  <Field
                    value={cityDraft}
                    onChange={(e) => setCityDraft(e.target.value)}
                    onBlur={(e) => commitPrimaryLocation(e.target.value, stateDraft)}
                    placeholder="City"
                    aria-label="City"
                  />
                  {extraLocationRows.length === 0 ? (
                    <Button
                      type="button"
                      variant="tool"
                      size="icon"
                      icon={Plus}
                      className="h-8 w-8 shrink-0"
                      aria-label="Add location"
                      onClick={() => {
                        const country = isServiceCountry(serviceCountry) ? serviceCountry : "Canada";
                        commitExtraLocations([
                          {
                            id: `loc-${site.id}-extra-${Date.now()}`,
                            city: "",
                            state: nextStateForCountry(stateDraft, country),
                            country,
                          },
                        ]);
                      }}
                    />
                  ) : null}
                </IntegrationRow>
                <IntegrationRow fadeKey={contentFadeKey} label={regionPlaceholder(serviceCountry)}>
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
                  const isLastExtra = idx === extraLocationRows.length - 1;
                  return (
                    <IntegrationRow fadeKey={contentFadeKey} key={row.id} label={`City ${idx + 2}`}>
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
                      {isLastExtra ? (
                        <Button
                          type="button"
                          variant="tool"
                          size="icon"
                          icon={Plus}
                          className="h-8 w-8 shrink-0"
                          aria-label="Add location"
                          onClick={() => {
                            const nextCountry =
                              (row.country && isServiceCountry(row.country) ? row.country : "") ||
                              (isServiceCountry(serviceCountry) ? serviceCountry : "Canada");
                            commitExtraLocations([
                              ...extraLocationRows,
                              {
                                id: `loc-${site.id}-extra-${Date.now()}`,
                                city: "",
                                state: nextStateForCountry(row.state, nextCountry),
                                country: nextCountry,
                              },
                            ]);
                          }}
                        />
                      ) : null}
                    </IntegrationRow>
                  );
                })}
              </>
            ) : (
              <>
                <IntegrationRow fadeKey={contentFadeKey}
                  label="Keyword"
                  value={
                    localKeywords[0]?.keyword || primaryKeyword
                      ? `${localKeywords[0]?.keyword || primaryKeyword}${
                          localKeywords.length > 1 ? ` (+${localKeywords.length - 1})` : ""
                        }`
                      : ""
                  }
                />
                <IntegrationRow fadeKey={contentFadeKey}
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
                <IntegrationRow fadeKey={contentFadeKey}
                  label={regionPlaceholder(serviceCountry)}
                  value={readSiteServiceState(site)}
                />
              </>
            )}
          </dl>
        </section>

        <section
          className={cn(PROPERTIES_OVERVIEW_PANEL_CLASS, workspacePanel)}
          aria-label="Integrations"
        >
          <PanelHeading title="Integrations" />
          <dl className={PROPERTIES_OVERVIEW_DL_CLASS}>
            <IntegrationRow fadeKey={contentFadeKey} label="GA4" value={editing ? undefined : ga4}>
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
            <IntegrationRow fadeKey={contentFadeKey} label="Google Ads" value={editing ? undefined : ads}>
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
            <IntegrationRow fadeKey={contentFadeKey} label="GBP" value={editing ? undefined : gbp} title={gbpRaw || undefined}>
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
            <IntegrationRow fadeKey={contentFadeKey} label="Semrush" value={editing ? undefined : semrush}>
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

        <section
          className={cn(PROPERTIES_OVERVIEW_PANEL_CLASS, workspacePanel)}
          aria-label="Settings"
        >
          <PanelHeading title="Settings" />
          <dl className={PROPERTIES_OVERVIEW_DL_CLASS}>
            <IntegrationRow fadeKey={contentFadeKey} label="Site URL" value={editing ? undefined : site.siteUrl?.trim() ?? ""}>
              {editing ? (
                <Field
                  defaultValue={site.siteUrl ?? ""}
                  onBlur={(e) => patch({ siteUrl: e.target.value.trim() })}
                  placeholder="Site URL"
                  aria-label="Site URL"
                />
              ) : null}
            </IntegrationRow>
            <IntegrationRow fadeKey={contentFadeKey} label="Username" value={editing ? undefined : site.username?.trim() ?? ""}>
              {editing ? (
                <Field
                  defaultValue={site.username ?? ""}
                  onBlur={(e) => patch({ username: e.target.value })}
                  placeholder="Username"
                  aria-label="Username"
                />
              ) : null}
            </IntegrationRow>
            <IntegrationRow fadeKey={contentFadeKey} label="Password" value={editing ? undefined : site.appPassword?.trim() ? "Set" : ""}>
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
            <IntegrationRow fadeKey={contentFadeKey} label="Editorial" value={editorialTier ?? ""} />
            <IntegrationRow fadeKey={contentFadeKey} label="Benchmark" value={editing ? undefined : site.benchmarkCustomTag?.trim() ?? ""}>
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
              fadeKey={contentFadeKey}
            />
          </section>
          <section className={cn(PROPERTIES_OVERVIEW_PANEL_CLASS, "h-auto shrink-0")} aria-label="Sitemaps">
            <PanelHeading title="Sitemaps" />
            <div className="flex h-8 shrink-0 items-center overflow-hidden">
              <SelectField
                key="property-overview-sitemap"
                placeholder="Sitemap"
                tone="data"
                width="full"
                value={sitemapValue}
                options={sitemapUrls.map((url) => ({
                  value: url,
                  label: sitemapOptionLabel(url),
                }))}
                onValueChange={setSitemapPick}
                disabled={sitemapUrls.length === 0}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
