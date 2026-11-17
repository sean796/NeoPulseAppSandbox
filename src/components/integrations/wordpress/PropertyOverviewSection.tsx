import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Pencil, Plus, Save, Settings, Trash2 } from "lucide-react";
import { runSemrushSafeFix } from "@/lib/semrush-safe-fix/semrush-safe-fix-api";
import { runPostsContentGapCheck } from "@/lib/posts-content-gap/posts-content-gap-api";
import { runEntitiesContentGapCheck } from "@/lib/entities-content-gap/entities-content-gap-api";
import { runEntitiesPackageFillJob } from "@/lib/entities-content-gap/entities-package-fill-job";
import { runMoneyPageInternalLinks } from "@/lib/money-page-internal-links/money-page-internal-links-api";
import { runEditorialContentAudit } from "@/lib/editorial-content-audit/editorial-content-audit-api";
import { runBlogIdeasStudioBackgroundJob } from "@/lib/bulk/blog-ideas-studio-background-job";
import { fetchAgentRun } from "@/lib/agent-runs-api";
import { trackStartedAgentRun } from "@/lib/task-manager/adapt-agent-run";
import {
  patchWorkspaceTask,
  registerWorkspaceTask,
  startWorkspaceTask,
} from "@/lib/task-manager/runtime-store";
import { resolveSemrushProjectIdForSite } from "@/lib/semrush-project-id-defaults";
import { resolvePropertyClientLogoUrl } from "@/lib/integrations/client-site-logo";
import { resolveClientFromClientUrl } from "@/lib/properties/property-dashboard-slug";
import { useTeam } from "@/contexts/TeamContext";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { AgentRunsContext } from "@/contexts/agent-runs-react-context";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPortal,
  DialogTitle,
  Field,
  SelectField,
} from "@/ui";
import { ASSIGNABLE_SITE_AGENTS } from "@/lib/agent-library/agent-library-api";
import { openSkillsLibrary } from "@/lib/open-skills-library";
import type { WordPressSite } from "../types";
import { propertyHostingLabel } from "./property-profile-view-model";
import { MasterInstructionsSection } from "./MasterInstructionsSection";
import { ProfileCountrySearchSelect, ProfileLocationSelect } from "./ProfileServiceAreaFields";
import { SkillRunClockButton } from "./SkillRunClockButton";
import type { SkillRunSchedule } from "@/lib/skill-run-schedule";
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
import { clientVerticalLabels, readSiteBenchmarkCustomTag } from "@/lib/vertical-benchmark/client-tag-from-site";
import {
  PROPERTIES_OVERVIEW_CHIP_DOT_LITE_CLASS,
  PROPERTIES_OVERVIEW_CHIP_DOT_MUTED_CLASS,
  PROPERTIES_OVERVIEW_CHIP_DOT_OK_CLASS,
  PROPERTIES_OVERVIEW_DL_CLASS,
  PROPERTIES_OVERVIEW_DL_LABEL_CLASS,
  PROPERTIES_OVERVIEW_DL_ROW_CLASS,
  PROPERTIES_OVERVIEW_DL_VALUE_CLASS,
  PROPERTIES_OVERVIEW_IDENTITY_CLASS,
  PROPERTIES_OVERVIEW_PACKAGE_BADGE_CLASS,
  PROPERTIES_OVERVIEW_PANEL_CLASS,
  PROPERTIES_OVERVIEW_PANEL_TITLE_CLASS,
  PROPERTIES_OVERVIEW_PROFILE_EMPTY_CLASS,
  PROPERTIES_OVERVIEW_STACK_CLASS,
} from "./wordpress-properties-surfaces";

