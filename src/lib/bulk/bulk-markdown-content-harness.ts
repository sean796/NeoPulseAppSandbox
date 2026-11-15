import type { AgentConfig } from '@/types/agent-config';
import type { KeywordData } from '../keyword-types';
import type { CSVRow } from './bulk-csv-parser';
import type { BulkProcessingOptions } from '../bulk-auto-generate';
import {
  buildBulkHarnessOutlineFromAgents,
  formatOutlineTitlesForHarnessPrompt,
  stitchHarnessSections,
} from './bulk-harness-outline';
import { formatSapPageWriterBlock } from '@/lib/prompt-builders/sap-page-template';
import { formatCompetitorComparisonWriterBlock } from '@/lib/prompt-builders/competitor-comparison-page-template';
import { isCompetitorComparisonRow } from '@/lib/competitor-research/competitor-csv-row';
import { getBlogModel } from '@/lib/optimization-settings-storage';
import { resolveHarnessHttpReferer } from '@/lib/bulk/harness-openrouter-worker-client';
import {
  assertStitchedHarnessArticle,
} from '@/lib/bulk/harness-section-validate';
import { runHarnessSectionIsolated } from '@/lib/bulk/harness-section-isolation';
import { runHarnessHtmlQualityControl } from '@/lib/content-generation/harness-html-quality-control';
import { findImportedSectionBody } from '@/lib/bulk/blog-import-parser';
import {
  ensureBlogHarnessSummaryLast,
  splitBlogHarnessBodyAndOverview,
} from '@/lib/bulk/blog-harness-summary-agent';
import { buildBlogHarnessAnswerAgent } from '@/lib/bulk/blog-harness-answer-agent';
import {
  buildHarnessSectionAnchorMap,
  formatHarnessInPageAnchorBlock,
} from '@/lib/bulk/harness-section-anchor-ids';
import {
  assertHarnessTokenBudgetPreflight,
  computeHarnessSectionTokenBudgets,
  createHarnessTokenBudgetTracker,
  isHarnessSeoOpenerBodyAgent,
} from '@/lib/bulk/harness-section-max-tokens';
import {
  formatPageLocalContextPromptBlock,
  resolvePageLocalContext,
} from '@/lib/content-optimization/page-local-context';
import type { AIDrivenACFContext } from "@/lib/content-generation/ai-driven-post-fields-reader";
import { mergeOptimizerInstructions } from "@/lib/prompt-builders/system-user";
import { resolveAgentsForBulk } from "./bulk-blueprint-agents";
import type { HarnessPromptEnv } from '@/lib/bulk/bulk-markdown-content-harness-types';
import { agentHasIllustrativeFeature, stripTrailingCopyrightBoilerplate } from '@/lib/bulk/bulk-markdown-content-harness-utils';
import { runPressReleaseHarnessContent } from '@/lib/bulk/bulk-markdown-content-harness-press';
import { createBlogHarnessSectionRuntime } from '@/lib/bulk/bulk-markdown-content-harness-blog-section';
import { logger } from '@/lib/logger';

export type { HarnessPromptEnv } from '@/lib/bulk/bulk-markdown-content-harness-types';
export { stripTrailingCopyrightBoilerplate } from '@/lib/bulk/bulk-markdown-content-harness-utils';

