import { useCallback } from "react";
import type { MutableRefObject } from "react";
import { flushSync } from "react-dom";
import { notify } from "@/lib/app-notifications";
import { logger } from "@/lib/logger";
import { NOTIFY_CONNECT_A_WORDPRESS_SITE_FIRST_IN_THE_IN } from "@/lib/notify-messages";
import { useTaskManagerOptional } from "@/contexts/task-manager-context";
import { buildAutoSeoTaskHref } from "@/lib/task-manager/overview-restore";
import { wordpressSiteMenuDisplayName } from "@/lib/wordpress-site-display-name";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewTabBase } from "@/hooks/overview/use-overview-tab-base";
import type { AiseoAfterRowWriteFn } from "@/lib/overview/overview-aiseo-after-upload";
import { stitchHarnessSections } from "@/lib/bulk/bulk-harness-outline";
import { resolveAiseoHarnessSourceHtml } from "@/lib/overview/overview-aiseo-source-html";
import { stripTrailingFaqSection } from "@/lib/overview/overview-blog-faq-append";
import { elementorSectionHeadersFromCachedRow } from "@/lib/elementor-page-content/elementor-section-headers-from-cache";
import { patchElementorSectionInJson } from "@/lib/elementor-page-content/apply-elementor-section-copy";
import { normalizeSectionProseHtml, prosePlainText } from "@/lib/elementor-page-content/extract-text-editor-prose";
import { overviewDateModifierTodayIso } from "@/lib/overview/overview-bulk-seo-payload";
import { runAutoSeoBlogBodyRewrite } from "@/lib/overview/overview-auto-seo-blog-rewrite";
import { rewriteBlogPassageSection } from "@/lib/overview/overview-blog-passage-sections";
import { setOptimizingState } from "@/hooks/content-optimization/optimization-helpers-a";
import { pathSlugToFocusHint } from "@/lib/overview/focus-keyword-path-hint";
import { normalizeFocusKeywordPhrase } from "@/lib/seo-redirect-csv";
import { clearOverviewStudioRevisions } from "@/lib/overview/studio-doc-revisions-store";
import { runAutoSeoMetaAndFaqFinale } from "@/lib/overview/overview-auto-seo-meta-faq-finale";
import { harnessStepProgress } from "@/lib/overview/overview-harness-progress";
import { recordOverviewStudioRevision } from "@/lib/overview/record-overview-studio-revision";
import { overviewBulkRowIndices, overviewBulkRowIndicesForDisplayOrder } from "@/lib/overview/overview-bulk-row-scope";
import { rowUrlMatchesWordPressSite } from "@/lib/overview/overview-aiseo-after-upload-types";
import { hasSubstantiveSeoResearchBrief } from "@/lib/content-optimization/seo-research-brief-for-optimize";
import {
  formatAutoSeoResearchReadingDigest,
  readExistingSeoResearchBriefForAutoSeo,
} from "@/lib/overview/overview-auto-seo-read-research-brief";
import { downloadFieldsFromInventoryRow } from "@/lib/overview/overview-inventory-seo-fields";
import {
  AUTO_SEO_CONTENT_CONCURRENCY,
  AUTO_SEO_RESEARCH_CONCURRENCY,
  AUTO_SEO_RESEARCH_READY_BUFFER,
  runAutoSeoResearchContentPipeline,
} from "@/lib/overview/overview-auto-seo-research-content-pipeline";

const AUTO_SEO_STEPS_PER_POST = 4;
const AUTO_SEO_STEP_RESEARCH = "SERP Research Brief";
const AUTO_SEO_STEP_READING = "Reading Data";
const AUTO_SEO_STEP_OPTIMIZING = "Optimizing content";
const AUTO_SEO_STEP_UPLOAD = "Uploading to WordPress";

type Args = Pick<
  OverviewTabBase,
  | "rowsRef"
  | "displayRowsRef"
  | "updateRow"
  | "opt"
  | "getInventoryMatchForUrl"
  | "sitemapSource"
