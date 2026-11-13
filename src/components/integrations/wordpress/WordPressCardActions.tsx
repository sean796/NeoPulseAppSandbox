import React, { useEffect, useRef, useState } from "react";
import {
  TestTube,
  Map,
  Network,
  Database,
  CheckCircle2,
  XCircle,
  BarChart3,
  Building2,
  Download,
} from "lucide-react";
import { getCyberpunkTextClasses } from "./cyberpunk-theme";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";
import type { ConnectionAction, WordPressCardActionsProps } from "./wordpress-card-actions-types";
import { useWordPressCardActions } from "./use-wordpress-card-actions";
import {
  PROPERTIES_DIAGNOSTICS_ICON_CLASS,
  PROPERTIES_DIAGNOSTICS_STRIP_CLASS,
  PROPERTIES_DIAGNOSTICS_TOOL_CLASS,
  PROPERTIES_OVERVIEW_DL_CLASS,
  PROPERTIES_OVERVIEW_PILL_LABEL_CLASS,
  PROPERTIES_OVERVIEW_PILL_ROW_CLASS,
  PROPERTIES_OVERVIEW_PILL_VALUE_CLASS,
} from "./wordpress-properties-surfaces";

/** Fixed two-column result row (label | value). Always mounted; no CLS. */
function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn(PROPERTIES_OVERVIEW_PILL_ROW_CLASS, "h-11 max-h-11 min-h-11")}>
      <span
        className={PROPERTIES_OVERVIEW_PILL_LABEL_CLASS}
        style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
      >
        {label}
      </span>
      <span
        className={cn(PROPERTIES_OVERVIEW_PILL_VALUE_CLASS, "truncate")}
        title={value}
        style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
      >
        {value}
      </span>
    </div>
  );
}

function connectionResultLabel(status: WordPressCardActionsProps["site"]["connectionStatus"]): string {
  if (status === "success") return "OK";
  if (status === "failed") return "Failed";
  if (status === "testing") return "—";
  return "—";
}

