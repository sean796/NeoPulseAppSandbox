export {
  TOPIC_RESEARCH_FANOUT_MIN_QUERIES,
  TOPIC_RESEARCH_FANOUT_MAX_QUERIES,
  TOPIC_RESEARCH_MAX_VERIFICATION_QUERIES,
  TOPIC_RESEARCH_SECONDARY_VERIFY_MAX,
  TOPIC_RESEARCH_FANOUT_CITY_REQUIRED,
  TOPIC_RESEARCH_PLAN_TEMPERATURE,
  TOPIC_RESEARCH_PLAN_SYSTEM,
  topicResearchFanoutMaxTokens,
  type TopicResearchPlan,
  type FactualVerificationPlanItem,
} from "@/lib/content-optimization/topic-research-fanout-shared";

export {
  ILLUSTRATIVE_PERSONA_EXTRACT_TEMPERATURE,
  ILLUSTRATIVE_EXTRACT_SYSTEM,
  normalizeIllustrativeExample,
  extractIllustrativeExample,
} from "@/lib/content-optimization/topic-research-fanout-illustrative";

export {
  cityTokenFromLocation,
  formatResearchAsOfLabel,
  buildIllustrativeExampleResearchQuery,
  buildProgramStatusResearchQuery,
  attachLocationToQfoQuery,
  attachLocationToQfoQueries,
  isBoilerplateResearchQuery,
  filterBoilerplateResearchQueries,
  ensureIllustrativeResearchQuery,
  ensureProgramStatusResearchQuery,
} from "@/lib/content-optimization/topic-research-fanout-queries";

export {
  officialDomainsForLocation,
  isOfficialDomain,
  pickOfficialOrganicResult,
  organicTopFromSerpDump,
  serpRowFromDump,
  mergeVerificationPlanItems,
  buildMandatoryVerificationItems,
  normalizePageClaimInventory,
  extractCheckableClaimsFromPageExcerpt,
  normalizeFactualVerificationPlan,
  planFactualVerificationQueries,
  fetchAndExtractVerifiedFact,
  isEconomicVerificationClaim,
  runFactualVerificationPass,
} from "@/lib/content-optimization/topic-research-fanout-verification";

export {
  normalizeTopicResearchPlan,
  normalizeFirstPartyClaims,
  collectFirstPartyClaimSourceText,
  planTopicResearchQueries,
  extractFirstPartyClaims,
  mergeFanoutIntoBrief,
  runTopicResearchFanout,
} from "@/lib/content-optimization/topic-research-fanout-orchestration";

export {
  FACT_CHECKING_STEP_LABEL,
  buildNapCardFromSite,
  phoneDigits,
  formatNapCardPromptBlock,
  formatFactCheckPromptBlock,
  assertRewrittenNapOnCard,
  applyFactCheckToBrief,
  runResearchFactCheck,
} from "@/lib/content-optimization/research-fact-check";
