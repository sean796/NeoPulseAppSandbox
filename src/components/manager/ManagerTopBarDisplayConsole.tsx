import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, Download, Pencil, RefreshCw } from "lucide-react";
import { ManagerErrorLogDropdownSection } from "@/components/manager/ManagerErrorLogBell";
import { useManagerErrorLog } from "@/contexts/manager-error-log-context";
import { getAppNotificationState, subscribeAppNotifications } from "@/lib/app-notifications";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { useActiveWordPressSite } from "@/contexts/active-wordpress-site-context";


import { ManagerDisplayChipFace } from "@/components/manager/ManagerDisplayChipFace";
import { SiteDisplayNameDialog } from "@/components/manager/SiteDisplayNameDialog";
import {
  MANAGER_DISPLAY_CONSOLE_ROW,
  MANAGER_DISPLAY_DROPDOWN_PANEL,
  MANAGER_DISPLAY_NAME_CHEVRON_SLOT,
  MANAGER_DISPLAY_NAME_BAND,
  MANAGER_DISPLAY_SITE_WARMING,
  MANAGER_HEADER_BADGE_SIZE,
  managerDisplayNameBandAlertClass,
} from "@/components/manager/manager-header-chip-styles";
import {
  MANAGER_NAV_DROPDOWN_ITEM_BASE,
  managerNavDropdownRowClass,
} from "@/components/manager/manager-top-bar-nav-styles";
import { cn } from "@/lib/utils";
import type { WordPressSite } from "@/components/integrations/types";
import { wordpressSiteMenuDisplayName } from "@/lib/wordpress-site-display-name";
import { navigateToOrganicReporting } from "@/lib/organic-dashboard/organic-reporting-nav";
import { useSitePrefetchState } from "@/hooks/use-site-prefetch-state";
import {
  getEntitySiteWarmCacheIfReady,
  refreshSitePrefetch,
} from "@/lib/local-analysis/entity-site-warm-cache";
import { htmlToMarkdown } from "@/lib/wordpress-converter";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Tooltip, TooltipContent, TooltipTrigger } from "@/ui";

/** Extra lane so labels clear the vertical scrollbar in the site menu. */
const SITE_MENU_SCROLL_GUTTER_PX = 12;
const SITE_MENU_ITEM_INSET = "pl-3 pr-5";

function maxMeasuredWidthPx(root: HTMLElement): number {
  let max = 0;
  for (const el of Array.from(root.children)) {
    const row = el as HTMLElement;
    if (!row.dataset.measure) continue;
    const w = Math.ceil(Math.max(row.getBoundingClientRect().width, row.scrollWidth, row.offsetWidth));
    max = Math.max(max, w);
  }
  return max > 0 ? max + SITE_MENU_SCROLL_GUTTER_PX : 0;
}