export const WordPressCardActions: React.FC<WordPressCardActionsProps> = ({
  site,
  isTesting,
  isDetecting,
  isExtractingNAPAndGraph,
  onTest,
  onDetect,
  onExtractNAPAndGraph,
  onPatchSite,
  tone = "card",
  layout = "default",
}) => {
  const isPropertyBlack = tone === "propertyBlack";
  const isProfileCard = layout === "profileCard";
  const isDisabled = site.enabled === false;
  const {
    isTestingNeoFields,
    isTestingGA,
    isTestingGMB,
    isPullingGMBStats,
    neoFieldsTestResult,
    gmbResult,
    gaResult,
    gmbStatsResult,
    handlePullGMBStats,
    handleTestGMB,
    handleTestGA,
    handleTestNeoFields,
  } = useWordPressCardActions(site);

  const [detectResult, setDetectResult] = useState("—");
  const [napResult, setNapResult] = useState("—");
  const wasDetecting = useRef(false);
  const wasExtracting = useRef(false);
  const siteIdRef = useRef(site.id);

  useEffect(() => {
    if (siteIdRef.current === site.id) return;
    siteIdRef.current = site.id;
    setDetectResult("—");
    setNapResult("—");
  }, [site.id]);

  useEffect(() => {
    if (wasDetecting.current && !isDetecting) setDetectResult("Done");
    wasDetecting.current = isDetecting;
  }, [isDetecting]);

  useEffect(() => {
    if (wasExtracting.current && !isExtractingNAPAndGraph) setNapResult("Done");
    wasExtracting.current = isExtractingNAPAndGraph;
  }, [isExtractingNAPAndGraph]);
  /** Label column in action rows — stays white on black when disabled. */
  const rowLabel = cn("min-w-0 flex-1", isPropertyBlack && "text-white");

  /** Flat action row: fixed icon column; sits in a compact grid cell. */
  const iconSlot = cn(
    "flex shrink-0 items-center justify-center [&>svg]:shrink-0",
    isPropertyBlack
      ? "h-7 w-8 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-white"
      : "h-8 w-9 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:text-foreground",
  );

  const sectionShell = isPropertyBlack
    ? "flex min-h-0 w-full min-w-0 shrink-0 flex-col rounded-lg border border-white/10 bg-white/[0.06] px-3 py-3 shadow-none ring-0 sm:px-4 sm:py-4"
    : "min-w-0 rounded-lg border border-border/50 bg-muted/40 p-2 shadow-none ring-0";

  const sectionTitle = isPropertyBlack
    ? "mb-3 shrink-0 text-base font-semibold tracking-tight text-white [word-spacing:0.2em] sm:mb-4 sm:text-xs"
    : "mb-1.5 text-xs font-semibold tracking-tight text-foreground sm:text-sm";

  const actionGrid =
    "mt-0 grid w-full min-w-0 list-none grid-cols-1 p-0 sm:grid-cols-2 " +
    (isPropertyBlack ? "gap-0 sm:gap-x-0.5 sm:gap-y-0" : "gap-0.5 sm:gap-x-1 sm:gap-y-0.5");

  const actionGridScroll = actionGrid;
  const neoSuccess = neoFieldsTestResult?.success;
  const connectionResult = connectionResultLabel(site.connectionStatus);
  const neoResult =
    neoSuccess === true
      ? neoFieldsTestResult?.dateModifierSet && neoFieldsTestResult?.postId
        ? `OK · post ${neoFieldsTestResult.postId}`
        : "OK"
      : neoSuccess === false
        ? neoFieldsTestResult?.error?.trim() || "Failed"
        : "—";

  const resultRows: Array<{ label: string; value: string }> = [
    { label: "Test Connection", value: connectionResult },
    { label: "Test NEO Fields", value: neoResult },
    { label: "Test GMB Connection", value: gmbResult },
    { label: "Test GA", value: gaResult },
    ...(onExtractNAPAndGraph ? [{ label: "Extract NAP & Graph", value: napResult }] : []),
    { label: "Detect Sitemaps", value: detectResult },
    { label: "Pull GMB Stats To KB", value: gmbStatsResult },
  ];

  const connectionActions: ConnectionAction[] = [
    {
      key: "test",
      label: "Test Connection",
      icon: <TestTube />,
      onClick: onTest,
      disabled: isTesting || isDisabled,
      busy: isTesting,
    },
    {
      key: "neoFields",
      label: "Test NEO Fields",
      icon:
        neoSuccess === true ? (
          <CheckCircle2 className="text-primary" />
        ) : neoSuccess === false ? (
          <XCircle className="text-ui-danger" />
        ) : (
          <Database />
        ),
      onClick: handleTestNeoFields,
      disabled: isTestingNeoFields || isDisabled,
      busy: isTestingNeoFields,
      className: cn(
        neoSuccess === true && "bg-primary/12 hover:bg-primary/18",
        neoSuccess === false && "bg-ui-danger/10 hover:bg-ui-danger/16",
      ),
      title: "Test NEO Fields API and set date_modifier to today on entity post",
    },
    {
      key: "gmb",
      label: "Test GMB Connection",
      icon: <Building2 />,
      onClick: handleTestGMB,
      disabled: isTestingGMB || isDisabled,
      busy: isTestingGMB,
      title: "Test Google Business Profile connection (connect in Settings first)",
    },
    {
      key: "ga",
      label: "Test GA",
      icon: <BarChart3 />,
      onClick: handleTestGA,
      disabled: isTestingGA || isDisabled,
      busy: isTestingGA,
      title: "Test Google Analytics 4 connection (uses GA4 Property ID from Settings)",
    },
    ...(onExtractNAPAndGraph
      ? [
          {
            key: "nap",
            label: "Extract NAP & Graph",
            icon: <Network />,
            onClick: onExtractNAPAndGraph,
            disabled: isExtractingNAPAndGraph || isDisabled,
            busy: isExtractingNAPAndGraph,
          } satisfies ConnectionAction,
        ]
      : []),
    {
      key: "sitemaps",
      label: "Detect Sitemaps",
      icon: <Map />,
      onClick: onDetect,
      disabled: isDetecting || isDisabled,
      busy: isDetecting,
    },
    {
      key: "gmb-stats",
      label: "Pull GMB Stats To KB",
      icon: <Download />,
      onClick: handlePullGMBStats,
      disabled: isPullingGMBStats || isDisabled,
      busy: isPullingGMBStats,
      title: "Pull GMB stats (this month vs last month) into Knowledge Base",
    },
  ];

  if (isProfileCard) {
    return (
      <div className="flex flex-col gap-2">
        <div className={PROPERTIES_DIAGNOSTICS_STRIP_CLASS}>
          {connectionActions.map((action) => (
            <button
              type="button"
              key={action.key}
              className={cn("group", PROPERTIES_DIAGNOSTICS_TOOL_CLASS, action.className)}
              onClick={() => {
                if (action.disabled) return;
                action.onClick();
              }}
              aria-disabled={action.disabled || undefined}
              aria-busy={action.busy || undefined}
              title={action.title}
              style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
            >
              <span
                className={PROPERTIES_DIAGNOSTICS_ICON_CLASS}
                aria-hidden
                style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
              >
                {action.icon}
              </span>
              <span
                className="min-w-0 truncate text-white"
                style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
              >
                {action.label}
              </span>
            </button>
          ))}
        </div>

        <div className={cn(PROPERTIES_OVERVIEW_DL_CLASS, "gap-1")} aria-label="Test results">
          {resultRows.map((row) => (
            <ResultRow key={row.label} label={row.label} value={row.value} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("mt-2 flex min-h-0 w-full max-w-full flex-col", isPropertyBlack ? "gap-1.5" : "gap-2")}>
      <section aria-labelledby="wp-property-actions-testing" className={sectionShell}>
        <h3 id="wp-property-actions-testing" className={sectionTitle}>
          Testing Connections
        </h3>
        <ul className={actionGridScroll}>
          <li className="min-w-0">
            <Button
              variant="quiet"
              onClick={onTest}
              disabled={isTesting || isDisabled}
              aria-busy={isTesting || undefined}
            >
              <span className={iconSlot} aria-hidden>
                <TestTube />
              </span>
              <span className={rowLabel}>Test Connection</span>
            </Button>
          </li>
          <li className="min-w-0">
            <Button
              pressed={Boolean(neoFieldsTestResult?.success)}
              variant="quiet"
              onClick={handleTestNeoFields}
              disabled={isTestingNeoFields || isDisabled}
              aria-busy={isTestingNeoFields || undefined}
              title="Test NEO Fields API and set date_modifier to today on entity post"
            >
              <span className={iconSlot} aria-hidden>
                {neoSuccess === true ? (
                  <CheckCircle2 className="text-primary" />
                ) : neoSuccess === false ? (
                  <XCircle className="text-ui-danger" />
                ) : (
                  <Database />
                )}
              </span>
              <span className={rowLabel}>Test NEO Fields</span>
            </Button>
          </li>
          <li className="min-w-0">
            <Button
              variant="quiet"
              onClick={handleTestGMB}
              disabled={isTestingGMB || isDisabled}
              aria-busy={isTestingGMB || undefined}
              title="Test Google Business Profile connection (connect in Settings first)"
            >
              <span className={iconSlot} aria-hidden>
                <Building2 />
              </span>
              <span className={rowLabel}>Test GMB Connection</span>
            </Button>
          </li>
          <li className="min-w-0">
            <Button
              variant="quiet"
              onClick={handleTestGA}
              disabled={isTestingGA || isDisabled}
              aria-busy={isTestingGA || undefined}
              title="Test Google Analytics 4 connection (uses GA4 Property ID from Settings)"
            >
              <span className={iconSlot} aria-hidden>
                <BarChart3 />
              </span>
              <span className={rowLabel}>Test GA</span>
            </Button>
          </li>
          {onExtractNAPAndGraph ? (
            <li className="min-w-0">
              <Button
                variant="quiet"
                onClick={onExtractNAPAndGraph}
                disabled={isExtractingNAPAndGraph || isDisabled}
                aria-busy={isExtractingNAPAndGraph || undefined}
              >
                <span className={iconSlot} aria-hidden>
                  <Network />
                </span>
                <span className={rowLabel}>Extract NAP & Graph</span>
              </Button>
            </li>
          ) : null}
          <li className="min-w-0">
            <Button
              variant="quiet"
              onClick={onDetect}
              disabled={isDetecting || isDisabled}
              aria-busy={isDetecting || undefined}
            >
              <span className={iconSlot} aria-hidden>
                <Map />
              </span>
              <span className={rowLabel}>Detect Sitemaps</span>
            </Button>
          </li>
          <li className="min-w-0">
            <Button
              variant="quiet"
              onClick={handlePullGMBStats}
              disabled={isPullingGMBStats || isDisabled}
              aria-busy={isPullingGMBStats || undefined}
              title="Pull GMB stats (this month vs last month) into Knowledge Base"
            >
              <span className={iconSlot} aria-hidden>
                <Download />
              </span>
              <span className={rowLabel}>Pull GMB Stats To KB</span>
            </Button>
          </li>
        </ul>
      </section>

      <div className={cn(PROPERTIES_OVERVIEW_DL_CLASS, "gap-1")} aria-label="Test results">
        {resultRows.map((row) => (
          <ResultRow key={row.label} label={row.label} value={row.value} />
        ))}
      </div>

      {neoFieldsTestResult?.success === false && neoFieldsTestResult.requiredConfig?.php ? (
        <div className="rounded-lg bg-ui-danger/12 p-3 text-sm shadow-none ring-0">
          <div className={`mb-1 font-medium ${getCyberpunkTextClasses("secondary")}`}>
            Add to functions.php
          </div>
          <pre className="overflow-x-auto rounded-md bg-muted/50 p-2 text-xs">
            {neoFieldsTestResult.requiredConfig.php.join("\n")}
          </pre>
        </div>
      ) : null}
    </div>
  );
};
