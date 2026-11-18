import { useEffect, useRef, useState } from "react";
import {
  generateBulkSplashStatus,
  type BulkSplashStatus,
} from "@/lib/bulk/bulk-splash-status-agent";
import { FACT_CHECKING_STEP_LABEL } from "@/lib/content-optimization/research-fact-check";
import { FACT_CHECKER_STEP_LABEL } from "@/lib/content-generation/product-fact-checker";
import { logger } from "@/lib/logger";

export const BULK_SPLASH_STARTER_STATUS: BulkSplashStatus = {
  status: "Optimizing content",
  visual: "writing",
};

export const FACT_CHECKING_SPLASH_STATUS: BulkSplashStatus = {
  status: FACT_CHECKING_STEP_LABEL,
  visual: "factcheck",
};

export const FACT_CHECKER_SPLASH_STATUS: BulkSplashStatus = {
  status: FACT_CHECKER_STEP_LABEL,
  visual: "factchecker",
};

export function isFactCheckingSplashStep(step: string): boolean {
  return step.trim().toLowerCase() === FACT_CHECKING_STEP_LABEL.toLowerCase();
}

export function isFactCheckerSplashStep(step: string): boolean {
  const s = step.trim().toLowerCase();
  const label = FACT_CHECKER_STEP_LABEL.toLowerCase();
  return s === label || s.startsWith(`${label}:`) || s.startsWith(`${label} `);
}

export function defaultSplashStatusForStep(step: string): BulkSplashStatus {
  const s = step.trim().toLowerCase();
  if (!s) return BULK_SPLASH_STARTER_STATUS;
  if (isFactCheckerSplashStep(step)) {
    return FACT_CHECKER_SPLASH_STATUS;
  }
  if (isFactCheckingSplashStep(step)) {
    return FACT_CHECKING_SPLASH_STATUS;
  }
  if (s.includes("upload") || s.includes("publish")) {
    return { status: "Uploading to WordPress", visual: "publish" };
  }
  // Blog Ideas Studio only. Content checklist / blueprint steps must NOT use this line.
  if (
    s.includes("blog idea") ||
    s.includes("blog ideas") ||
    s.includes("generating blog ideas") ||
    (s.includes("curating") && s.includes("idea") && !s.includes("checklist"))
  ) {
    return { status: "Curating blog post ideas", visual: "ideas" };
  }
  if (s.includes("approval") || s.includes("waiting for")) {
    return { status: "Waiting for approval", visual: "writing" };
  }
  if (s.includes("audit") || s.includes("research brief") || s.includes("serp")) {
    return { status: step.trim(), visual: "audit" };
  }
  if (s.includes("title") || s.includes("url") || s.includes("meta")) {
    return { status: step.trim(), visual: "meta" };
  }
  if (
    s.includes("csv") ||
    s.includes("reading") ||
    s.includes("parsing") ||
    s.includes("draft") ||
    s.includes("checklist") ||
    s.includes("blueprint")
  ) {
    return { status: step.trim(), visual: "writing" };
  }
  if (s.includes("sync") || s.includes("scrap") || s.includes("load")) {
    return { status: step.trim(), visual: "writing" };
  }
  return { status: step.trim() || "Optimizing content", visual: "writing" };
}

type UseBulkSplashAiStatusArgs = {
  /** True while a bulk post generation run is in flight. */
  active: boolean;
  /** Newest raw pipeline step (processingStepLog tail, or run status). */
  latestStep: string;
  articleTitle?: string;
  keyword?: string;
  siteName?: string;
};

/**
 * Follows the newest bulk pipeline step and keeps one AI-written status line
 * plus its matching placeholder graphic kind on the generation splash.
 * Fire-and-forget: it never blocks the run, stale replies are dropped,
 * repeated steps are served from cache, and a failed rewrite leaves the
 * previous pair on screen.
 */
export function useBulkSplashAiStatus({
  active,
  latestStep,
  articleTitle,
  keyword,
  siteName,
}: UseBulkSplashAiStatusArgs): BulkSplashStatus {
  const step = latestStep.trim();
  const [statusPair, setStatusPair] = useState<BulkSplashStatus>(() =>
    defaultSplashStatusForStep(step),
  );
  const cacheRef = useRef(new Map<string, BulkSplashStatus>());
  const sequenceRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!active) {
      abortRef.current?.abort();
      sequenceRef.current += 1;
      setStatusPair(defaultSplashStatusForStep(step));
      return;
    }
    if (!step) return;

    const cacheKey = `${keyword?.trim().toLowerCase() ?? ""}::${step}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setStatusPair(cached);
      return;
    }

    const defaultPair = defaultSplashStatusForStep(step);
    setStatusPair(defaultPair);

    // Fact checker / Fact checking own exact labels + graphics; do not paraphrase.
    if (isFactCheckerSplashStep(step)) {
      cacheRef.current.set(cacheKey, FACT_CHECKER_SPLASH_STATUS);
      return;
    }
    if (isFactCheckingSplashStep(step)) {
      cacheRef.current.set(cacheKey, FACT_CHECKING_SPLASH_STATUS);
      return;
    }

    const sequence = ++sequenceRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    void generateBulkSplashStatus({
      step,
      articleTitle,
      keyword,
      siteName,
      signal: controller.signal,
    })
      .then((pair) => {
        cacheRef.current.set(cacheKey, pair);
        if (sequenceRef.current === sequence) {
          setStatusPair(pair);
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        logger.warn("[Bulk] splash status rewrite failed, keeping previous line:", error);
      });
  }, [active, step, articleTitle, keyword, siteName]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return statusPair;
}