export type PropertyOverviewSectionProps = {
  site: WordPressSite;
  onPatchSite?: (siteId: string, patch: Partial<WordPressSite>) => void;
  /** Settings sitemap row. Same setter as the sitemap list. */
  onSetEntitySitemap?: (sitemapUrl: string) => void;
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

function isSelectMenuTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest("[role='listbox']") ||
      target.closest("[data-radix-popper-content-wrapper]"),
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

function PanelHeading({ title, end }: { title: string; end?: ReactNode }) {
  return (
    <div className="flex h-8 shrink-0 items-center">
      <h2 className={PROPERTIES_OVERVIEW_PANEL_TITLE_CLASS}>{title}</h2>
      {end}
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

/** Same grey icon chrome as import/export; flex-1 so four share the badge width. */
const PROFILE_ACTION_BTN_CLASS =
  "inline-flex h-full min-h-0 min-w-0 flex-1 items-center justify-center rounded-none border border-white/10 bg-ui-field px-0 text-foreground shadow-none hover:bg-ui-field-hover disabled:opacity-50";

/** Inline edit controls on the right; fixed height so pills do not shift. */
const VALUE_EDIT_WRAP_CLASS =
  "flex h-8 min-w-0 flex-1 items-center justify-end gap-1.5 overflow-hidden [&_input]:min-w-0 [&_input]:flex-1 [&_input]:bg-black [&_input]:text-right [&_input]:text-white [&_button]:shrink-0";

/** Off / Auto / Run segment inside a black overview pill. Green + black text on hover only. */
const ASSIGNED_AGENT_MODE_BTN_CLASS = cn(
  "inline-flex h-8 min-w-[3.25rem] shrink-0 items-center justify-center px-3 text-base font-medium text-muted-foreground",
  "hover:bg-primary hover:text-black",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground",
  "data-[active=true]:bg-white/10 data-[active=true]:text-white",
);

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
          "flex h-8 min-w-0 flex-1 items-center justify-end overflow-hidden",
          empty ? PROPERTIES_OVERVIEW_PROFILE_EMPTY_CLASS : PROPERTIES_OVERVIEW_DL_VALUE_CLASS,
        )}
        title={empty || children ? undefined : title || value}
        style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
      >
        <FadeText fadeKey={fadeKey} className="flex h-8 min-w-0 w-full flex-1 items-center justify-end">
          {children ? (
            <div className={VALUE_EDIT_WRAP_CLASS}>{children}</div>
          ) : (
            <span className="min-w-0 truncate text-right">{empty ? "Not set" : value}</span>
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

function profileLocationSummary(city: string, state: string, extraCount: number): string {
  const place = [city.trim(), state.trim()].filter(Boolean).join(", ");
  if (!place) return "";
  return extraCount > 0 ? `${place} (+${extraCount})` : place;
}

export function PropertyOverviewSection({
  site,
  onPatchSite,
  onSetEntitySitemap,
  editing = false,
  onToggleEditing,
  onSaveProperty: _onSaveProperty,
  onDeleteProperty,
  onLogoBoxThemeChange,
}: PropertyOverviewSectionProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [safeFixBusy, setSafeFixBusy] = useState(false);
  const [postsGapBusy, setPostsGapBusy] = useState(false);
  const [entitiesGapBusy, setEntitiesGapBusy] = useState(false);
  const [moneyLinksBusy, setMoneyLinksBusy] = useState(false);
  const { activeTeam } = useTeam();
  const { sites } = useWordPressSites();
  const location = useLocation();
  const agentRuns = useContext(AgentRunsContext);
  /** Every skill Run uses the client URL (`/dashboard/{slug}`), not the header connected site. */
  const clientFromUrl = useMemo(
    () => resolveClientFromClientUrl(location.pathname, sites),
    [location.pathname, sites],
  );
  const ga4 = site.ga4PropertyId?.trim() ?? "";
  const ads = site.googleAdsCustomerId?.trim() ?? "";
  const gbpRaw = site.gbpLocationId?.trim() ?? "";
  const gbp = gbpDisplayId(gbpRaw);
  const semrush = (site.semrushSiteAuditProjectId ?? site.semrushPositionTrackingProjectId)?.trim() ?? "";
  const editorialTier = editorialContentPackageShortLabelForSite(site);
  const verticalValue = readSiteBenchmarkCustomTag(site);
  const verticalOptions = useMemo(() => {
    const labels = clientVerticalLabels(sites);
    if (
      verticalValue &&
      !labels.some((label) => label.toLocaleLowerCase() === verticalValue.toLocaleLowerCase())
    ) {
      return [...labels, verticalValue].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    }
    return labels;
  }, [sites, verticalValue]);
  const editorialPackage = resolveEditorialContentPackageForSite(site);
  const wpEngineAccountId = site.wpEngineAccountId?.trim() ?? "";
  const primaryKeyword = site.primaryLocalKeyword?.trim() ?? "";
  const serviceCountry = readSiteServiceCountry(site);
  const logoUrl = resolvePropertyClientLogoUrl(site.id, site.clientLogoUrl);
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
  const [countryDraft, setCountryDraft] = useState(serviceCountry);
  const [extraLocationRows, setExtraLocationRows] = useState(() =>
    readSiteAdditionalLocations(site).map((loc, idx) => ({
      id: loc.id || `loc-${site.id}-extra-${idx + 1}`,
      city: loc.city ?? "",
      state: loc.state ?? "",
      country: loc.country?.trim() || serviceCountry,
    })),
  );
  const [ga4Draft, setGa4Draft] = useState(ga4);
  const [adsDraft, setAdsDraft] = useState(ads);
  const [gbpDraft, setGbpDraft] = useState(gbpRaw);
  const [semrushDraft, setSemrushDraft] = useState(semrush);
  const [usernameDraft, setUsernameDraft] = useState(site.username ?? "");
  const [passwordDraft, setPasswordDraft] = useState(site.appPassword ?? "");
  const [verticalDraft, setVerticalDraft] = useState(verticalValue);
  const [logoThemeDraft, setLogoThemeDraft] = useState<"black" | "white">(
    site.clientLogoBoxTheme === "white" ? "white" : "black",
  );
  const [assignedAgentIdsDraft, setAssignedAgentIdsDraft] = useState<string[]>(
    () => [...(site.assignedAgentIds ?? [])],
  );
  const [skillSchedulesDraft, setSkillSchedulesDraft] = useState(
    () => ({ ...(site.skillSchedules ?? {}) }),
  );
  const savedEntitySitemap =
    site.entitySitemapUrl && sitemapUrls.includes(site.entitySitemapUrl)
      ? site.entitySitemapUrl
      : "";
  const [sitemapPick, setSitemapPick] = useState(savedEntitySitemap);
  const wasEditingRef = useRef(false);
  /** Keep the open menu on a real child sitemap. Fall back to the saved entity sitemap. */
  const sitemapValue = sitemapUrls.includes(sitemapPick) ? sitemapPick : savedEntitySitemap;
  if (sitemapPick !== sitemapValue) {
    setSitemapPick(sitemapValue);
  }

  const seedDraftsFromSite = () => {
    setNameDraft(site.name);
    setLogoDraft(site.clientLogoUrl?.trim() ?? "");
    setLogoThemeDraft(site.clientLogoBoxTheme === "white" ? "white" : "black");
    setKeywordRows(readSiteLocalKeywords(site));
    setCityDraft(readSiteServiceCity(site));
    setStateDraft(readSiteServiceState(site));
    setCountryDraft(readSiteServiceCountry(site));
    setExtraLocationRows(
      readSiteAdditionalLocations(site).map((loc, idx) => ({
        id: loc.id || `loc-${site.id}-extra-${idx + 1}`,
        city: loc.city ?? "",
        state: loc.state ?? "",
        country: loc.country?.trim() || readSiteServiceCountry(site),
      })),
    );
    setGa4Draft(site.ga4PropertyId?.trim() ?? "");
    setAdsDraft(site.googleAdsCustomerId?.trim() ?? "");
    setGbpDraft(site.gbpLocationId?.trim() ?? "");
    setSemrushDraft(
      (site.semrushSiteAuditProjectId ?? site.semrushPositionTrackingProjectId)?.trim() ?? "",
    );
    setUsernameDraft(site.username ?? "");
    setPasswordDraft(site.appPassword ?? "");
    setVerticalDraft(readSiteBenchmarkCustomTag(site));
    setAssignedAgentIdsDraft([...(site.assignedAgentIds ?? [])]);
    setSkillSchedulesDraft({ ...(site.skillSchedules ?? {}) });
  };

  const persistOverviewDrafts = () => {
    if (!onPatchSite) return;
    const name = nameDraft.trim();
    const nextLogo = logoDraft.trim();
    const gbpNext = persistGbpLocationIdInput(gbpDraft);
    const primaryLocPatch = buildSiteLocationsPatch(site, cityDraft, stateDraft, countryDraft);
    const extraPatch = buildSiteAdditionalLocationsPatch(
      { ...site, ...primaryLocPatch },
      extraLocationRows,
    );
    const keywordAfterLoc = buildSiteLocalKeywordsPatch(
      { ...site, ...extraPatch },
      keywordRows,
    );
    const vertical = verticalDraft.trim();
    onPatchSite(site.id, {
      ...(name ? { name } : {}),
      username: usernameDraft,
      appPassword: passwordDraft,
      clientLogoUrl: nextLogo || undefined,
      clientLogoSource: nextLogo ? "manual" : undefined,
      clientLogoFetchedAt: nextLogo ? Date.now() : undefined,
      clientLogoBoxTheme: logoThemeDraft,
      ga4PropertyId: ga4Draft.trim() || undefined,
      googleAdsCustomerId: adsDraft.trim() || undefined,
      gbpLocationId: gbpNext || undefined,
      [semrushKey]: semrushDraft.trim() || undefined,
      benchmarkCustomTag: vertical || undefined,
      assignedAgentIds: assignedAgentIdsDraft,
      skillSchedules: skillSchedulesDraft,
      ...primaryLocPatch,
      ...extraPatch,
      ...keywordAfterLoc,
    });
    onLogoBoxThemeChange?.(logoThemeDraft);
  };

  const pollStartedRun = async (runId: number) => {
    if (!activeTeam?.id) return null;
    const teamId = activeTeam.id;
    let latest = null;
    for (let attempt = 0; attempt < 90; attempt += 1) {
      const run = await fetchAgentRun(teamId, runId);
      if (run) {
        latest = run;
        trackStartedAgentRun(run);
      }
      if (
        run &&
        (run.status === "done" || run.status === "failed" || run.status === "cancelled")
      ) {
        break;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
    }
    void agentRuns?.refreshRuns();
    return latest;
  };

  const startSafeFix = () => {
    if (safeFixBusy) return;
    const client = clientFromUrl;
    if (!client) {
      throw new Error("Unknown client URL. Open a client profile to run this skill.");
    }
    setSafeFixBusy(true);
    void runSemrushSafeFix({
      siteId: client.id,
      siteName: client.name,
      siteUrl: client.siteUrl,
      username: client.username,
      appPassword: client.appPassword,
      semrushSiteAuditProjectId: resolveSemrushProjectIdForSite(client),
      teamId: activeTeam?.id,
    })
      .then(async (result) => {
        if (result.runId) await pollStartedRun(result.runId);
      })
      .catch(() => ({ ok: false as const, error: "request failed" }))
      .finally(() => setSafeFixBusy(false));
  };

  const startPostsContentGap = () => {
    if (postsGapBusy) return;
    const client = clientFromUrl;
    if (!client) {
      throw new Error("Unknown client URL. Open a client profile to run this skill.");
    }
    setPostsGapBusy(true);
    void runPostsContentGapCheck({
      siteId: client.id,
      siteName: client.name,
      siteUrl: client.siteUrl,
      username: client.username,
      appPassword: client.appPassword,
      teamId: activeTeam?.id,
    })
      .then(async (result) => {
        const run = result.runId ? await pollStartedRun(result.runId) : null;
        const gapResult = run?.result as { goalMet?: boolean; gap?: number; postCount?: number } | undefined;
        const postCount = Number(gapResult?.postCount ?? gapResult?.gap ?? 0);
        if (gapResult?.goalMet === true || postCount < 1) return;
        await startWorkspaceTask({
          title: "Blog Ideas Studio",
          kind: "blog_ideas_studio",
          siteId: client.id,
          href: location.pathname,
          run: async (ctx) => {
            const result = await runBlogIdeasStudioBackgroundJob({
              site: client,
              postCount,
              signal: ctx.signal,
              onProgress: (step, progress) => {
                ctx.patch({ step, progress });
              },
            });
            if (result.created < postCount) {
              throw new Error(
                `Blog Ideas Studio created ${result.created}/${postCount} posts.`,
              );
            }
            ctx.patch({
              progress: 100,
              step: `Created ${result.created} post${result.created === 1 ? "" : "s"}`,
              logLines: result.urls,
            });
          },
        });
      })
      .catch(() => ({ ok: false as const, error: "request failed" }))
      .finally(() => setPostsGapBusy(false));
  };

  const startEntitiesContentGap = () => {
    if (entitiesGapBusy) return;
    const client = clientFromUrl;
    if (!client) {
      throw new Error("Unknown client URL. Open a client profile to run this skill.");
    }
    setEntitiesGapBusy(true);
    void runEntitiesContentGapCheck({
      siteId: client.id,
      siteName: client.name,
      siteUrl: client.siteUrl,
      username: client.username,
      appPassword: client.appPassword,
      teamId: activeTeam?.id,
    })
      .then(async (result) => {
        if (!result.ok || !result.runId) {
          const task = registerWorkspaceTask({
            title: "Entities content gap check",
            kind: "entities_content_gap_check",
            siteId: client.id,
            href: location.pathname,
          });
          patchWorkspaceTask(task.id, {
            status: "error",
            errorMessage: result.error?.trim() || "Entities content gap check failed to start.",
            step: "Failed",
          });
          return;
        }
        const run = await pollStartedRun(result.runId);
        if (!run) {
          const task = registerWorkspaceTask({
            title: "Entities content gap check",
            kind: "entities_content_gap_check",
            siteId: client.id,
            href: location.pathname,
            agentRunId: result.runId,
          });
          patchWorkspaceTask(task.id, {
            status: "error",
            errorMessage: "Entities content gap check run was not found.",
            step: "Failed",
          });
          return;
        }
        if (run.status === "failed" || run.status === "cancelled") {
          return;
        }
        const gapResult = run.result as {
          goalMet?: boolean;
          gap?: number;
          entityPageCount?: number;
          count?: { publishTimeHint?: string };
        } | undefined;
        const entityPageCount = Number(gapResult?.entityPageCount ?? gapResult?.gap ?? 0);
        if (gapResult?.goalMet === true || entityPageCount < 1) {
          return;
        }
        const publishTime = gapResult?.count?.publishTimeHint;
        await startWorkspaceTask({
          title: "Entities package fill",
          kind: "entities_content_gap_check",
          siteId: client.id,
          href: location.pathname,
          run: async (ctx) => {
            const fill = await runEntitiesPackageFillJob({
              site: client,
              entityPageCount,
              publishTime,
              signal: ctx.signal,
              onProgress: (step, progress) => {
                ctx.patch({ step, progress });
              },
            });
            ctx.patch({
              progress: 100,
              step: `Created ${fill.created} service-area page${fill.created === 1 ? "" : "s"}`,
              logLines: fill.urls,
            });
          },
        });
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error && err.message.trim()
            ? err.message.trim()
            : "Entities content gap check request failed.";
        const task = registerWorkspaceTask({
          title: "Entities content gap check",
          kind: "entities_content_gap_check",
          siteId: client.id,
          href: location.pathname,
        });
        patchWorkspaceTask(task.id, {
          status: "error",
          errorMessage: message,
          step: "Failed",
        });
      })
      .finally(() => setEntitiesGapBusy(false));
  };

  const startMoneyPageInternalLinks = () => {
    if (moneyLinksBusy) return;
    const client = clientFromUrl;
    if (!client) {
      throw new Error("Unknown client URL. Open a client profile to run this skill.");
    }
    setMoneyLinksBusy(true);
    void runMoneyPageInternalLinks({
      siteId: client.id,
      siteName: client.name,
      siteUrl: client.siteUrl,
      username: client.username,
      appPassword: client.appPassword,
      teamId: activeTeam?.id,
    })
      .then(async (result) => {
        if (!result.ok || !result.runId) {
          const task = registerWorkspaceTask({
            title: "Money page internal links",
            kind: "money_page_internal_links",
            siteId: client.id,
            href: location.pathname,
          });
          patchWorkspaceTask(task.id, {
            status: "error",
            errorMessage: result.error?.trim() || "Money page internal links failed to start.",
            step: "Failed",
          });
          return;
        }
        const run = await pollStartedRun(result.runId);
        if (!run) {
          const task = registerWorkspaceTask({
            title: "Money page internal links",
            kind: "money_page_internal_links",
            siteId: client.id,
            href: location.pathname,
            agentRunId: result.runId,
          });
          patchWorkspaceTask(task.id, {
            status: "error",
            errorMessage: "Money page internal links run was not found.",
            step: "Failed",
          });
        }
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error && err.message.trim()
            ? err.message.trim()
            : "Money page internal links request failed.";
        const task = registerWorkspaceTask({
          title: "Money page internal links",
          kind: "money_page_internal_links",
          siteId: client.id,
          href: location.pathname,
        });
        patchWorkspaceTask(task.id, {
          status: "error",
          errorMessage: message,
          step: "Failed",
        });
      })
      .finally(() => setMoneyLinksBusy(false));
  };

  const startEditorialContentAudit = () => {
    const client = clientFromUrl;
    if (!client) {
      throw new Error("Unknown client URL. Open a client profile to run this skill.");
    }
    void runEditorialContentAudit({
      siteId: client.id,
      siteName: client.name,
      siteUrl: client.siteUrl,
      username: client.username,
      appPassword: client.appPassword,
      teamId: activeTeam?.id,
      site: client,
    })
      .then(async (result) => {
        if (!result.ok || !result.runId) {
          const task = registerWorkspaceTask({
            title: "Editorial content audit",
            kind: "editorial_content_audit",
            siteId: client.id,
            href: location.pathname,
          });
          patchWorkspaceTask(task.id, {
            status: "error",
            errorMessage: result.error?.trim() || "Editorial content audit failed to start.",
            step: "Failed",
          });
          return;
        }
        const run = await pollStartedRun(result.runId);
        if (!run) {
          const task = registerWorkspaceTask({
            title: "Editorial content audit",
            kind: "editorial_content_audit",
            siteId: client.id,
            href: location.pathname,
            agentRunId: result.runId,
          });
          patchWorkspaceTask(task.id, {
            status: "error",
            errorMessage: "Editorial content audit run was not found.",
            step: "Failed",
          });
        }
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error && err.message.trim()
            ? err.message.trim()
            : "Editorial content audit request failed.";
        const task = registerWorkspaceTask({
          title: "Editorial content audit",
          kind: "editorial_content_audit",
          siteId: client.id,
          href: location.pathname,
        });
        patchWorkspaceTask(task.id, {
          status: "error",
          errorMessage: message,
          step: "Failed",
        });
      });
  };

  const commitKeywordRows = (rows: SiteLocalKeyword[]) => {
    setKeywordRows(rows);
  };

  const commitExtraLocations = (
    rows: Array<{ id: string; city: string; state: string; country: string }>,
  ) => {
    setExtraLocationRows(rows);
  };

  useEffect(() => {
    seedDraftsFromSite();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-seed when switching clients
  }, [site.id]);

  useEffect(() => {
    if (editing && !wasEditingRef.current) {
      seedDraftsFromSite();
    }
    if (!editing && wasEditingRef.current) {
      // Pencil off discards unsaved drafts.
      seedDraftsFromSite();
    }
    wasEditingRef.current = editing;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional edge trigger
  }, [editing]);

  const workspacePanel = "h-full min-h-0";
  const contentFadeKey = `${site.id}-${editing ? "edit" : "view"}`;

  const assignLocationOptions = [
    { value: "__unassigned__", label: "Unassigned" },
    ...siteLocations.map((loc) => ({
      value: loc.id,
      label: locationOptionLabel(loc),
    })),
  ];
  const assignLocationMinCh = Math.max(
    "Assign location".length,
    ...assignLocationOptions.map((opt) => opt.label.length),
  );

  const keywordLocationRows = editing ? (
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
              width="auto"
              triggerStyle={{ minWidth: `${assignLocationMinCh + 3}ch` }}
              value={row.locationId ?? "__unassigned__"}
              options={assignLocationOptions}
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
      <IntegrationRow fadeKey={contentFadeKey} label="Location">
        <Field
          value={cityDraft}
          onChange={(e) => setCityDraft(e.target.value)}
          placeholder="City"
          aria-label="City"
        />
        <ProfileLocationSelect
          placeholder={regionPlaceholder(countryDraft)}
          width="sm"
          value={stateDraft}
          options={serviceRegionOptions(countryDraft)}
          disabled={!isServiceCountry(countryDraft)}
          onChange={(next) => setStateDraft(next)}
        />
        <ProfileCountrySearchSelect
          value={countryDraft}
          onChange={(next) => {
            setCountryDraft(next);
            setStateDraft(nextStateForCountry(stateDraft, next));
          }}
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
              const country = countryDraft.trim();
              commitExtraLocations([
                {
                  id: `loc-${site.id}-extra-${Date.now()}`,
                  city: "",
                  state: isServiceCountry(country) ? nextStateForCountry(stateDraft, country) : "",
                  country,
                },
              ]);
            }}
          />
        ) : null}
      </IntegrationRow>
      {extraLocationRows.map((row, idx) => {
        const country =
          row.country?.trim() ||
          countryDraft ||
          serviceCountry ||
          inferServiceCountry(row.state, "");
        const isLastExtra = idx === extraLocationRows.length - 1;
        return (
          <IntegrationRow fadeKey={contentFadeKey} key={row.id} label={`Location ${idx + 2}`}>
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
              aria-label={`Location ${idx + 2} city`}
            />
            <ProfileLocationSelect
              placeholder={regionPlaceholder(country)}
              width="sm"
              value={row.state}
              options={serviceRegionOptions(country)}
              disabled={!isServiceCountry(country)}
              onChange={(next) => {
                commitExtraLocations(
                  extraLocationRows.map((r, i) =>
                    i === idx ? { ...r, state: next, country } : r,
                  ),
                );
              }}
            />
            <ProfileCountrySearchSelect
              value={row.country}
              onChange={(next) => {
                commitExtraLocations(
                  extraLocationRows.map((r, i) =>
                    i === idx
                      ? { ...r, country: next, state: nextStateForCountry(r.state, next) }
                      : r,
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
                  const nextCountry = row.country?.trim() || countryDraft.trim();
                  commitExtraLocations([
                    ...extraLocationRows,
                    {
                      id: `loc-${site.id}-extra-${Date.now()}`,
                      city: "",
                      state: isServiceCountry(nextCountry)
                        ? nextStateForCountry(row.state, nextCountry)
                        : "",
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
      <IntegrationRow
        fadeKey={contentFadeKey}
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
        fadeKey={contentFadeKey}
        label="Location"
        value={profileLocationSummary(
          readSiteServiceCity(site),
          readSiteServiceState(site),
          additionalLocations.length,
        )}
      />
    </>
  );

  return (
    <div className={cn(PROPERTIES_OVERVIEW_STACK_CLASS, "flex-1")}>
      <section className={cn(PROPERTIES_OVERVIEW_IDENTITY_CLASS, "flex-row items-start")} aria-label="Property">
        <dl className={cn(PROPERTIES_OVERVIEW_DL_CLASS, "min-w-0 w-auto flex-1")}>
          <IntegrationRow fadeKey={contentFadeKey} label="Name" value={editing ? undefined : site.name}>
            {editing ? (
              <Field
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Name"
                aria-label="Name"
              />
            ) : null}
          </IntegrationRow>
          <IntegrationRow
            fadeKey={contentFadeKey}
            label="URL"
            value={editing ? undefined : siteHostname(site)}
            title={editing ? undefined : site.siteUrl}
          >
            {editing ? (
              <Field
                value={logoDraft}
                onChange={(e) => setLogoDraft(e.target.value)}
                placeholder="Logo URL"
                aria-label="Logo URL"
              />
            ) : null}
          </IntegrationRow>
          {keywordLocationRows}
        </dl>
          <div className="flex w-[10.5rem] min-w-[10.5rem] max-w-[10.5rem] shrink-0 flex-col gap-1">
            <div className="flex h-[5.75rem] w-full gap-1">
              <div
                className={cn(
                  "flex h-[5.75rem] min-w-0 flex-1 items-center justify-center overflow-hidden rounded-none border border-white/15",
                  logoThemeDraft === "white" ? "bg-white" : "bg-black",
                )}
                aria-label={logoThemeDraft === "white" ? "Logo box white" : "Logo box black"}
              >
                <FadeText
                  fadeKey={contentFadeKey}
                  className="flex h-full w-full items-center justify-center"
                >
                  {(editing ? resolvePropertyClientLogoUrl(site.id, logoDraft) : logoUrl) ? (
                    <img
                      src={editing ? resolvePropertyClientLogoUrl(site.id, logoDraft) : logoUrl}
                      alt=""
                      className="pointer-events-none h-full w-full object-contain object-center p-1"
                    />
                  ) : (
                    <span
                      className={cn(
                        "px-2 text-center text-base font-medium",
                        logoThemeDraft === "white" ? "text-black/50" : "text-white/40",
                      )}
                    >
                      No logo
                    </span>
                  )}
                </FadeText>
              </div>
              <div
                className="flex h-[5.75rem] w-5 shrink-0 flex-col gap-1"
                role="group"
                aria-label="Logo box theme"
              >
                <button
                  type="button"
                  className={cn(
                    "min-h-0 w-5 flex-1 rounded-none border border-white/20 bg-black shadow-none",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    logoThemeDraft === "black" ? "opacity-100 ring-1 ring-white/40" : "opacity-40 hover:opacity-70",
                  )}
                  aria-label="Black logo box"
                  aria-pressed={logoThemeDraft === "black"}
                  disabled={!onPatchSite}
                  title="Black logo box"
                  onClick={() => setLogoThemeDraft("black")}
                />
                <button
                  type="button"
                  className={cn(
                    "min-h-0 w-5 flex-1 rounded-none border border-white/20 bg-white shadow-none",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    logoThemeDraft === "white" ? "opacity-100 ring-1 ring-white/40" : "opacity-40 hover:opacity-70",
                  )}
                  aria-label="White logo box"
                  aria-pressed={logoThemeDraft === "white"}
                  disabled={!onPatchSite}
                  title="White logo box"
                  onClick={() => setLogoThemeDraft("white")}
                />
              </div>
            </div>
            <div className="flex h-[5.75rem] w-full flex-col gap-1">
          <span
            className={cn(
              PROPERTIES_OVERVIEW_PACKAGE_BADGE_CLASS,
              "h-11 min-h-11 max-h-11 flex-none",
              editorialPackage === "lite"
                ? "border-0 bg-sky-500/10"
                : editorialPackage === "standard"
                  ? "border-0 bg-emerald-500/10"
                  : "border-0 bg-zinc-500/10",
            )}
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
          <div className="flex h-11 w-full shrink-0 items-center gap-1">
            <button
              type="button"
              className={cn(
                PROFILE_ACTION_BTN_CLASS,
                settingsOpen && "bg-primary text-black hover:bg-primary/90 [&_svg]:text-black",
              )}
              aria-label="Open property settings"
              aria-pressed={settingsOpen}
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="h-4 w-4 shrink-0" />
            </button>
            <button
              type="button"
              className={cn(
                PROFILE_ACTION_BTN_CLASS,
                editing && "bg-primary text-black hover:bg-primary/90 [&_svg]:text-black",
                !onToggleEditing && "invisible pointer-events-none",
              )}
              aria-label={editing ? "Done editing property" : "Edit property"}
              aria-pressed={editing}
              disabled={!onToggleEditing}
              onClick={onToggleEditing}
            >
              <Pencil className="h-4 w-4 shrink-0" />
            </button>
            <button
              type="button"
              className={cn(PROFILE_ACTION_BTN_CLASS, !onPatchSite && "invisible pointer-events-none")}
              aria-label="Save property"
              disabled={!onPatchSite}
              onClick={persistOverviewDrafts}
            >
              <Save className="h-4 w-4 shrink-0" />
            </button>
            <button
              type="button"
              className={cn(PROFILE_ACTION_BTN_CLASS, !onDeleteProperty && "invisible pointer-events-none")}
              aria-label="Delete property"
              disabled={!onDeleteProperty}
              onClick={() => {
                setDeleteConfirmText("");
                setDeleteOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4 shrink-0" />
            </button>
          </div>
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

      <Dialog modal={false} open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogPortal>
          <div
            className="fixed inset-0 z-40 bg-black/80"
            aria-hidden
            onClick={() => setSettingsOpen(false)}
          />
        </DialogPortal>
        <DialogContent
          className="z-50 rounded-none border-0 bg-zinc-950 text-white sm:max-w-lg"
          onPointerDownOutside={(event) => {
            if (isSelectMenuTarget(event.target)) event.preventDefault();
          }}
          onFocusOutside={(event) => {
            if (isSelectMenuTarget(event.target)) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (isSelectMenuTarget(event.target)) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-base">Settings</DialogTitle>
            <DialogDescription className="sr-only">
              Username, password, WordPress host, vertical, sitemap, and Master Rules for {site.name}.
            </DialogDescription>
          </DialogHeader>
          <div className={PROPERTIES_OVERVIEW_DL_CLASS}>
            <div className={PROPERTIES_OVERVIEW_DL_ROW_CLASS}>
              <span
                className={PROPERTIES_OVERVIEW_DL_LABEL_CLASS}
                style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
              >
                Username
              </span>
              <div className="min-w-0 flex-1 [&_input]:text-white [&_input]:[-webkit-text-fill-color:#fff]">
                <Field
                  value={usernameDraft}
                  onChange={(e) => setUsernameDraft(e.target.value)}
                  placeholder="Username"
                  aria-label="Username"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className={PROPERTIES_OVERVIEW_DL_ROW_CLASS}>
              <span
                className={PROPERTIES_OVERVIEW_DL_LABEL_CLASS}
                style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
              >
                Password
              </span>
              <div className="min-w-0 flex-1 [&_input]:text-white [&_input]:[-webkit-text-fill-color:#fff]">
                <Field
                  value={passwordDraft}
                  onChange={(e) => setPasswordDraft(e.target.value)}
                  placeholder="Password"
                  aria-label="Password"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </div>
            <div className={PROPERTIES_OVERVIEW_DL_ROW_CLASS}>
              <span
                className={PROPERTIES_OVERVIEW_DL_LABEL_CLASS}
                style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
              >
                WordPress
              </span>
              <span
                className={cn(PROPERTIES_OVERVIEW_DL_VALUE_CLASS, "ml-auto text-right")}
                title={wpEngineAccountId || undefined}
                style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
              >
                {propertyHostingLabel(site)}
              </span>
            </div>
            <SelectField
              key={`property-overview-vertical-${site.id}`}
              placeholder="Vertical"
              tone="data"
              width="full"
              value={verticalDraft}
              options={verticalOptions.map((label) => ({ value: label, label }))}
              onValueChange={(label) => setVerticalDraft(label)}
            />
            <SelectField
              key={`property-overview-sitemap-${site.id}`}
              placeholder="Sitemap"
              tone="data"
              width="full"
              value={sitemapValue}
              options={sitemapUrls.map((url) => ({
                value: url,
                label: sitemapOptionLabel(url),
              }))}
              onValueChange={(url) => {
                setSitemapPick(url);
                if (onSetEntitySitemap && url !== site.entitySitemapUrl?.trim()) {
                  onSetEntitySitemap(url);
                }
              }}
              disabled={sitemapUrls.length === 0}
            />
          </div>
          <MasterInstructionsSection
            siteId={site.id}
            siteUrl={site.siteUrl}
            siteName={site.name}
            disabled={site.enabled === false}
            layout="dropdown"
            editing
          />
        </DialogContent>
      </Dialog>

      <div className="grid min-h-0 w-full flex-1 grid-cols-2 items-stretch gap-3">
        <section
          className={cn(PROPERTIES_OVERVIEW_PANEL_CLASS, workspacePanel)}
          aria-label="Integrations"
        >
          <PanelHeading title="Integrations" />
          <dl className={cn(PROPERTIES_OVERVIEW_DL_CLASS, "min-h-0 flex-1 overflow-y-auto")}>
            <IntegrationRow fadeKey={contentFadeKey} label="GA4" value={editing ? undefined : ga4}>
              {editing ? (
                <Field
                  value={ga4Draft}
                  onChange={(e) => setGa4Draft(e.target.value)}
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
                  placeholder="Semrush"
                  aria-label="Semrush"
                />
              ) : null}
            </IntegrationRow>
          </dl>
        </section>
        <section
          className={cn(PROPERTIES_OVERVIEW_PANEL_CLASS, workspacePanel)}
          aria-label="Skills"
        >
        <PanelHeading
          title="Skills"
          end={
            <button
              type="button"
              onClick={() => openSkillsLibrary()}
              className="ml-auto inline-flex h-8 shrink-0 items-center justify-center bg-black px-3 text-base font-medium text-white hover:bg-primary hover:text-black"
            >
              Library
            </button>
          }
        />
        <dl className={cn(PROPERTIES_OVERVIEW_DL_CLASS, "min-h-0 flex-1 overflow-y-auto")}>
          {ASSIGNABLE_SITE_AGENTS.map((agent) => {
            const assigned = assignedAgentIdsDraft.includes(agent.id);
            const setAssigned = (nextOn: boolean) => {
              setAssignedAgentIdsDraft((current) =>
                nextOn
                  ? current.includes(agent.id)
                    ? current
                    : [...current, agent.id]
                  : current.filter((id) => id !== agent.id),
              );
            };
            const runBusy =
              agent.id === "content.posts.gap-check"
                ? postsGapBusy
                : agent.id === "content.entities.gap-check"
                  ? entitiesGapBusy
                  : agent.id === "content.internal-links.money-pages"
                    ? moneyLinksBusy
                    : agent.id === "content.editorial.audit"
                      ? false
                      : safeFixBusy;
            const runNow = () => {
              if (agent.id === "content.posts.gap-check") {
                startPostsContentGap();
                return;
              }
              if (agent.id === "content.entities.gap-check") {
                startEntitiesContentGap();
                return;
              }
              if (agent.id === "content.internal-links.money-pages") {
                startMoneyPageInternalLinks();
                return;
              }
              if (agent.id === "content.editorial.audit") {
                startEditorialContentAudit();
                return;
              }
              startSafeFix();
            };
            return (
              <div
                key={agent.id}
                className={cn(
                  PROPERTIES_OVERVIEW_DL_ROW_CLASS,
                  "h-11 max-h-11 min-h-11 w-full min-w-0 items-center overflow-hidden py-1",
                )}
              >
                <dt
                  className={PROPERTIES_OVERVIEW_DL_LABEL_CLASS}
                  style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
                >
                  {agent.label}
                </dt>
                <dd className="ml-auto flex h-8 shrink-0 items-center gap-0.5">
                  <SkillRunClockButton
                    skillLabel={agent.label}
                    schedule={skillSchedulesDraft[agent.id]}
                    onScheduleChange={(next: SkillRunSchedule) => {
                      setAssignedAgentIdsDraft((current) =>
                        current.includes(agent.id) ? current : [...current, agent.id],
                      );
                      setSkillSchedulesDraft((current) => ({
                        ...current,
                        [agent.id]: next,
                      }));
                    }}
                  />
                  <button
                    type="button"
                    className={ASSIGNED_AGENT_MODE_BTN_CLASS}
                    data-active={!assigned ? "true" : "false"}
                    aria-pressed={!assigned}
                    disabled={!onPatchSite}
                    onClick={() => setAssigned(false)}
                  >
                    Off
                  </button>
                  <button
                    type="button"
                    className={ASSIGNED_AGENT_MODE_BTN_CLASS}
                    data-active={assigned ? "true" : "false"}
                    aria-pressed={assigned}
                    disabled={!onPatchSite}
                    onClick={() => setAssigned(true)}
                  >
                    Auto
                  </button>
                  <button
                    type="button"
                    className={ASSIGNED_AGENT_MODE_BTN_CLASS}
                    aria-label={`Run ${agent.label} now`}
                    aria-busy={runBusy}
                    disabled={runBusy}
                    onClick={runNow}
                  >
                    Run
                  </button>
                </dd>
              </div>
            );
          })}
        </dl>
        </section>
      </div>
    </div>
  );
}
