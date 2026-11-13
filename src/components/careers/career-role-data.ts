export interface CareerApplicationQuestion {
  id: string;
  number: number;
  prompt: string;
}

export interface CareerRoleSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface ProjectRoomArtifact {
  publicBrandName: string;
  focusKeyword: string;
  seoTitle: string;
  metaDescription: string;
  executionRoute: string;
  targetEnvironment: string;
  stagingVerificationStep: string;
}

export const CAREER_ROLE_HEADER = {
  title: "NEO Pulse Operator / Developer (Contract) | Agentic SEO & AISEO",
  company: "Neo Digital Inc.",
  location: "Remote (Canada-friendly; overlap with Mountain Time preferred)",
  engagement: "Contractor (part-time or project-based; 15-30 hrs/week)",
  product: "NEO Pulse",
  contactEmail: "info@neodigital.ca",
};

export const CAREER_ROLE_SECTIONS: CareerRoleSection[] = [
  {
    heading: "About Neo Digital & Role Summary",
    paragraphs: [
      "Neo Digital builds NEO Pulse, an agentic AI content and SEO operations platform for WordPress agencies and in-house teams. Pulse connects Search Console, research APIs, and LLM workflows to live WordPress inventory so operators can prioritize URLs, run bulk optimizations, and ship governed AISEO output with human QA.",
      "The NEO Pulse WP plugin ships to every Neo Digital client site. The Pulse web app adds manager workflows: overview grids, bulk generators, sitemap optimizers, reporting, tasks/automation, and a growing Mastra agent registry (research, blog, meta, report, ads, and related pipelines).",
      "We need a Pulse Operator who thinks agentically: you run client SEO in Pulse daily, you use AI assistants and structured workflows as force multipliers (not replacements for judgment), and you can contribute small, correct code or harness changes when the product needs operator-driven fixes.",
    ],
  },
  {
    heading: "Agentic SEO Operations (Primary Time)",
    bullets: [
      "Turn Google Search Console data into prioritized URL-level action lists and execute them in Pulse (Overview / Content Optimizer, meta, on-page refresh, FAQs, internal links, uploads to WordPress).",
      "Run bulk pipelines (CSV, prompt, import flows) with approved templates; verify row-level output before publish.",
      "Maintain programmatic, local, and entity page clusters where clients need scale (SAP-style clusters, location pages).",
      "Execute sitemap hygiene: merge overlapping URLs, legacy redirects, URL optimization plans.",
      "Produce client reporting (GSC MoM, narrative sections, clear next actions) and support local SEO (grid rank tracking, GBP post workflows).",
      "Use Semrush, DataForSEO, and integrated research tools for SERP context, audits, and gap analysis.",
    ],
  },
  {
    heading: "AISEO Production, Governance & Light Dev",
    bullets: [
      "Run AI-assisted briefs grounded in SERP, GSC, and competitive context, and operate AI meta and content optimization with strict human QA (accuracy, E-E-A-T, hallucination risk, thin/duplicate content).",
      "Tune Master Rules and per-client AI instructions so output matches brand and intent. Work with OpenRouter-backed flows only; respect JSON/schema contracts and fail-fast validation (no prompt and pray).",
      "Improve prompts, schemas, and agent harnesses (Mastra steps, operator tasks) when production output misses the contract.",
      "Ship small, scoped changes in the Pulse app (React/TypeScript) or NEO Pulse WP (PHP/WordPress), following existing patterns: server-side API logic, no secrets in the browser, minimal diffs.",
      "Use Cursor with repo rules: logic-first debugging, no silent fallbacks, no regex hacks to patch bad LLM output.",
      "Manage WordPress property connections and monitor NEO Pulse WP modules on staging first (blindmagic1stg, neodigital1stg) before live client changes.",
    ],
  },
  {
    heading: "What We Are Looking For",
    bullets: [
      "Traditional SEO (heavy): 3+ years hands-on content SEO on real sites, strong on-page SEO, intent, internal linking, cannibalization, refresh strategy, GSC analysis, and WordPress operations at scale.",
      "Technical SEO (working): Redirects, sitemap hygiene, crawl/index issues, schema/FAQ patterns, image SEO, Core Web Vitals basics.",
      "AISEO / agentic workflows (practical): Production use of LLMs for briefs, meta, refresh, audits; strong editorial QA; comfort with structured output (JSON/schema) and AI coding assistants (Cursor, Copilot, Claude Code).",
      "Strong plus: TypeScript/React or PHP/WordPress enough to read code, trace API routes, and land small PRs; Mastra or similar agent frameworks; Semrush, DataForSEO, Screaming Frog, Elementor.",
    ],
  },
  {
    heading: "Contractor Terms & Stack",
    bullets: [
      "Hours: Flexible, often 15-30 hrs/week depending on client load. Initial 90-day contract with extension for strong fit.",
      "Rate: Set by applicant; Neo Digital benchmarks against agency contractor norms.",
      "Stack: Pulse app, NEO Pulse WP (staging first), Google Search Console / Analytics / GBP, Semrush, DataForSEO, OpenRouter, GitHub, Cursor, Microsoft Teams.",
    ],
  },
];