function csvCell(value: unknown): string {
  const text =
    value == null
      ? ""
      : typeof value === "string"
        ? value
        : typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : JSON.stringify(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadSitePrefetchBundle(site: WordPressSite): boolean {
  const bundle = getEntitySiteWarmCacheIfReady(site.id);
  if (!bundle) return false;
  const safeSite = wordpressSiteMenuDisplayName(site)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "site";
  const stamp = new Date(bundle.fetchedAt).toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const rows = (bundle.bulkInventoryRows ?? []).map((row) => {
    const rawContent = String(row.fields?.content ?? "");
    // WP REST only returns HTML; CSV content column is simple markdown (same path as Content Opt).
    const contentMd = rawContent.trim() ? htmlToMarkdown(rawContent) : "";
    return {
      collection: row.collection ?? "",
      url: row.url ?? "",
      id: row.id ?? "",
      slug: row.slug ?? "",
      title: row.fields?.title ?? "",
      meta: row.fields?.meta ?? "",
      keyword: row.fields?.keyword ?? "",
      excerpt: row.fields?.excerpt ?? "",
      pageHeading: row.fields?.pageHeading ?? "",
      content: contentMd,
      date_gmt: row.date_gmt ?? "",
      seo_research:
        row.acf && typeof row.acf === "object" && typeof row.acf.seo_research === "string"
          ? row.acf.seo_research
          : "",
      keyword_focus:
        row.acf && typeof row.acf === "object" && typeof row.acf.keyword_focus === "string"
          ? row.acf.keyword_focus
          : "",
      date_modifier:
        row.acf && typeof row.acf === "object" && typeof row.acf.date_modifier === "string"
          ? row.acf.date_modifier
          : "",
      faq:
        row.acf && typeof row.acf === "object" && typeof row.acf.faq === "string"
          ? row.acf.faq
          : "",
    };
  });
  const header = [
    "collection",
    "url",
    "id",
    "slug",
    "title",
    "meta",
    "keyword",
    "excerpt",
    "pageHeading",
    "content",
    "date_gmt",
    "seo_research",
    "keyword_focus",
    "date_modifier",
    "faq",
  ];
  const csv = [
    header.join(","),
    ...rows.map((row) => header.map((key) => csvCell(row[key as keyof typeof row])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeSite}-site-cache-${stamp}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

export function ManagerTopBarDisplayConsole({
  variant,
}: {
  variant: "embedded" | "compact";
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const isOrganicDashboardRoute = /^\/sites\/[^/]+\/organic\/?$/.test(location.pathname);
  const { sites, handleConnectSite, handlePatchSite } = useWordPressSites();
  const { activeWordPressSiteId, setActiveWordPressSiteId } = useActiveWordPressSite();
  const measureRef = useRef<HTMLDivElement>(null);
  const menuContentRef = useRef<HTMLDivElement>(null);
  const [siteMenuOpen, setSiteMenuOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameSite, setRenameSite] = useState<WordPressSite | null>(null);
  const [siteMenuWidthPx, setSiteMenuWidthPx] = useState(0);

  const displayLabels = useMemo(() => sites.map((s) => wordpressSiteMenuDisplayName(s)), [sites]);
  const activeSite = sites.find((s) => s.id === activeWordPressSiteId);
  const { loading: isSiteWarmLoading, refreshing } = useSitePrefetchState(activeSite?.id);
  const activeSitePrefetch = activeSite ? getEntitySiteWarmCacheIfReady(activeSite.id) : null;
  const utilityRowCount = 1 + (activeSitePrefetch ? 1 : 0);
  const [notifyPrimary, setNotifyPrimary] = useState(() => getAppNotificationState().primary);
  useEffect(() => {
    const sync = () => setNotifyPrimary(getAppNotificationState().primary);
    sync();
    return subscribeAppNotifications(sync);
  }, []);
  const { entries: errorLogEntries } = useManagerErrorLog();
  const hasErrorLog = errorLogEntries.length > 0;
  const nameAlertKind =
    !isSiteWarmLoading && hasErrorLog
      ? ("error" as const)
      : notifyPrimary && notifyPrimary.variant !== "loading"
        ? notifyPrimary.variant
        : null;
  const nameBandAlertClass = managerDisplayNameBandAlertClass(nameAlertKind);

  const displayLabelsKey = displayLabels.join("|");
  const measureKey = `${displayLabelsKey}|u${utilityRowCount}|e${hasErrorLog ? 1 : 0}`;
  const syncSiteMenuWidth = () => {
    const root = measureRef.current;
    if (!root) return;
    const nextWidth = maxMeasuredWidthPx(root);
    setSiteMenuWidthPx((prev) => (prev === nextWidth ? prev : nextWidth));
  };
  useLayoutEffect(() => {
    syncSiteMenuWidth();
  }, [measureKey]);
  useLayoutEffect(() => {
    if (!siteMenuOpen) return;
    syncSiteMenuWidth();
    const menu = menuContentRef.current;
    if (!menu) return;
    const contentW = Math.ceil(menu.scrollWidth);
    if (contentW > 0) {
      setSiteMenuWidthPx((prev) => (contentW > prev ? contentW : prev));
    }
  }, [siteMenuOpen, measureKey]);

  const siteChipWidthPx = siteMenuWidthPx > 0 ? siteMenuWidthPx : 120;
  const consoleWidthPx = siteChipWidthPx;

  const siteMenuWidthStyle: CSSProperties | undefined =
    siteMenuWidthPx > 0 ? { width: siteMenuWidthPx, minWidth: siteMenuWidthPx } : undefined;
  const consoleWidthStyle: CSSProperties = { width: consoleWidthPx, minWidth: consoleWidthPx };

  const dropdownAnimateClass =
    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1 duration-200";

  const dropdownItemClass = (index: number, selected = false) =>
    variant === "embedded"
      ? cn(
          MANAGER_NAV_DROPDOWN_ITEM_BASE,
          SITE_MENU_ITEM_INSET,
          managerNavDropdownRowClass(index, selected),
        )
      : cn(
          "cursor-pointer rounded-none py-2.5 text-base font-normal outline-none focus:bg-ui-field-hover/90 data-[highlighted]:bg-ui-field-hover/90",
          SITE_MENU_ITEM_INSET,
        );

  const triggerHoverClass =
    variant === "embedded"
      ? "rounded-none hover:bg-ui-field-hover data-[state=open]:bg-ui-field-hover"
      : "hover:bg-ui-field-hover data-[state=open]:bg-ui-field-hover";

  return (
    <>
      <div
        ref={measureRef}
        className="pointer-events-none fixed top-0 -left-[10000px] flex w-max flex-col items-start opacity-0"
        aria-hidden
      >
        {sites.map((site) => (
          <div
            key={`site-chip-${site.id}`}
            data-measure="site-chip"
            className="flex h-9 w-max items-center bg-ui-field text-base"
          >
            <span className="whitespace-nowrap px-2.5 text-left font-normal">
              {wordpressSiteMenuDisplayName(site)}
            </span>
            <span className={MANAGER_DISPLAY_NAME_CHEVRON_SLOT} aria-hidden>
              <ChevronDown className="h-4 w-4 shrink-0" />
            </span>
          </div>
        ))}
        <div data-measure="utility-row" className={cn("inline-flex items-center gap-2.5 py-2.5", SITE_MENU_ITEM_INSET)}>
          <RefreshCw className="h-4 w-4 shrink-0" aria-hidden />
          <span className="whitespace-nowrap text-base font-normal leading-tight">Site data</span>
        </div>
        {activeSitePrefetch ? (
          <div
            data-measure="utility-row-cache"
            className={cn("inline-flex items-center gap-2.5 py-2.5", SITE_MENU_ITEM_INSET)}
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden />
            <span className="whitespace-nowrap text-base font-normal leading-tight">Cache</span>
          </div>
        ) : null}
        {sites.map((site) => (
          <div
            key={`site-row-${site.id}`}
            data-measure="site-row"
            className={cn("inline-flex w-max items-center gap-2.5 py-2.5", SITE_MENU_ITEM_INSET)}
          >
            <span className="h-8 w-8 min-w-8 max-w-8 shrink-0" aria-hidden />
            <span className="whitespace-nowrap text-base font-normal leading-tight">
              {wordpressSiteMenuDisplayName(site)}
            </span>
          </div>
        ))}
        {hasErrorLog ? (
          <div
            data-measure="error-log-header"
            className={cn("flex w-max items-center justify-between gap-3 py-2.5", SITE_MENU_ITEM_INSET)}
          >
            <span className="whitespace-nowrap text-base font-normal text-white">Error logs</span>
            <span className="flex items-center gap-3">
              <span className="whitespace-nowrap text-base">Copy all</span>
              <span className="whitespace-nowrap text-base">Clear</span>
            </span>
          </div>
        ) : null}
      </div>
      <div className={MANAGER_DISPLAY_CONSOLE_ROW} style={consoleWidthStyle}>
        {sites.length === 0 || !activeSite ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  MANAGER_HEADER_BADGE_SIZE,
                  MANAGER_DISPLAY_NAME_BAND,
                  "inline-flex min-w-[7rem] items-center px-2.5 text-muted-foreground opacity-60",
                )}
                aria-label="None connected"
              >
                None connected
              </span>
            </TooltipTrigger>
            <TooltipContent>None connected</TooltipContent>
          </Tooltip>
        ) : (
          <DropdownMenu open={siteMenuOpen} onOpenChange={setSiteMenuOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                style={siteMenuWidthStyle}
                className={cn(
                  "inline-flex h-9 shrink-0 cursor-pointer items-stretch overflow-visible border-0 bg-transparent p-0 text-left shadow-none outline-none transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-border focus-visible:ring-offset-0",
                  triggerHoverClass,
                  isSiteWarmLoading && MANAGER_DISPLAY_SITE_WARMING,
                )}
                aria-label={`Connected site: ${wordpressSiteMenuDisplayName(activeSite)}${isSiteWarmLoading ? " (loading site data)" : ""}${notifyPrimary ? ` · ${notifyPrimary.title}` : ""}${hasErrorLog ? ` · ${errorLogEntries.length} error(s)` : ""}`}
                aria-haspopup="menu"
              >
                <ManagerDisplayChipFace
                  icon={null}
                  label={wordpressSiteMenuDisplayName(activeSite)}
                  isWarming={isSiteWarmLoading}
                  nameBandClassName={nameBandAlertClass || undefined}
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              ref={menuContentRef}
              align="start"
              collisionPadding={8}
              style={siteMenuWidthStyle}
              className={cn(
                MANAGER_DISPLAY_DROPDOWN_PANEL,
                dropdownAnimateClass,
                "!overflow-y-auto !overflow-x-clip p-0",
              )}
            >
              <DropdownMenuItem
                className={cn(dropdownItemClass(0), "w-full min-w-0 max-w-none shrink-0")}
                aria-label="Refresh site data"
                onSelect={() => {
                  if (activeSite) void refreshSitePrefetch(activeSite);
                }}
              >
                <div className="flex items-center gap-2.5">
                  <RefreshCw
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground",
                      refreshing && "",
                    )}
                    aria-hidden
                  />
                  <span className="whitespace-nowrap text-base font-normal leading-tight">Site data</span>
                </div>
              </DropdownMenuItem>
              {activeSitePrefetch ? (
                <DropdownMenuItem
                  className={cn(dropdownItemClass(1), "w-full min-w-0 max-w-none shrink-0")}
                  aria-label="Download cache"
                  onSelect={() => {
                    if (activeSite) downloadSitePrefetchBundle(activeSite);
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <Download className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="whitespace-nowrap text-base font-normal leading-tight">Cache</span>
                  </div>
                </DropdownMenuItem>
              ) : null}
              {sites.map((site, index) => {
                const selected = site.id === activeSite.id;
                const label = wordpressSiteMenuDisplayName(site);
                const iconClass = selected ? "text-primary" : "text-muted-foreground";
                return (
                  <DropdownMenuItem
                    key={site.id}
                    className={cn(
                      dropdownItemClass(utilityRowCount + index, selected),
                      "w-full min-w-0 max-w-none shrink-0",
                    )}
                    onSelect={(event) => {
                      if (selected) {
                        event.preventDefault();
                        return;
                      }
                      handleConnectSite(site);
                      setActiveWordPressSiteId(site.id);
                      if (isOrganicDashboardRoute) {
                        navigateToOrganicReporting(navigate, site.id);
                      }
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <Button
                        size="icon" icon={Pencil}
                        variant="quiet"
                        aria-label={`Rename ${label}`}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setRenameSite(site);
                          setSiteMenuOpen(false);
                          setRenameDialogOpen(true);
                        }}
                      ></Button>
                      <span className="whitespace-nowrap text-base font-normal leading-tight">{label}</span>
                    </div>
                  </DropdownMenuItem>
                );
              })}
              <ManagerErrorLogDropdownSection />
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <SiteDisplayNameDialog
        open={renameDialogOpen}
        site={renameSite}
        onOpenChange={(open) => {
          setRenameDialogOpen(open);
          if (!open) setRenameSite(null);
        }}
        onSave={(siteId, name) => {
          const site = sites.find((s) => s.id === siteId);
          const trimmed = name.trim();
          if (!site || !trimmed || trimmed === wordpressSiteMenuDisplayName(site)) return;
          handlePatchSite(siteId, { menuDisplayName: trimmed });
        }}
      />
    </>
  );
}

/** @deprecated Use ManagerTopBarDisplayConsole */
export const ManagerTopBarSiteStrip = ManagerTopBarDisplayConsole;
