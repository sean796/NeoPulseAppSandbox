import { notify } from "@/lib/app-notifications";
import {
  NOTIFY_COULD_NOT_DERIVE_A_FOCUS_KEYWORD_FOR_THI,
  NOTIFY_DATAFORSEO_SERP_STORED_AND_JSON_CONTENT_,
} from "@/lib/notify-messages";
import {
  extractSerpDumpJsonFromMcpResponse,
  fetchOptionalDataForSeoSerp,
  mergeSeoContentBriefFromParts,
  resolveSerpDumpJsonForBrief,
} from "@/lib/llm-audit/fetch-seo-content-brief-wave";
import type { LlmAuditBrief, QueryFanout } from "@/lib/overview-seo-content-brief";
import {
  RESEARCH_HARNESS_SECTION_TITLES,
  type ResearchHarnessDoneSummary,
} from "@/lib/overview/overview-research-harness-sections";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import {
  completeRemainingResearchHarnessSteps,
  emitGscCsvDone,
  emitGscQuickWinsNoData,
  emitHarnessError,
  emitHarnessSection,
  emitResearchArtifact,
  emptyLlmAudit,
  harnessStepIsDone,
  hasValidGscDumpFilename,
  resolveGscFilenameForRow,
  runGscQuickWinsContextStep,
  runOpenRouterLlmAuditStep,
  serpPeopleAlsoAskFromMcp,
  uploadSeoBrief,
  type OverviewResearchRowInput,
} from "@/lib/overview/overview-research-row-helpers";

export {
  RESEARCH_NO_GSC_DATA,
  exportOverviewGscForPageUrls,
  firstValidGscDumpFilename,
  hasValidGscDumpFilename,
  isOverviewGscDumpFilename,
} from "@/lib/overview/overview-research-row-helpers";
export type {
  OverviewResearchRowInput,
  ResearchArtifactFile,
} from "@/lib/overview/overview-research-row-helpers";

export type OverviewResearchRowResult = {
  patch: Partial<OverviewRow> | null;
  harnessSummaries?: ResearchHarnessDoneSummary;
};

