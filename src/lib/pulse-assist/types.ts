import type {
  PlatformDataResearchArtifacts,
  PlatformDataResearchMeta,
  PlatformDataSliceTeamEntry,
} from "@/lib/platform-data/types";

export type AssistSubmode = "ask" | "plan" | "build";

export type AssistHistoryRole = "user" | "assistant";

export type AssistHistoryMessage = {
  role: AssistHistoryRole;
  content: string;
  card?: AssistCard | null;
  researchMeta?: PlatformDataResearchMeta;
};

export type AssistNavigateTarget =
  | { kind: "managerTab"; tab: string }
  | { kind: "generatorSection"; section: string }
  | { kind: "dashboardCluster"; cluster: string }
  | { kind: "organicReporting" }
  | { kind: "agentRuns"; runId?: number };

export type AssistCardLink = {
  label?: string;
  url?: string;
  action?: string;
  post_id?: number;
  navigate?: AssistNavigateTarget;
};

export type PulsePropertySummary = {
  id: string;
  name: string;
  siteUrl: string;
  enabled: boolean;
  ga4PropertyId?: string;
  googleAdsCustomerId?: string;
};

export type PropertiesContextPayload = {
  count: number;
  activePropertyId: string;
  properties: PulsePropertySummary[];
};

export type AssistCardStep = {
  id?: string;
  label?: string;
  status?: "pending" | "running" | "done" | "error";
  step_kind?: "agent" | "lead" | "phase" | string;
};

export type AssistCardTable = {
  columns: string[];
  rows: string[][];
};

export type AssistTaskExecutionResult = {
  createdTaskIds?: number[];
  createdProjectId?: number;
  projectId?: number;
  updatedTaskIds?: number[];
};

export type AssistCard = {
  type?: string;
  title?: string;
  body?: string;
  confidence?: string;
  links?: AssistCardLink[];
  relatedTopics?: string[];
  suggested_actions?: string[];
  submode_switch?: AssistSubmode | string;
  steps?: AssistCardStep[];
  cta?: { label?: string; action?: string } | null;
  action_result?: { post_id?: number; title?: string } & AssistTaskExecutionResult;
  details_drawer?: Record<string, unknown>;
  workflow_id?: string;
  table?: AssistCardTable;
  recipe_key?: string;
  recipe_keyword?: string;
  project_id?: number;
  plan_json?: Record<string, unknown>;
  context_json?: Record<string, unknown>;
};

export type AssistStreamAgentPlan = {
  id?: string;
  role?: string;
  slice?: string;
};

export type AssistStreamActionPlanTool = {
  tool?: string;
  args?: Record<string, unknown>;
};

export type AssistStreamEvent =
  | { status: "ack"; text?: string }
  | { status: "phase"; phase?: "modules" | "fetch" | "compose" | "format" | "action"; label?: string }
  | { status: "agent_plan"; agents?: AssistStreamAgentPlan[] }
  | { status: "action_plan"; tools?: AssistStreamActionPlanTool[] }
  | { status: "agent"; id?: string; role?: string; state?: "running" | "done" | "error" }
  | { status: "tool"; id?: string; tool?: string; state?: "running" | "done" | "error" }
  | { status: "lead"; state?: "running" | "done" }
  | { status: "searching" | "thinking" | "formatting"; label?: string }
  | { status: "chips"; relatedTopics?: string[] }
  | {
      status: "done";
      card?: AssistCard;
      relatedTopics?: string[];
      prefetched?: boolean;
      researchedDataToolIds?: string[];
      dataToolClassifierReason?: string;
      researchedDataBlock?: string;
      inventorySource?: string;
      acfComplete?: boolean;
      sliceTeam?: PlatformDataSliceTeamEntry[];
      leadAgentUsed?: boolean;
      intentSummary?: string;
      researchArtifacts?: PlatformDataResearchArtifacts | null;
      actionPlanTools?: AssistStreamActionPlanTool[];
      actionExecuted?: boolean;
    };

export type PulseContextPayload = {
  managerTab: string;
  generatorSection?: string;
  dashboardCluster?: string;
  locationSummary?: string;
  sitemapSource?: string;
  researchSection?: string;
  sitemapMode?: string;
  contentOptimizerSection?: string;
  pulseAppUrl: string;
  siteId: string;
  siteName: string;
  expandedPageUrl?: string;
  expandedPageTitle?: string;
};

export type SiteInventoryContextRow = {
  title: string;
  url: string;
  collection: string;
  date_gmt?: string;
  status?: string;
  keyword?: string;
  excerpt?: string;
  meta?: string;
  acf_loaded?: boolean;
  has_seo_research?: boolean;
  has_faq?: boolean;
  has_featured_image?: boolean;
};

export type SiteInventoryContextPayload = {
  siteId: string;
  auditReady?: boolean;
  rows: SiteInventoryContextRow[];
};

export type TeamContextMember = {
  userId: number;
  displayName: string;
  role?: string;
  jobTitle?: string;
  isBot?: boolean;
};

export type TeamContextPulseTask = {
  id: number;
  title: string;
  keyword: string;
  projectId: number;
  projectTitle: string;
  dueDate: string;
  dueTime?: string;
  recurrenceRule: string;
  wordpressSiteId: string;
  status: string;
  description: string;
  executionKind?: string;
  lastExecutionId?: number | null;
  lastExecutionStatus?: string | null;
};

export type TeamContextProject = {
  id: number;
  title: string;
  keyword?: string;
};

export type TeamContextWordPressSite = {
  id: string;
  name: string;
};

export type TeamContextPayload = {
  teamId: number;
  teamName: string;
  activeProjectId?: number;
  activeProjectTitle?: string;
  members: TeamContextMember[];
  projects: TeamContextProject[];
  wordpressSites?: TeamContextWordPressSite[];
  pulseBotUserId?: number;
  pulseAssignedTasks?: TeamContextPulseTask[];
};

export type AssistRequestPayload = {
  message: string;
  history: AssistHistoryMessage[];
  admin_mode: "backend";
  admin_submode: AssistSubmode;
  post_id: number;
  page_url: string;
  page_title: string;
  pulse_context: PulseContextPayload;
  properties_context: PropertiesContextPayload;
  site_inventory_context?: SiteInventoryContextPayload;
  team_context?: TeamContextPayload;
};

export const BACKEND_STARTERS = [
  "What can I do on this tab?",
  "How do I run Opt AISEO bulk meta?",
  "How do I use Blog Studio?",
  "What does the Semrush Safe Fix skill do?",
] as const;

export const ADMIN_SUBMODE_LABELS: Record<AssistSubmode, string> = {
  ask: "Ask",
  plan: "Plan",
  build: "Build",
};

export const SUBMODE_GREETING: Record<AssistSubmode, string> = {
  ask: "Ask anything about NEO Pulse. Read-only.",
  plan: "Preview a plan before you act. No writes yet.",
  build: "Build executes approved actions such as creating team tasks.",
};