export const CAREER_APPLICATION_QUESTIONS: CareerApplicationQuestion[] = [
  {
    id: "q1",
    number: 1,
    prompt:
      "Explain the difference between a chat session with an LLM, an agent that can call tools, and a workflow made of steps. Where should a human approve work in each setup?",
  },
  {
    id: "q2",
    number: 2,
    prompt:
      "What belongs in a server tool versus what belongs in the prompt? Use a Google Search Console and meta title example.",
  },
  {
    id: "q3",
    number: 3,
    prompt:
      "What is an agent harness, and how is it different from a single system prompt?",
  },
  {
    id: "q4",
    number: 4,
    prompt:
      "Why should WordPress, Semrush, and Search Console run on the server while the browser only calls your own API?",
  },
  {
    id: "q5",
    number: 5,
    prompt:
      "How would you design a bulk meta job for two thousand URLs without one giant prompt or losing track of failures?",
  },
  {
    id: "q6",
    number: 6,
    prompt:
      "Describe a simple workflow to refresh one URL from GSC signal to WordPress staging. Where do you pause for a person?",
  },
  {
    id: "q7",
    number: 7,
    prompt:
      "How do you pack context for a large sitemap job without blowing the token budget?",
  },
  {
    id: "q8",
    number: 8,
    prompt:
      "When do you use retrieved documentation versus a live tool call?",
  },
  {
    id: "q9",
    number: 9,
    prompt:
      "The interface says success but WordPress meta did not change. What do you check first?",
  },
  {
    id: "q10",
    number: 10,
    prompt:
      "Why is fail-fast validation better than automatically fixing bad model JSON in code?",
  },
  {
    id: "q11",
    number: 11,
    prompt:
      "How should research output feed meta generation in a multi-step agent setup?",
  },
  {
    id: "q12",
    number: 12,
    prompt:
      "Why might research, meta, and reporting use different models or settings?",
  },
  {
    id: "q13",
    number: 13,
    prompt:
      "What would you log for every agent run so you can debug it a month later?",
  },
  {
    id: "q14",
    number: 14,
    prompt:
      "The product team wants the browser to call OpenRouter directly to save server cost. What is your response?",
  },
  {
    id: "q15",
    number: 15,
    prompt:
      "A client asks for fully automatic daily publishing with no human review. What do you require first?",
  },
];

export const PROJECT_ROOM_STAGING_CONTEXT = {
  propertyId: "wp-prop-shutterspot",
  integrationsBrandName: "Shutter Spot",
  domain: "https://shutterspot.com",
  stagingDomain: "https://shutterspot1stg.wpenginepowered.com",
  googleAdsMccSubAccountLabel: "Blind Spot (Customer ID 745-406-1453) [INTERNAL ADS LABEL ONLY - NEVER USE IN PUBLIC COPY]",
  targetUrl: "https://shutterspot.com/custom-plantation-shutters-calgary/",
  focusKeyword: "custom plantation shutters calgary",
  gscSignal: "2,410 impressions / 1.1% CTR (pos 8.4) over last 28 days. Current title has a colon and legacy Ads label.",
  serverWriteEndpoint: "/api/wordpress/update-post-meta",
  contractRules: [
    "publicBrandName must be the canonical Integrations brand name (Shutter Spot), never the Google Ads MCC sub-account label (Blind Spot).",
    "seoTitle must be 45 to 60 characters, include focusKeyword (custom plantation shutters calgary), and contain zero colons (:).",
    "metaDescription must be 130 to 160 characters and include focusKeyword (custom plantation shutters calgary).",
    "executionRoute must be the server-side NEO Pulse endpoint (/api/wordpress/update-post-meta), never a direct browser wp-json URL or fetch() call.",
    "targetEnvironment must be 'staging' first, and stagingVerificationStep must describe pausing for operator approval and reading meta back from the WordPress API after publish.",
  ],
};