export async function runOverviewResearchForRow(
  input: OverviewResearchRowInput,
): Promise<OverviewResearchRowResult> {
  const { row, serpDumpUrl } = input;
  const skipGsc = input.skipGsc === true;
  const silent = input.silent === true;
  const harnessSummaries: ResearchHarnessDoneSummary = {};

  const keyword = row.focusKeyword?.trim();
  if (!keyword) {
    const missingKw = "Missing focus keyword";
    completeRemainingResearchHarnessSteps(input, harnessSummaries, missingKw, 0);
    if (!silent) notify.error(NOTIFY_COULD_NOT_DERIVE_A_FOCUS_KEYWORD_FOR_THI);
    return { patch: null, harnessSummaries };
  }

  const pageUrl = row.url?.trim() ?? "";
  let storedFile: string | null = null;
  let serpMcpJson: Awaited<ReturnType<typeof fetchOptionalDataForSeoSerp>>["serpMcpJson"] = null;
  let gscFilename: string | null = null;
  let llmAudit: LlmAuditBrief = emptyLlmAudit(pageUrl);
  let queryFanout: QueryFanout | undefined;
  let serpDumpJson: Record<string, unknown> = { tasks: [] };
  let gscContext: { queries: string[]; pageUrl: string } = { queries: [], pageUrl };
  let briefText = "";

  try {
    // Wave A: SERP and GSC filename are independent (Blog Ideas / Opt style fan-out)
    emitHarnessSection(input, 0, "start");
    const [serpResult, gscFilenameResult] = await Promise.all([
      fetchOptionalDataForSeoSerp({
        keyword,
        site: input.site,
      }),
      skipGsc
        ? Promise.resolve(null as string | null)
        : resolveGscFilenameForRow(input, harnessSummaries),
    ]);
    storedFile = serpResult.storedFile;
    serpMcpJson = serpResult.serpMcpJson;
    if (storedFile) {
      harnessSummaries["DataForSEO SERP"] = `SERP saved: ${storedFile}`;
      emitHarnessSection(input, 0, "done", harnessSummaries["DataForSEO SERP"]);
      const serpInline = extractSerpDumpJsonFromMcpResponse(
        serpMcpJson as Record<string, unknown> | null | undefined,
      );
      if (serpInline) {
        emitResearchArtifact(input, keyword, "dataforseo-serp", serpInline);
      }
    } else {
      const serpMsg =
        serpResult.serpError?.trim() ||
        "DataForSEO SERP unavailable; OpenRouter LLM audit used for SERP research";
      emitHarnessError(input, 0, serpMsg, harnessSummaries);
    }
    gscFilename = skipGsc
      ? emitGscCsvDone(input, null, harnessSummaries)
      : gscFilenameResult;

    // Wave B: audit (needs SERP PAA), dump load (needs SERP), GSC context (needs GSC) in parallel
    const serpPeopleAlsoAsk = serpPeopleAlsoAskFromMcp(
      serpMcpJson as Record<string, unknown> | null | undefined,
    );
    emitHarnessSection(input, 3, "start");

    const [llmStep, serpLoad, gscContextResult] = await Promise.all([
      runOpenRouterLlmAuditStep(
        input,
        keyword,
        pageUrl,
        harnessSummaries,
        serpPeopleAlsoAsk,
      ),
      resolveSerpDumpJsonForBrief({
        storedFile,
        serpMcpJson,
        serpDumpUrl,
      }),
      (async (): Promise<{ queries: string[]; pageUrl: string }> => {
        if (skipGsc) {
          emitHarnessSection(input, 4, "start");
          return emitGscQuickWinsNoData(input, harnessSummaries);
        }
        if (hasValidGscDumpFilename(gscFilename)) {
          return runGscQuickWinsContextStep(
            input,
            gscFilename!,
            pageUrl,
            harnessSummaries,
          );
        }
        emitHarnessSection(input, 4, "start");
        return emitGscQuickWinsNoData(input, harnessSummaries);
      })(),
    ]);
    llmAudit = llmStep.llmAudit;
    queryFanout = llmStep.queryFanout;
    serpDumpJson = serpLoad.serpDumpJson;
    harnessSummaries["SERP dump load"] = serpLoad.loadSummary;
    emitHarnessSection(input, 3, "done", serpLoad.loadSummary);
    emitResearchArtifact(input, keyword, "serp-dump-load", serpDumpJson);
    const serpInlineAfterLoad = extractSerpDumpJsonFromMcpResponse(
      serpMcpJson as Record<string, unknown> | null | undefined,
    );
    if (!serpInlineAfterLoad && Object.keys(serpDumpJson).length > 0) {
      emitResearchArtifact(input, keyword, "dataforseo-serp", serpDumpJson);
    }
    gscContext = gscContextResult;
    emitResearchArtifact(input, keyword, "gsc-quick-wins-context", gscContext);

    // Step 5: Brief merge
    emitHarnessSection(input, 5, "start");
    const merged = mergeSeoContentBriefFromParts({
      serpDumpJson,
      pageUrl,
      focusKeyword: keyword,
      gscPageUrl: gscContext.pageUrl,
      gscQueries: gscContext.queries,
      semrushOverviewJson: null,
      llmAudit,
      queryFanout,
    });
    briefText = JSON.stringify(merged, null, 2);
    harnessSummaries["Brief merge"] = "Brief merged";
    emitHarnessSection(input, 5, "done", harnessSummaries["Brief merge"]);

    const briefSlug = keyword.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 60) || "brief";
    const briefFileName = `serp-research-brief-${briefSlug}.json`;
    input.onResearchArtifact?.({
      name: briefFileName,
      content: briefText,
      mimeType: "application/json;charset=utf-8",
    });

    // Step 6: Brief upload
    emitHarnessSection(input, 6, "start");
    const briefStored = await uploadSeoBrief(briefText, keyword);
    if (briefStored) {
      harnessSummaries["Brief upload"] = `Brief saved: ${briefStored}`;
      emitHarnessSection(input, 6, "done", harnessSummaries["Brief upload"]);
      input.onResearchArtifact?.({
        name: briefStored,
        content: briefText,
        mimeType: "application/json;charset=utf-8",
      });
    } else {
      emitHarnessError(
        input,
        6,
        "Brief upload unavailable; brief JSON saved in generated files",
        harnessSummaries,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failedIndex = RESEARCH_HARNESS_SECTION_TITLES.findIndex(
      (title) => !harnessSummaries[title]?.trim(),
    );
    if (failedIndex >= 0) {
      emitHarnessError(input, failedIndex, message, harnessSummaries);
    }
    completeRemainingResearchHarnessSteps(
      input,
      harnessSummaries,
      "Continued after step error",
      failedIndex >= 0 ? failedIndex + 1 : 0,
    );
  }

  if (!briefText.trim()) {
    try {
      if (!harnessStepIsDone(harnessSummaries, 5)) {
        emitHarnessSection(input, 5, "start");
      }
      const merged = mergeSeoContentBriefFromParts({
        serpDumpJson,
        pageUrl,
        focusKeyword: keyword,
        gscPageUrl: gscContext.pageUrl,
        gscQueries: gscContext.queries,
        semrushOverviewJson: null,
        llmAudit,
        queryFanout,
      });
      briefText = JSON.stringify(merged, null, 2);
      harnessSummaries["Brief merge"] = "Brief merged";
      emitHarnessSection(input, 5, "done", harnessSummaries["Brief merge"]);
      const briefSlug = keyword.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 60) || "brief";
      input.onResearchArtifact?.({
        name: `serp-research-brief-${briefSlug}.json`,
        content: briefText,
        mimeType: "application/json;charset=utf-8",
      });
    } catch (mergeErr) {
      const mergeMessage = mergeErr instanceof Error ? mergeErr.message : String(mergeErr);
      emitHarnessError(input, 5, mergeMessage, harnessSummaries);
    }
  }

  if (!harnessStepIsDone(harnessSummaries, 6)) {
    emitHarnessSection(input, 6, "start");
    const briefStored = briefText.trim() ? await uploadSeoBrief(briefText, keyword) : null;
    if (briefStored) {
      harnessSummaries["Brief upload"] = `Brief saved: ${briefStored}`;
      emitHarnessSection(input, 6, "done", harnessSummaries["Brief upload"]);
      input.onResearchArtifact?.({
        name: briefStored,
        content: briefText,
        mimeType: "application/json;charset=utf-8",
      });
    } else {
      emitHarnessError(
        input,
        6,
        briefText.trim()
          ? "Brief upload unavailable; brief JSON saved in generated files"
          : "Brief upload skipped; brief merge did not produce JSON",
        harnessSummaries,
      );
    }
  }

  completeRemainingResearchHarnessSteps(
    input,
    harnessSummaries,
    "Step did not run",
    0,
  );

  const briefStoredFilename =
    harnessSummaries["Brief upload"]?.replace(/^Brief saved:\s*/i, "").trim() || null;

  const researchPatch: Partial<OverviewRow> = {
    ...(storedFile ? { researchFileName: storedFile } : {}),
    ...(!skipGsc && hasValidGscDumpFilename(gscFilename)
      ? { gscQuickWinsCsvFilename: gscFilename }
      : {}),
    ...(briefText.trim() ? { seoResearch: briefText } : {}),
    ...(briefStoredFilename ? { briefFileName: briefStoredFilename } : {}),
  };

  if (!silent && briefText.trim()) {
    notify.success(NOTIFY_DATAFORSEO_SERP_STORED_AND_JSON_CONTENT_);
  }

  return {
    patch: briefText.trim() ? researchPatch : null,
    harnessSummaries,
  };
}