> & {
  site: WordPressSite | undefined;
  handleDataForSeoResearch: (
    rowIndex: number,
    options?: { skipGsc?: boolean; silent?: boolean },
  ) => Promise<Partial<OverviewRow> | null>;
  handleAiTitleRow: (
    index: number,
    rowOverride?: OverviewRow,
    options?: { skipOptimizeTitleLoading?: boolean },
  ) => Promise<{ title: string; aiTitle: string } | null>;
  handleAiMetaRow: (
    index: number,
    rowOverride?: OverviewRow,
    options?: { skipOptimizeMetaLoading?: boolean },
  ) => Promise<{ metaDescription: string; aiMeta: string } | null>;
  handleAiFaqRowAll: (
    rowIndex: number,
    rowOverride?: OverviewRow,
    options?: {
      silentToast?: boolean;
      skipFaqLoading?: boolean;
      onMicroStep?: () => void;
      seedQuestionCount?: number;
      skipUploadAfterRowWrite?: boolean;
    },
  ) => Promise<void>;
  bulkScopeUrlKeysRef: MutableRefObject<Set<string>>;
  uploadAfterRowWrite?: AiseoAfterRowWriteFn;
};

type WindowWithOptimizeRunId = Window & {
  __neoPulseOptimizeAllRunId?: number;
  /** Clears orphaned Auto SEO busy UI after HMR invalidates an in-flight run. */
  __neoPulseOptimizeAllBusyClear?: () => void;
};

function nextOptimizeAllRunId(): number {
  if (typeof window === "undefined") return 1;
  const w = window as WindowWithOptimizeRunId;
  w.__neoPulseOptimizeAllRunId = (w.__neoPulseOptimizeAllRunId ?? 0) + 1;
  return w.__neoPulseOptimizeAllRunId;
}

function isOptimizeAllRunCurrent(runId: number): boolean {
  if (typeof window === "undefined") return true;
  return (window as WindowWithOptimizeRunId).__neoPulseOptimizeAllRunId === runId;
}

// Invalidate any orphaned pre-HMR loop immediately on module evaluation.
// Also clear busy UI: bumping the run id alone leaves isOptimizing stuck true.
if (typeof window !== "undefined") {
  nextOptimizeAllRunId();
  const clearBusy = (window as WindowWithOptimizeRunId).__neoPulseOptimizeAllBusyClear;
  if (typeof clearBusy === "function") {
    try {
      clearBusy();
    } catch {
      /* ignore */
    }
    (window as WindowWithOptimizeRunId).__neoPulseOptimizeAllBusyClear = undefined;
  }
}