export async function generateMarkdownContentHarnessed(
  blueprint: { title?: string; purpose?: string; agents: AgentConfig[] },
  row: CSVRow,
  keywordData: KeywordData,
  knowledgeFiles: Array<{ name: string; content: string }>,
  activeKnowledgeBaseText: string,
  options: BulkProcessingOptions,
  harnessRowIndex: number,
  connectedSite?: { name: string; siteUrl: string },
  wordPressPosts?: Array<{ id: number; slug: string; title: string; excerpt: string; link: string; date_gmt: string }>,
  siteSummary?: string,
  semrushKeywordsContext?: string,
  semrushScatterContext?: string,
  semrushExternalUrls?: string[],
  promptEnv?: HarnessPromptEnv,
): Promise<string> {
  void knowledgeFiles;
  void activeKnowledgeBaseText;
  const { buildSystemPrompt, buildBulkHarnessSectionUserPrompt, generateSingleSectionPrompt } =
    await import('../prompt-builders');
  const knowledgeBaseContext =
    typeof promptEnv?.knowledgeBaseContext === 'string' && promptEnv.knowledgeBaseContext.trim().length > 0
      ? promptEnv.knowledgeBaseContext.trim()
      : '';

  const rawAgentsForBulk = resolveAgentsForBulk(blueprint);
  if (rawAgentsForBulk.length === 0) {
    throw new Error('Harness: blueprint has no agents to generate');
  }
  const agentsForBulk = ensureBlogHarnessSummaryLast(rawAgentsForBulk, promptEnv?.contentKind);

  const isPressReleaseHarness = promptEnv?.contentKind === "press_release";
  const releaseTopic =
    promptEnv?.primaryKeyword?.trim() || row.keyword?.trim() || row.keyword_focus?.trim() || "";
  const bulkPrimaryKw =
    promptEnv?.primaryKeyword?.trim() || row.keyword?.trim() || row.keyword_focus?.trim() || "";

  const finalizeStitchedHarnessHtml = async (stitchedHtml: string): Promise<string> => {
    if (isPressReleaseHarness) return stitchedHtml;
    options.onProgress?.(harnessRowIndex, 0, 'Quality control: checking HTML...');
    try {
      return await runHarnessHtmlQualityControl({
        html: stitchedHtml,
        apiKey: options.openRouterApiKey,
        model: getBlogModel(promptEnv?.siteId),
      });
    } catch (qcErr) {
      const msg = qcErr instanceof Error ? qcErr.message : String(qcErr);
      logger.warn(`[Bulk Harness] Quality control failed; posting stitched HTML: ${msg}`);
      options.onProgress?.(harnessRowIndex, 0, 'Quality control failed; posting draft as generated.');
      return stitchedHtml;
    }
  };

  const sectionProgress = (message: string) => {
    options.onProgress?.(harnessRowIndex, 0, message);
  };

  const entityFromRow =
    row.entity &&
    row.entity.trim() &&
    row.entity.trim() !== 'N/A'
      ? row.entity.trim()
      : undefined;
  const harnessEntity = promptEnv?.harnessEntity?.trim();
  const entity =
    harnessEntity && harnessEntity !== 'N/A'
      ? harnessEntity
      : entityFromRow;
  const entityWikipediaUrl = row.wikipedia_url?.trim() || undefined;

  const harnessKeyword =
    promptEnv?.primaryKeyword?.trim()
    || row.keyword_focus?.trim()
    || row.keyword?.trim()
    || "";
  const harnessPageCtx = promptEnv?.wordpressSite
    ? resolvePageLocalContext({
        keyword: harnessKeyword,
        site: promptEnv.wordpressSite,
        entity,
      })
    : null;
  const harnessPageLocalBlock =
    harnessPageCtx?.primaryCity ? formatPageLocalContextPromptBlock(harnessPageCtx) : "";

  const competitorComparisonHarness = isCompetitorComparisonRow(row);
  const acfContext: AIDrivenACFContext =
    promptEnv?.acfContextOverride ??
    ({
      promptModifier: mergeOptimizerInstructions(options.optionalPrompt, row.prompt_modifier),
      keywordFocus: row.keyword_focus?.trim() || undefined,
      serviceArea: competitorComparisonHarness
        ? row.competitor_fields?.trim() || undefined
        : row.service_area_fields?.trim() || undefined,
    } satisfies AIDrivenACFContext);

  const portfolioBlocked = options.portfolioBlockedHosts;

  let systemPrompt = await buildSystemPrompt(
    knowledgeBaseContext,
    options.openRouterApiKey,
    connectedSite,
    wordPressPosts,
    promptEnv?.currentPageUrl,
    entity,
    promptEnv?.siteId,
    promptEnv?.primaryKeyword,
    siteSummary,
    semrushExternalUrls,
    portfolioBlocked,
    promptEnv?.contentKind,
    'harness_section',
    '',
    promptEnv?.llmAuditAuthorityExternalPairs,
    promptEnv?.linkTargetsPlan,
  );


  if (entity && !isPressReleaseHarness) {
    systemPrompt += competitorComparisonHarness
      ? `\n${formatCompetitorComparisonWriterBlock(entity, connectedSite?.name)}`
      : `\n${formatSapPageWriterBlock(entity)}`;
  }

  const { openRouterMaxOutputTokens } = await import("@/lib/openrouter-stream-token-limits");
  const totalBudget =
    options.maxTokens && options.maxTokens > 0 ? options.maxTokens : openRouterMaxOutputTokens();
  const httpReferer = resolveHarnessHttpReferer();
  const harnessFormat = isPressReleaseHarness ? ("markdown" as const) : ("html" as const);

  if (isPressReleaseHarness) {
    return runPressReleaseHarnessContent({
      blueprint,
      row,
      keywordData,
      options,
      harnessRowIndex,
      connectedSite,
      wordPressPosts,
      semrushKeywordsContext,
      semrushScatterContext,
      semrushExternalUrls,
      promptEnv,
      agentsForBulk,
      systemPrompt,
      totalBudget,
      httpReferer,
      harnessFormat,
      releaseTopic,
      entity,
      acfContext,
      portfolioBlocked,
      competitorComparisonHarness,
      buildBulkHarnessSectionUserPrompt,
      generateSingleSectionPrompt,
    });
  }

  const { bodyAgents, overviewAgent } = splitBlogHarnessBodyAndOverview(agentsForBulk);
  if (!overviewAgent) {
    throw new Error('Harness: missing Overview agent');
  }
  if (bodyAgents.length === 0) {
    throw new Error('Harness: no body sections to generate');
  }

  const answerAgent = buildBlogHarnessAnswerAgent();
  const bodyOutline = buildBulkHarnessOutlineFromAgents(bodyAgents);
  const bodyAnchors = buildHarnessSectionAnchorMap(bodyOutline);
  const publishedSectionTitles = ['Answer', 'Overview', ...bodyOutline.map((x) => x.displayTitle)];
  const totalSections = bodyAgents.length + 2;
  const outlineBlock = formatOutlineTitlesForHarnessPrompt(bodyOutline);

  const harnessTokenSlots = computeHarnessSectionTokenBudgets(
    [
      {
        sectionKey: 'Answer',
        agent: answerAgent,
        isOverview: false,
        isAnswer: true,
      },
      {
        sectionKey: 'Overview',
        agent: overviewAgent,
        isOverview: true,
        bodySectionCount: bodyAgents.length,
      },
      ...bodyAgents.map((agent, bi) => ({
        sectionKey: bodyOutline[bi]!.displayTitle,
        agent,
        isOverview: false,
        isSeoOpener: isHarnessSeoOpenerBodyAgent(agent),
        importedExcerptChars: findImportedSectionBody(row, bodyOutline[bi]!.displayTitle)?.length ?? 0,
      })),
    ],
    totalBudget,
  );
  assertHarnessTokenBudgetPreflight(harnessTokenSlots, totalBudget, totalSections);
  const harnessTokenBySectionKey = new Map(
    harnessTokenSlots.map((slot) => [slot.sectionKey, slot.maxTokens]),
  );
  const tokenBudgetTracker = createHarnessTokenBudgetTracker({
    totalBudget,
    slots: harnessTokenSlots,
    onUsage: options.onHarnessTokenUsage,
  });
  const logTokenBudgetSummary = () => {
  };

  const harnessPrimaryKeyword =
    promptEnv?.primaryKeyword?.trim()
    || row.keyword_focus?.trim()
    || row.keyword?.trim()
    || keywordData.keyword?.trim()
    || "";
  const { ensureIllustrativePersonaCached, runBlogHarnessSection } = createBlogHarnessSectionRuntime({
    blueprint,
    row,
    keywordData,
    options,
    harnessRowIndex,
    connectedSite,
    wordPressPosts,
    semrushKeywordsContext,
    semrushScatterContext,
    semrushExternalUrls,
    promptEnv,
    systemPrompt,
    harnessFormat,
    releaseTopic,
    entity,
    entityWikipediaUrl,
    acfContext,
    portfolioBlocked,
    harnessPageLocalBlock,
    competitorComparisonHarness,
    outlineBlock,
    totalSections,
    publishedSectionTitles,
    tokenBudgetTracker,
    httpReferer,
    bodyAgents,
    bodyOutline,
    harnessPrimaryKeyword,
    buildBulkHarnessSectionUserPrompt,
    generateSingleSectionPrompt,
  });

  if (options.sequentialHarnessSections) {
    const overviewInPageAnchorBlock = formatHarnessInPageAnchorBlock(bodyAnchors, { contextOnly: true });
    const answerMaxTokens = harnessTokenBySectionKey.get("Answer");
    if (answerMaxTokens == null) {
      throw new Error("Harness: missing token budget for Answer");
    }
    const overviewMaxTokens = harnessTokenBySectionKey.get("Overview");
    if (overviewMaxTokens == null) {
      throw new Error("Harness: missing token budget for Overview");
    }
    let anyDropped = false;
    const answerIsolated = await runHarnessSectionIsolated({
      title: "Answer",
      onProgress: sectionProgress,
      run: () =>
        runBlogHarnessSection(answerAgent, 0, "Answer", {
          maxTokens: answerMaxTokens,
          isOverviewSection: false,
          isAnswerSection: true,
          publishedPlanIndex: 0,
          otherSectionTitles: ["Overview", ...bodyOutline.map((x) => x.displayTitle)],
        }),
    });
    anyDropped = anyDropped || answerIsolated.dropped;
    const sequentialPieces: string[] = [answerIsolated.html];
    const answerMd = answerIsolated.html;
    await ensureIllustrativePersonaCached(answerMd);
    const overviewIsolated = await runHarnessSectionIsolated({
      title: "Overview",
      onProgress: sectionProgress,
      run: () =>
        runBlogHarnessSection(overviewAgent, 1, "Overview", {
          maxTokens: overviewMaxTokens,
          isOverviewSection: true,
          inPageAnchorBlock: overviewInPageAnchorBlock,
          publishedPlanIndex: 1,
          otherSectionTitles: bodyOutline.map((x) => x.displayTitle),
          answerSectionHtml: answerMd,
        }),
    });
    anyDropped = anyDropped || overviewIsolated.dropped;
    sequentialPieces.push(overviewIsolated.html);
    for (let bi = 0; bi < bodyAgents.length; bi++) {
      const agent = bodyAgents[bi]!;
      const o = bodyOutline[bi]!;
      const titleForCb = o.displayTitle;
      const otherSectionTitles = bodyOutline.filter((_, j) => j !== bi).map((x) => x.displayTitle);
      const maxTokens = harnessTokenBySectionKey.get(titleForCb);
      if (maxTokens == null) {
        throw new Error(`Harness: missing token budget for section "${titleForCb}"`);
      }
      const bodyIsolated = await runHarnessSectionIsolated({
        title: titleForCb,
        onProgress: sectionProgress,
        run: () =>
          runBlogHarnessSection(agent, bi + 2, titleForCb, {
            maxTokens,
            isOverviewSection: false,
            publishedPlanIndex: bi + 2,
            otherSectionTitles,
            answerSectionHtml: answerMd,
          }),
      });
      anyDropped = anyDropped || bodyIsolated.dropped;
      sequentialPieces.push(bodyIsolated.html);
    }
    const sequentialHtml = stripTrailingCopyrightBoilerplate(stitchHarnessSections(sequentialPieces));
    if (!sequentialHtml?.trim()) {
      throw new Error("Harness: stitched article is empty");
    }
    if (!anyDropped) {
      const requireIllustrative = bodyAgents.some(agentHasIllustrativeFeature);
      assertStitchedHarnessArticle(sequentialHtml, { requireIllustrative });
    }
    logTokenBudgetSummary();
    return finalizeStitchedHarnessHtml(sequentialHtml);
  }

  const overviewInPageAnchorBlock = formatHarnessInPageAnchorBlock(bodyAnchors, { contextOnly: true });
  const answerMaxTokens = harnessTokenBySectionKey.get('Answer');
  if (answerMaxTokens == null) {
    throw new Error('Harness: missing token budget for Answer');
  }
  const overviewMaxTokens = harnessTokenBySectionKey.get('Overview');
  if (overviewMaxTokens == null) {
    throw new Error('Harness: missing token budget for Overview');
  }

  await ensureIllustrativePersonaCached();

  const [answerIsolated, overviewIsolated, ...bodyIsolated] = await Promise.all([
    runHarnessSectionIsolated({
      title: "Answer",
      onProgress: sectionProgress,
      run: () =>
        runBlogHarnessSection(answerAgent, 0, 'Answer', {
          maxTokens: answerMaxTokens,
          isOverviewSection: false,
          isAnswerSection: true,
          publishedPlanIndex: 0,
          otherSectionTitles: ['Overview', ...bodyOutline.map((x) => x.displayTitle)],
        }),
    }),
    runHarnessSectionIsolated({
      title: "Overview",
      onProgress: sectionProgress,
      run: () =>
        runBlogHarnessSection(overviewAgent, 1, 'Overview', {
          maxTokens: overviewMaxTokens,
          isOverviewSection: true,
          inPageAnchorBlock: overviewInPageAnchorBlock,
          publishedPlanIndex: 1,
          otherSectionTitles: bodyOutline.map((x) => x.displayTitle),
        }),
    }),
    ...bodyAgents.map((agent, bi) => {
      const titleForCb = bodyOutline[bi]!.displayTitle;
      const otherSectionTitles = bodyOutline.filter((_, j) => j !== bi).map((x) => x.displayTitle);
      const maxTokens = harnessTokenBySectionKey.get(titleForCb);
      if (maxTokens == null) {
        throw new Error(`Harness: missing token budget for section "${titleForCb}"`);
      }
      return runHarnessSectionIsolated({
        title: titleForCb,
        onProgress: sectionProgress,
        run: () =>
          runBlogHarnessSection(agent, bi + 2, titleForCb, {
            maxTokens,
            isOverviewSection: false,
            publishedPlanIndex: bi + 2,
            otherSectionTitles,
          }),
      });
    }),
  ]);

  const anyDropped =
    answerIsolated.dropped ||
    overviewIsolated.dropped ||
    bodyIsolated.some((p) => p.dropped);
  const stitched = stitchHarnessSections([
    answerIsolated.html,
    overviewIsolated.html,
    ...bodyIsolated.map((p) => p.html),
  ]);
  if (!stitched?.trim()) {
    throw new Error("Harness: stitched article is empty");
  }
  const html = stripTrailingCopyrightBoilerplate(stitched);
  if (!anyDropped) {
    const requireIllustrativeParallel = bodyAgents.some(agentHasIllustrativeFeature);
    assertStitchedHarnessArticle(html, { requireIllustrative: requireIllustrativeParallel });
  }
  logTokenBudgetSummary();
  return finalizeStitchedHarnessHtml(html);
}
