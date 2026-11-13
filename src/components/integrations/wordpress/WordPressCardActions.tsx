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
import type { ConnectionAction, WordPressCardActionsProps } from "./wordpress-card-actions-types";
import { useWordPressCardActions } from "./use-wordpress-card-actions";
import {
  PROPERTIES_DIAGNOSTICS_ICON_CLASS,
  PROPERTIES_DIAGNOSTICS_TOOL_CLASS,
  PROPERTIES_OVERVIEW_DL_CLASS,
  PROPERTIES_OVERVIEW_PILL_VALUE_CLASS,
} from "./wordpress-properties-surfaces";

function connectionResultLabel(status: WordPressCardActionsProps["site"]["connectionStatus"]): string {
  if (status === "success") return "OK";
  if (status === "failed") return "Failed";
  return "—";
}

/** One clickable black pill: icon + fixed label | result. */
function ActionResultRow({ action }: { action: ConnectionAction }) {
  return (
    <button
      type="button"
      className={cn(
        "group",
        PROPERTIES_DIAGNOSTICS_TOOL_CLASS,
        "h-11 max-h-11 min-h-11 justify-between",
        action.className,
      )}
      onClick={() => {
        if (action.disabled) return;
        action.onClick();
      }}
      aria-disabled={action.disabled || undefined}
      aria-busy={action.busy || undefined}
      title={action.title}
      style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <span
          className={PROPERTIES_DIAGNOSTICS_ICON_CLASS}
          aria-hidden
          style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
        >
          {action.icon}
        </span>
        <span
          className="min-w-0 truncate text-left text-base font-medium text-white"
          style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
        >
          {action.label}
        </span>
      </span>
      <span
        className={cn(
          PROPERTIES_OVERVIEW_PILL_VALUE_CLASS,
          "min-w-[5.5rem] max-w-[40%] shrink-0 truncate text-right tabular-nums",
        )}
        title={action.result}
        style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
      >
        {action.result}
      </span>
    </button>
  );
}

export const WordPressCardActions: React.FC<WordPressCardActionsProps> = ({
  site,
  isTesting,
  isDetecting,
  isExtractingNAPAndGraph,
  onTest,
  onDetect,
  onExtractNAPAndGraph,
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

  const sectionShell = isPropertyBlack
    ? "flex min-h-0 w-full min-w-0 shrink-0 flex-col rounded-lg border border-white/10 bg-white/[0.06] px-3 py-3 shadow-none ring-0 sm:px-4 sm:py-4"
    : "min-w-0 rounded-lg border border-border/50 bg-muted/40 p-2 shadow-none ring-0";

  const sectionTitle = isPropertyBlack
    ? "mb-3 shrink-0 text-base font-semibold tracking-tight text-white [word-spacing:0.2em] sm:mb-4 sm:text-xs"
    : "mb-1.5 text-xs font-semibold tracking-tight text-foreground sm:text-sm";

  const neoSuccess = neoFieldsTestResult?.success;
  const neoResult =
    neoSuccess === true
      ? neoFieldsTestResult?.dateModifierSet && neoFieldsTestResult?.postId
        ? `OK · post ${neoFieldsTestResult.postId}`
        : "OK"
      : neoSuccess === false
        ? neoFieldsTestResult?.error?.trim() || "Failed"
        : "—";

  const connectionActions: ConnectionAction[] = [
    {
      key: "test",
      label: "Test Connection",
      icon: <TestTube />,
      result: connectionResultLabel(site.connectionStatus),
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
      result: neoResult,
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
      result: gmbResult,
      onClick: handleTestGMB,
      disabled: isTestingGMB || isDisabled,
      busy: isTestingGMB,
      title: "Test Google Business Profile connection (connect in Settings first)",
    },
    {
      key: "ga",
      label: "Test GA",
      icon: <BarChart3 />,
      result: gaResult,
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
            result: napResult,
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
      result: detectResult,
      onClick: onDetect,
      disabled: isDetecting || isDisabled,
      busy: isDetecting,
    },
    {
      key: "gmb-stats",
      label: "Pull GMB Stats To KB",
      icon: <Download />,
      result: gmbStatsResult,
      onClick: handlePullGMBStats,
      disabled: isPullingGMBStats || isDisabled,
      busy: isPullingGMBStats,
      title: "Pull GMB stats (this month vs last month) into Knowledge Base",
    },
  ];

  const actionList = (
    <div className={cn(PROPERTIES_OVERVIEW_DL_CLASS, "gap-1")} aria-label="Diagnostics">
      {connectionActions.map((action) => (
        <ActionResultRow key={action.key} action={action} />
      ))}
    </div>
  );

  if (isProfileCard) {
    return actionList;
  }

  return (
    <div className={cn("mt-2 flex min-h-0 w-full max-w-full flex-col", isPropertyBlack ? "gap-1.5" : "gap-2")}>
      <section aria-labelledby="wp-property-actions-testing" className={sectionShell}>
        <h3 id="wp-property-actions-testing" className={sectionTitle}>
          Testing Connections
        </h3>
        {actionList}
      </section>

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