export function useOverviewTabAutoSeoOptimizeAll({
  bulkScopeUrlKeysRef,
  rowsRef,
  displayRowsRef,
  site,
  opt,
  sitemapSource,
  handleDataForSeoResearch,
  handleAiTitleRow,
  handleAiMetaRow,
  handleAiFaqRowAll,
  updateRow,
  uploadAfterRowWrite,
  getInventoryMatchForUrl,
}: Args) {
  const taskManager = useTaskManagerOptional();

  const handleOptimizeAll = useCallback(async () => {
    if (!site) {
      notify.error(NOTIFY_CONNECT_A_WORDPRESS_SITE_FIRST_IN_THE_IN);
      return;
    }
    const scopeKeys = bulkScopeUrlKeysRef.current;
    if (scopeKeys.size === 0) {
      notify.error("No posts in the current grid to optimize. Clear filters or load the sitemap.");
      return;
    }
    const orderedDisplayIndices = overviewBulkRowIndicesForDisplayOrder(
      rowsRef.current,
      displayRowsRef.current,
      scopeKeys,
    );
    let scopedIndices =
      orderedDisplayIndices.length > 0
        ? orderedDisplayIndices
        : overviewBulkRowIndices(rowsRef.current, scopeKeys);
    if (scopedIndices.length === 0) {
      notify.error("No posts in the current grid to optimize.");
      return;
    }
    // Never optimize or upload rows that belong to a different client than
    // the connected site (can only happen with stale rows after a switch).
    const mismatchedCount = scopedIndices.filter((index) => {
      const rowUrl = rowsRef.current[index]?.url?.trim();
      return Boolean(rowUrl) && !rowUrlMatchesWordPressSite(rowUrl!, site);
    }).length;
    if (mismatchedCount > 0) {
      logger.warn(
        `[Auto SEO] Skipping ${mismatchedCount} row(s) that are not on ${site.name || site.siteUrl} (${site.siteUrl})`,
      );
      scopedIndices = scopedIndices.filter((index) => {
        const rowUrl = rowsRef.current[index]?.url?.trim();
        return Boolean(rowUrl) && rowUrlMatchesWordPressSite(rowUrl!, site);
      });
      if (scopedIndices.length === 0) {
        notify.error(
          `These rows are not on ${site.name || site.siteUrl}. The new client's content has not loaded yet, wait for it to load and try again.`,
        );
        return;
      }
    }
    const urls = scopedIndices.map((index) => rowsRef.current[index]!.url);
    const batchKey = `${site.id}-batch`;
    const siteForRun = site;
    const indicesForRun = scopedIndices;
    const urlsForRun = urls;

    const runOptimizeBatch = async (
      taskPatch?: (patch: {
        step?: string;
        progress?: number;
        currentUrl?: string;
        currentTitle?: string;
      }) => void,
      signal?: AbortSignal,
    ) => {
    // Claim the single global run slot (cancels any stale or pre-HMR loop immediately)
    const runId = nextOptimizeAllRunId();
    const runWindow =
      typeof window !== "undefined" ? (window as WindowWithOptimizeRunId) : undefined;
    const clearAutoSeoChrome = () => {
      setOptimizingState(opt.setIsOptimizingContent, batchKey, false);
      opt.setBulkOptimizationState((prev) => {
        const cur = prev[batchKey];
        if (!cur) return prev;
        const nextStatuses = { ...(cur.urlStatuses || {}) };
        for (const [url, status] of Object.entries(nextStatuses)) {
          if (status === "optimizing" || status === "pending") {
            nextStatuses[url] = "skipped";
          }
        }
        return {
          ...prev,
          [batchKey]: {
            ...cur,
            currentStep: "",
            currentUrl: undefined,
            currentProgress: undefined,
            currentStepProgress: undefined,
            urlStatuses: nextStatuses,
          },
        };
      });
      for (let i = 0; i < rowsRef.current.length; i += 1) {
        const r = rowsRef.current[i];
        if (r && r.status !== "idle" && r.status !== "error") {
          updateRow(i, { status: "idle" });
        }
      }
    };
    if (runWindow) {
      runWindow.__neoPulseOptimizeAllBusyClear = clearAutoSeoChrome;
    }

    // Task Manager Cancel / X must stop Auto SEO, not only mark the task cancelled.
    const stopForTaskCancel = () => {
      nextOptimizeAllRunId();
      clearAutoSeoChrome();
      if (runWindow) runWindow.__neoPulseOptimizeAllBusyClear = undefined;
    };
    if (signal?.aborted) {
      stopForTaskCancel();
      return;
    }
    if (signal) {
      signal.addEventListener("abort", stopForTaskCancel, { once: true });
    }

    // Clear any stale row statuses left over from interrupted runs so only 1 row is ever sky-blue
    for (let i = 0; i < rowsRef.current.length; i += 1) {
      const r = rowsRef.current[i];
      if (r && r.status !== "idle") {
        updateRow(i, { status: "idle" });
      }
    }

    flushSync(() => {
      setOptimizingState(opt.setIsOptimizingContent, batchKey, true);
      opt.setBulkOptimizationState((prev) => ({
        ...prev,
        [batchKey]: {
          urls,
          currentIndex: 0,
          urlStatuses: Object.fromEntries(
            urls.map((u, uIdx) => [u, uIdx === 0 ? ("optimizing" as const) : ("pending" as const)]),
          ),
          currentStep: AUTO_SEO_STEP_RESEARCH,
          currentUrl: urls[0],
          runKind: "content",
        },
      }));
    });

    const setStepTelemetry = (
      url: string,
      pos: number,
      stepNumber: number,
      totalSteps: number,
      stepTitle: string,
    ) => {
      if (!isOptimizeAllRunCurrent(runId)) return;
      const pct = Math.min(100, Math.max(5, Math.round((stepNumber / Math.max(totalSteps, 1)) * 100)));
      let shouldPatchTask = false;
      opt.setBulkOptimizationState((prev) => {
        const cur = prev[batchKey];
        const baseUrls = cur?.urls?.length ? cur.urls : urls;
        const prevProgress = cur?.currentProgress ?? 0;
        const chromeUrl = cur?.currentUrl?.trim() || "";
        const chromeStatus = chromeUrl ? cur?.urlStatuses?.[chromeUrl] : undefined;
        // Finished chrome must not lock the UI at 100% Upload — next post takes over.
        const chromeFinished =
          !chromeUrl ||
          chromeStatus === "completed" ||
          chromeStatus === "error" ||
          chromeStatus === "skipped";
        // 3-wide pool: do not yank chrome backward to an earlier step on another URL
        // while the current chrome post is still actively optimizing/uploading.
        const ownsChrome =
          chromeFinished || chromeUrl === url || pct > prevProgress;
        shouldPatchTask = ownsChrome;
        return {
          ...prev,
          [batchKey]: {
            ...(cur || {}),
            urls: baseUrls,
            runKind: "content",
            currentIndex: ownsChrome ? pos : (cur?.currentIndex ?? pos),
            currentUrl: ownsChrome ? url : (cur?.currentUrl ?? url),
            currentStep: ownsChrome ? stepTitle : (cur?.currentStep ?? stepTitle),
            currentProgress: ownsChrome ? pct : prevProgress,
            urlStatuses: {
              ...(cur?.urlStatuses || {}),
              [url]: "optimizing" as const,
            },
            currentStepProgress: ownsChrome
              ? harnessStepProgress(cur?.currentStepProgress, {
                  step: `${stepNumber}/${totalSteps}`,
                  progress: pct,
                  message: stepTitle,
                  harnessPlannedSectionCount: totalSteps,
                })
              : cur?.currentStepProgress,
          },
        };
      });
      if (shouldPatchTask) {
        const row = rowsRef.current.find((r) => r.url === url);
        const currentTitle =
          row?.aiTitle?.trim() || row?.title?.trim() || row?.url?.trim() || undefined;
        taskPatch?.({
          step: stepTitle,
          progress: pct,
          currentUrl: url,
          currentTitle,
        });
      }
    };

    const failedReadingUrls = new Set<string>();
    const markUrlFailed = (url: string, msg: string) => {
      failedReadingUrls.add(url);
      logger.error(`[Auto SEO] ${msg}`);
      const failIdx = scopedIndices.find((i) => rowsRef.current[i]?.url === url);
      if (failIdx != null) updateRow(failIdx, { status: "error" });
      opt.setBulkOptimizationState((prev) => {
        const cur = prev[batchKey];
        if (!cur) return prev;
        return {
          ...prev,
          [batchKey]: {
            ...cur,
            currentStep: msg,
            urlStatuses: { ...(cur.urlStatuses || {}), [url]: "error" },
            urlSkipReasons: { ...(cur.urlSkipReasons || {}), [url]: msg },
          },
        };
      });
    };

    try {
      logger.start(`[Auto SEO] Starting batch on ${scopedIndices.length} item(s) for ${site.name || site.siteUrl}`);
      logger.start(
        `[Auto SEO] Research x${AUTO_SEO_RESEARCH_CONCURRENCY} warms ready buffer ${AUTO_SEO_RESEARCH_READY_BUFFER}; content x${AUTO_SEO_CONTENT_CONCURRENCY}`,
      );

      // Check every post for brief (keywords + inventory) before the 3-wide pipeline
      for (const idx of scopedIndices) {
        const row = rowsRef.current[idx];
        if (!row?.url) continue;
        const url = row.url;
        if (!row.focusKeyword?.trim()) {
          const slugHint = normalizeFocusKeywordPhrase(pathSlugToFocusHint(url) || "");
          if (slugHint) updateRow(idx, { focusKeyword: slugHint });
        }
        const refreshed = rowsRef.current[idx] ?? row;
        if (!hasSubstantiveSeoResearchBrief(refreshed.seoResearch)) {
          const invMatch = getInventoryMatchForUrl(site, url);
          const invBrief = invMatch?.row
            ? downloadFieldsFromInventoryRow(invMatch.row).seoResearch?.trim()
            : "";
          if (invBrief && hasSubstantiveSeoResearchBrief(invBrief)) {
            updateRow(idx, { seoResearch: invBrief });
            logger.start(`[Auto SEO] Loaded existing research brief from inventory for ${url}`);
          }
        }
      }

      const readyWithBrief = scopedIndices.filter((idx) =>
        hasSubstantiveSeoResearchBrief(rowsRef.current[idx]?.seoResearch),
      ).length;
      const missingCount = scopedIndices.length - readyWithBrief;
      logger.start(
        `[Auto SEO] Brief check: ${readyWithBrief} ready, ${missingCount} to create; research x${AUTO_SEO_RESEARCH_CONCURRENCY} content x${AUTO_SEO_CONTENT_CONCURRENCY} readyBuffer ${AUTO_SEO_RESEARCH_READY_BUFFER}`,
      );

      let publishedCount = 0;
      const postJobs = scopedIndices.map((idx, pos) => ({ idx, pos }));

      // Research lane warms next trio + ready buffer; content lane never shares those slots.
      await runAutoSeoResearchContentPipeline({
        posts: postJobs,
        isCurrent: () => isOptimizeAllRunCurrent(runId),
        runResearch: async ({ idx, pos }) => {
          if (!isOptimizeAllRunCurrent(runId)) return null;
          let latestRow = rowsRef.current[idx];
          if (!latestRow?.url) return null;
          const url = latestRow.url;
          if (failedReadingUrls.has(url)) return null;

          clearOverviewStudioRevisions(url);
          updateRow(idx, { status: "optimizing" });

          try {
            if (!hasSubstantiveSeoResearchBrief(latestRow.seoResearch)) {
              setStepTelemetry(url, pos, 1, AUTO_SEO_STEPS_PER_POST, AUTO_SEO_STEP_RESEARCH);
              logger.start(
                `[Auto SEO] [${pos + 1}/${scopedIndices.length}] Creating research brief for ${url}`,
              );
              try {
                const researchPatch = await handleDataForSeoResearch(idx, { silent: true });
                if (!isOptimizeAllRunCurrent(runId)) return null;
                if (researchPatch) updateRow(idx, researchPatch);
                latestRow = rowsRef.current[idx] ?? latestRow;
              } catch (err) {
                const msg =
                  err instanceof Error ? err.message : `Failed to create research brief for ${url}`;
                markUrlFailed(url, msg);
                return null;
              }
            }
            if (!hasSubstantiveSeoResearchBrief(latestRow.seoResearch)) {
              markUrlFailed(url, `Could not load or create a research brief for ${url}.`);
              return null;
            }

            setStepTelemetry(url, pos, 2, AUTO_SEO_STEPS_PER_POST, AUTO_SEO_STEP_READING);
            logger.start(
              `[Auto SEO] [${pos + 1}/${scopedIndices.length}] Reading research brief for ${url}`,
            );
            const readingDigest = await readExistingSeoResearchBriefForAutoSeo({
              seoResearchBrief: latestRow.seoResearch!,
              articleTitle: latestRow.aiTitle?.trim() || latestRow.title || "",
              focusKeyword: latestRow.focusKeyword?.trim() || "",
              pageUrl: url,
              siteId: site.id,
              businessName: site.name,
            });
            if (!isOptimizeAllRunCurrent(runId)) return null;
            return formatAutoSeoResearchReadingDigest(readingDigest);
          } catch (readErr) {
            const msg =
              readErr instanceof Error
                ? readErr.message
                : `Failed to read research brief for ${url}`;
            markUrlFailed(url, msg);
            return null;
          }
        },
        runContent: async ({ idx, pos, digest: researchReadingDigestText }) => {
          if (!isOptimizeAllRunCurrent(runId)) return;
          let latestRow = rowsRef.current[idx];
          if (!latestRow?.url) return;
          const url = latestRow.url;
          if (failedReadingUrls.has(url)) return;

          const revisionRunId = String(runId);

          try {
            logger.start(`[Auto SEO] [${pos + 1}/${scopedIndices.length}] Optimizing ${url}`);
            latestRow = rowsRef.current[idx] ?? latestRow;

            const isPages =
              sitemapSource === "pages" ||
              latestRow.contentFormat === "elementor" ||
              Boolean(latestRow.elementorDataJson?.trim());

            let resolvedHtml =
              latestRow.postContentOptimized?.trim() || latestRow.postContent?.trim() || "";
            if (!isPages) {
              try {
                const sourceRes = await resolveAiseoHarnessSourceHtml({
                  row: latestRow,
                  site,
                  sitemapSource,
                  getInventoryMatchForUrl,
                });
                if (!isOptimizeAllRunCurrent(runId)) return;
                if (sourceRes.html?.trim()) {
                  resolvedHtml = sourceRes.html;
                }
                if (sourceRes.postId && !latestRow.postId) {
                  updateRow(idx, {
                    postId: sourceRes.postId,
                    ...(sourceRes.postType ? { postType: sourceRes.postType } : {}),
                  });
                  latestRow = rowsRef.current[idx] ?? latestRow;
                }
              } catch (err) {
                logger.warn("[Auto SEO] Source HTML resolve warning for", url, err);
              }
            }

            if (!isPages && resolvedHtml.trim() && !latestRow.postContent?.trim()) {
              updateRow(idx, { postContent: resolvedHtml, postContentOptimized: resolvedHtml });
              latestRow = rowsRef.current[idx] ?? latestRow;
            }

            const pageHeaders = isPages
              ? elementorSectionHeadersFromCachedRow(latestRow).filter((sec) => {
                  const key = (sec.title ?? "").trim().toLowerCase();
                  return key !== "faq" && key !== "frequently asked questions";
                })
              : [];

            setStepTelemetry(url, pos, 3, AUTO_SEO_STEPS_PER_POST, AUTO_SEO_STEP_OPTIMIZING);
            updateRow(idx, { status: "optimizing" });

            const runBodySectionsTask = async () => {
              if (isPages) {
                const siblingTitles = pageHeaders.map((s) => s.title);
                const workingHeaders = [...pageHeaders];
                const sectionResults = await Promise.all(
                  workingHeaders.map(async (sec, sIdx) => {
                    if (!isOptimizeAllRunCurrent(runId)) return null;
                    const secBody = (sec.bodyHtml || sec.bodyText || "").trim();
                    if (!secBody) return null;

                    const elBodyBefore = secBody;
                    try {
                      const rewritten = await rewriteBlogPassageSection({
                        mode: "copy",
                        section: {
                          id: sec.id || `sec-${sIdx}`,
                          index: sIdx,
                          h2OpenTag: "<h2>",
                          title: sec.title,
                          bodyHtml: secBody,
                        },
                        siblingTitles: siblingTitles.filter((_, i) => i !== sIdx),
                        articleTitle: latestRow.aiTitle?.trim() || latestRow.title || "",
                        focusKeyword: latestRow.focusKeyword?.trim() || "",
                        seoResearchBrief: latestRow.seoResearch,
                        researchReadingDigest: researchReadingDigestText,
                        siteId: site.id,
                        siteUrl: site.siteUrl,
                        pageUrl: url,
                        businessName: site.name,
                      });
                      if (!isOptimizeAllRunCurrent(runId)) return null;
                      const normalizedHtml = normalizeSectionProseHtml(rewritten.bodyHtml);
                      return { sIdx, sec, elBodyBefore, normalizedHtml };
                    } catch (err) {
                      logger.warn(
                        `[Auto SEO] Page section ${sIdx + 1} warning for ${url}:`,
                        err,
                      );
                      return null;
                    }
                  }),
                );
                if (!isOptimizeAllRunCurrent(runId)) return null;
                let workingElementorJson = latestRow.elementorDataJson?.trim() || "";
                for (const res of sectionResults) {
                  if (!res) continue;
                  const { sIdx, sec, elBodyBefore, normalizedHtml } = res;
                  recordOverviewStudioRevision({
                    pageUrl: url,
                    stepLabel: sec.title?.trim() || `Section ${sIdx + 1}`,
                    sectionTitle: sec.title?.trim() || undefined,
                    runId: revisionRunId,
                    beforeHtml: elBodyBefore,
                    afterHtml: normalizedHtml,
                  });
                  logger.success(
                    `[Auto SEO] Page section ${sIdx + 1}/${workingHeaders.length} rewritten: "${sec.title}" (${normalizedHtml.length} chars) for ${url}`,
                  );
                  workingHeaders[sIdx] = {
                    ...sec,
                    bodyHtml: normalizedHtml,
                    bodyText: prosePlainText(normalizedHtml),
                  };
                  if (workingElementorJson && sec.id) {
                    workingElementorJson = patchElementorSectionInJson(
                      workingElementorJson,
                      sec.id,
                      { bodyHtml: normalizedHtml },
                    );
                  }
                }
                updateRow(idx, {
                  elementorSectionHeaders: [...workingHeaders],
                  ...(workingElementorJson ? { elementorDataJson: workingElementorJson } : {}),
                });
                return null;
              }

              return runAutoSeoBlogBodyRewrite({
                sourceHtml: resolvedHtml,
                articleTitle: latestRow.aiTitle?.trim() || latestRow.title || "",
                focusKeyword: latestRow.focusKeyword?.trim() || "",
                seoResearchBrief: latestRow.seoResearch,
                researchReadingDigest: researchReadingDigestText,
                site,
                pageUrl: url,
                sitemapSource,
                revisionRunId,
                shouldContinue: () => isOptimizeAllRunCurrent(runId),
                onCommitHtml: (nextFull, h2Titles) => {
                  updateRow(idx, {
                    postContentOptimized: nextFull,
                    postContent: nextFull,
                    ...(h2Titles.length > 0 ? { blogH2List: h2Titles } : {}),
                  });
                },
              });
            };

            const runMetaAndFaqTask = async () => {
              if (!isOptimizeAllRunCurrent(runId)) return;
              await runAutoSeoMetaAndFaqFinale({
                rowIndex: idx,
                pageUrl: url,
                revisionRunId,
                getRow: () => rowsRef.current[idx],
                handleAiTitleRow,
                handleAiMetaRow,
                handleAiFaqRowAll,
              });
              // Do not set status idle here: that drops the studio splash between
              // optimize and upload. Idle is set once after publish (or on error).
            };

            const [bodyResult] = await Promise.all([
              runBodySectionsTask(),
              runMetaAndFaqTask(),
            ]);

            if (!isOptimizeAllRunCurrent(runId)) return;

            if (bodyResult && !isPages) {
              const rowAfter = rowsRef.current[idx];
              const currentHtml = (
                rowAfter?.postContentOptimized ||
                rowAfter?.postContent ||
                ""
              ).trim();
              const currentWithoutFaq = stripTrailingFaqSection(currentHtml);
              const latestFaqBlock =
                currentHtml.length > currentWithoutFaq.length
                  ? currentHtml.slice(currentWithoutFaq.length).trim()
                  : bodyResult.trailingFaq;
              const bodyCore = stripTrailingFaqSection(bodyResult.html);
              const mergedHtml = stitchHarnessSections(
                [bodyCore, latestFaqBlock].filter((part) => Boolean(part?.trim())),
              );
              updateRow(idx, {
                postContentOptimized: mergedHtml,
                postContent: mergedHtml,
                ...(bodyResult.h2Titles.length > 0 ? { blogH2List: bodyResult.h2Titles } : {}),
              });
            }

            latestRow = rowsRef.current[idx] ?? latestRow;

            if (!isOptimizeAllRunCurrent(runId)) return;

            if (uploadAfterRowWrite) {
              setStepTelemetry(url, pos, 4, AUTO_SEO_STEPS_PER_POST, AUTO_SEO_STEP_UPLOAD);
              updateRow(idx, { status: "uploading" });
              latestRow = rowsRef.current[idx] ?? latestRow;
              const finalHtml =
                latestRow.postContentOptimized?.trim() || latestRow.postContent?.trim() || "";
              try {
                logger.publish(
                  `[Auto SEO] [${pos + 1}/${scopedIndices.length}] Publishing to WordPress: ${url}`,
                );
                const uploadRes = await uploadAfterRowWrite({
                  index: idx,
                  url,
                  html: finalHtml,
                });
                if (uploadRes && uploadRes.ok) {
                  publishedCount += 1;
                  logger.success(
                    `[Auto SEO] [${pos + 1}/${scopedIndices.length}] Published to WordPress (postId: ${uploadRes.postId ?? "ok"}): ${url}`,
                  );
                  const curRow = rowsRef.current[idx];
                  if (curRow) {
                    updateRow(idx, {
                      title: (curRow.aiTitle || curRow.title || "").trim() || curRow.title,
                      metaDescription:
                        (curRow.aiMeta || curRow.metaDescription || "").trim() ||
                        curRow.metaDescription,
                      aiTitle: "",
                      aiMeta: "",
                      dateModifier: overviewDateModifierTodayIso(),
                      ...(uploadRes.postId ? { postId: uploadRes.postId } : {}),
                    });
                  }
                } else if (uploadRes && uploadRes.error) {
                  logger.warn("[Auto SEO] WP auto-publish warning for", url, uploadRes.error);
                }
              } catch (err) {
                logger.warn("[Auto SEO] WP auto-publish error for", url, err);
              }
            }
          } catch (postErr) {
            logger.warn("[Auto SEO] Article chain error for", url, postErr);
          } finally {
            updateRow(idx, { status: "idle" });
          }

          if (!isOptimizeAllRunCurrent(runId)) return;
          if (!failedReadingUrls.has(url)) {
            let handedOffUrl: string | undefined;
            let handedOffTitle: string | undefined;
            let handedOffStep: string | undefined;
            opt.setBulkOptimizationState((prev) => {
              const cur = prev[batchKey];
              const baseUrls = cur?.urls?.length ? cur.urls : urls;
              const nextStatuses = {
                ...(cur?.urlStatuses || {}),
                [url]: "completed" as const,
              };
              const wasChrome = !cur?.currentUrl || cur.currentUrl === url;
              const nextActiveUrl = wasChrome
                ? Object.entries(nextStatuses).find(
                    ([u, status]) => u !== url && status === "optimizing",
                  )?.[0]
                : undefined;
              if (nextActiveUrl) {
                handedOffUrl = nextActiveUrl;
                handedOffStep = AUTO_SEO_STEP_OPTIMIZING;
                const nextRow = rowsRef.current.find((r) => r.url === nextActiveUrl);
                handedOffTitle =
                  nextRow?.aiTitle?.trim() ||
                  nextRow?.title?.trim() ||
                  nextActiveUrl;
              }
              const nextIndex =
                nextActiveUrl != null ? baseUrls.indexOf(nextActiveUrl) : pos;
              return {
                ...prev,
                [batchKey]: {
                  ...(cur || { urls: baseUrls, currentIndex: pos, currentStep: "Complete" }),
                  urls: baseUrls,
                  runKind: "content",
                  urlStatuses: nextStatuses,
                  ...(wasChrome
                    ? {
                        currentUrl: nextActiveUrl ?? url,
                        currentIndex: nextIndex >= 0 ? nextIndex : pos,
                        currentProgress: nextActiveUrl ? 50 : 100,
                        currentStep: nextActiveUrl
                          ? AUTO_SEO_STEP_OPTIMIZING
                          : `Published ${pos + 1}/${scopedIndices.length}`,
                        currentStepProgress: nextActiveUrl
                          ? harnessStepProgress(cur?.currentStepProgress, {
                              step: `3/${AUTO_SEO_STEPS_PER_POST}`,
                              progress: 50,
                              message: AUTO_SEO_STEP_OPTIMIZING,
                              harnessPlannedSectionCount: AUTO_SEO_STEPS_PER_POST,
                            })
                          : cur?.currentStepProgress,
                      }
                    : {}),
                },
              };
            });
            // Task Manager must leave the finished post and show the next live one.
            if (handedOffUrl) {
              taskPatch?.({
                step: handedOffStep || AUTO_SEO_STEP_OPTIMIZING,
                progress: 50,
                currentUrl: handedOffUrl,
                currentTitle: handedOffTitle,
              });
            } else {
              taskPatch?.({
                step: `Published ${pos + 1}/${scopedIndices.length}`,
                progress: Math.min(
                  100,
                  Math.round(((pos + 1) / Math.max(scopedIndices.length, 1)) * 100),
                ),
                currentUrl: url,
              });
            }
          }
        },
      });

      logger.done(
        `[Auto SEO] Batch finished: ${scopedIndices.length} item(s) processed, ${publishedCount} published to WordPress for ${site.name || site.siteUrl}`,
      );
    } finally {
      signal?.removeEventListener("abort", stopForTaskCancel);
      if (runWindow?.__neoPulseOptimizeAllBusyClear) {
        runWindow.__neoPulseOptimizeAllBusyClear = undefined;
      }
      // Clear busy when this run still owns the slot. If HMR already bumped the
      // run id, module eval calls the busy clearer so the UI does not stick.
      if (isOptimizeAllRunCurrent(runId)) {
        setOptimizingState(opt.setIsOptimizingContent, batchKey, false);
      }
    }
    };

    if (taskManager) {
      await taskManager.startTask({
        title: `Auto SEO (${urlsForRun.length})`,
        kind: "auto_seo",
        siteId: siteForRun.id,
        href: buildAutoSeoTaskHref(sitemapSource, wordpressSiteMenuDisplayName(siteForRun)),
        restore: { sitemapSource },
        run: async (ctx) => {
          await runOptimizeBatch((patch) => ctx.patch(patch), ctx.signal);
        },
      });
      return;
    }

    await runOptimizeBatch();
  }, [
    bulkScopeUrlKeysRef,
    rowsRef,
    displayRowsRef,
    site,
    opt,
    sitemapSource,
    handleDataForSeoResearch,
    handleAiTitleRow,
    handleAiMetaRow,
    handleAiFaqRowAll,
    updateRow,
    uploadAfterRowWrite,
    getInventoryMatchForUrl,
    taskManager,
  ]);

  return { handleOptimizeAll };
}