export const INITIAL_FLAWED_HARNESS_PROMPT = `Draft the SEO meta refresh JSON for /custom-plantation-shutters-calgary/ using the account memo defaults.`;

export const INITIAL_FLAWED_ARTIFACT: ProjectRoomArtifact = {
  publicBrandName: "Blind Spot",
  focusKeyword: "custom plantation shutters calgary",
  seoTitle: "Blind Spot: Custom Plantation Shutters Calgary",
  metaDescription: "Order shutters from Blind Spot.",
  executionRoute: "https://shutterspot.com/wp-json/wp/v2/pages/418",
  targetEnvironment: "production",
  stagingVerificationStep: "",
};

export const ADMIN_PASS_ANSWERS: Record<string, string> = {
  q1: "Chat is open conversation with no fixed output shape and no controlled side effects. An agent loops through tool calls until it finishes a task; a human should approve before any tool that publishes or changes live data. A workflow runs defined steps with saved state; a human should approve at explicit pause points before writes and anywhere client risk is high.",
  q2: "The tool fetches real GSC numbers and page content from the server using stored credentials. The prompt decides priority, angle, and draft copy within client rules. The model should not pretend it fetched data, and it should not publish without a dedicated publish tool.",
  q3: "A harness is the whole contract: prompts, structured output schema, which tools exist, iteration limits, logging, and what happens when validation fails. A system prompt alone does not enforce JSON shape, tie runs to an audit id, or stop runaway tool loops.",
  q4: "Credentials and client isolation stay on the server, every call can be logged and rate limited, and you avoid exposing keys in the browser or fighting CORS. The UI stays a thin client; integration logic lives in one place you can secure and test.",
  q5: "Fetch the URL list once on the server, process rows in a queue with a concurrency limit, validate each row against a schema, record pass or fail per row, and show progress in the UI. Operators focus on failed or flagged rows, not manual work on every line.",
  q6: "Pull GSC and page context with tools, generate a structured proposed change, pause for operator review in the UI, then call publish to staging only after approval, then read the page back from WordPress to confirm meta actually updated. Pause before any write.",
  q7: "Do not send hundreds of URLs in one call. Cluster or prioritize first, then run one focused agent call per URL or small batch with only the metrics and rules that URL needs. Pass compact artifacts between steps instead of repeating full chat history.",
  q8: "Retrieve static playbooks, brand rules, and long-lived client instructions. Call live tools for anything that must be current: rankings, inventory, publish state, redirects. Make it obvious in the context which is which so the model does not treat old docs as live metrics.",
  q9: "Read meta back from the WordPress API on the environment you intended, staging or production. Then check field mapping through the SEO plugin, caching, wrong post id, and whether another job overwrote the change. Never trust the agent message alone.",
  q10: "Auto-fix hides broken prompts and schemas, produces inconsistent client output, and makes quality metrics meaningless. Validate once, fail the row with a clear error, fix the harness, and rerun. Code enforces rules; it should not secretly rewrite the model.",
  q11: "Research step outputs a structured brief: intent, entities, risks, recommended angle. Meta step must require those fields as input and output only meta fields. A person approves in the middle. Publishing is a separate tool that only runs on an approved artifact id.",
  q12: "Research needs more reasoning depth; meta needs fast cheap calls with strict formatting; reporting needs faithful summarization of tables. Routing by task type controls cost and reduces using an expensive model on repetitive rows.",
  q13: "Run id, client or site id, step name, model and prompt version, latency, token usage, tool calls with sensitive fields redacted, validation result, and operator id if someone approved. Enough to explain failure without guessing.",
  q14: "Reject for production: API keys or abusable proxies in the client, no central tenant boundaries, weak audit trail, and no reliable server-side validation. Real savings come from batching, routing, and schema pass rate, not moving secrets to the browser.",
  q15: "Staging-only auto publish at first, schema and eval thresholds, limits on volume, diff or anomaly monitoring, rollback path, cannibalization checks, and a written policy they sign. Move to production only after weeks of low edit rate and zero critical errors.",
};

