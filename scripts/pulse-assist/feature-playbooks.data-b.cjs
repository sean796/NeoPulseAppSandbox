#!/usr/bin/env node
/** Pulse Assist playbooks (part B). */
const { pb } = require("./feature-playbooks.pb.cjs");

const FEATURE_PLAYBOOKS = [
  pb(
    "generator/opt/sitemap-pills",
    "generator/opt",
    "Pages Posts SAP pills",
    "How do I switch between Pages, Posts, and SAP?",
    "pulse:nav/generator/opt",
    [
      "Open [Tools → SEO → Opt](pulse:nav/generator/opt).",
      "On the black toolbar, click **Pages**, **Posts**, or **SAP** sitemap source pills.",
    ],
    ["pages posts sap", "sitemap source", "sitemap pills"],
  ),
  pb(
    "generator/opt/aiseo-bulk-meta",
    "generator/opt",
    "AISEO bulk meta",
    "How do I run Opt AISEO bulk meta?",
    "pulse:nav/generator/opt",
    [
      "Open [Tools → SEO → Opt](pulse:nav/generator/opt).",
      "Select rows with checkboxes.",
      "Open the **AISEO** flyout on the black toolbar → **Meta** → **All Meta** or **MD**.",
      "Run the bulk job on selected rows.",
    ],
    ["bulk meta", "bulk optimize meta", "aiseo bulk", "all meta"],
  ),
  pb(
    "generator/opt/row-expansion",
    "generator/opt",
    "Row expansion",
    "How do I expand an Opt row?",
    "pulse:nav/generator/opt",
    [
      "Open [Tools → SEO → Opt](pulse:nav/generator/opt).",
      "Click a row in the grid to expand row details.",
      "Use row actions such as **AI meta** for single-page optimization.",
    ],
    ["row expansion", "expand row", "row details"],
  ),
  pb(
    "generator/opt/ai-meta",
    "generator/opt",
    "AI meta",
    "How do I run AI meta on one page?",
    "pulse:nav/generator/opt",
    [
      "Open [Tools → SEO → Opt](pulse:nav/generator/opt).",
      "Expand the page row.",
      "Click **AI meta** in row details (pages: meta + FAQs; posts: **AI title** then meta).",
    ],
    ["ai meta", "single page meta", "optimize one page"],
  ),
  pb(
    "generator/opt/page-title",
    "generator/opt",
    "Optimize page title",
    "How do I optimize a page title?",
    "pulse:nav/generator/opt",
    [
      "Open [Tools → SEO → Opt](pulse:nav/generator/opt).",
      "Use **Pages**, **Posts**, or **SAP** pills to find the URL.",
      "Expand the row and edit **SEO title** (posts: use **AI title** or **AI meta**).",
      "Click **Save**.",
    ],
    ["page title", "optimize title", "seo title", "title tag", "optimizae"],
  ),
  pb(
    "generator/opt/multi-site",
    "generator/opt",
    "Multi-site pill",
    "How do I use multi-site Opt?",
    "pulse:nav/generator/opt",
    [
      "Open [Tools → SEO → Opt](pulse:nav/generator/opt).",
      "Switch the content optimizer section to **Multi-site** when available.",
      "Compare or bulk work across connected properties from the multi-site grid.",
    ],
    ["multi-site", "multi site overview"],
  ),

  // generator bulk sections (legacy ids open Blog Studio)
  pb(
    "generator/bulk-csv/csv-upload",
    "generator/bulk-prompt",
    "CSV upload",
    "How do I bulk generate from CSV?",
    "pulse:nav/generator/bulk-prompt",
    [
      "Open [Tools → SEO → Studio](pulse:nav/generator/bulk-prompt).",
      "Upload a CSV with blog generation columns.",
      "Configure options and run **Bulk generate**.",
    ],
    ["csv upload", "bulk csv", "upload csv"],
  ),
  pb(
    "generator/bulk-csv/bulk-generate",
    "generator/bulk-csv",
    "Bulk generate",
    "How do I run CSV bulk generation?",
    "pulse:nav/generator/bulk-prompt",
    [
      "Open [SEO → Generator → CSV](pulse:nav/generator/bulk-prompt).",
      "After CSV upload, start the bulk generation run from the toolbar.",
    ],
    ["bulk generate", "run csv bulk"],
  ),
  pb(
    "generator/bulk-prompt/overview",
    "generator/bulk-prompt",
    "Prompt bulk",
    "How do I bulk generate from prompts?",
    "pulse:nav/generator/bulk-prompt",
    [
      "Open [Tools → SEO → Studio](pulse:nav/generator/bulk-prompt).",
      "Configure prompt templates and run bulk generation.",
    ],
    ["prompt bulk", "bulk prompt"],
  ),
  pb(
    "generator/bulk-blog-import/overview",
    "generator/bulk-blog-import",
    "Blog import",
    "How do I import blog posts?",
    "pulse:nav/generator/bulk-prompt",
    [
      "Open [Tools → SEO → Studio](pulse:nav/generator/bulk-prompt).",
      "Import existing WordPress posts for optimization workflows.",
    ],
    ["blog import", "import posts"],
  ),
  pb(
    "generator/bulk-press-release/overview",
    "generator/bulk-press-release",
    "Press release bulk",
    "How do I generate press releases in bulk?",
    "pulse:nav/generator/bulk-press-release",
    [
      "Open [Tools → SEO → PR](pulse:nav/generator/bulk-press-release).",
      "Configure press release rows and run the bulk PR generator.",
    ],
    ["press release", "pr generator"],
  ),
  pb(
    "generator/entity/overview",
    "generator/entity",
    "Entity SAP generator",
    "How do I generate SAP entity pages?",
    "pulse:nav/generator/bulk-prompt",
    [
      "Open [Tools → SEO → Studio](pulse:nav/generator/bulk-prompt).",
      "Configure entity/location pages and run SAP generation.",
    ],
    ["entity", "sap", "location pages"],
  ),
  pb(
    "generator/competitor/overview",
    "generator/competitor",
    "Competitor generator",
    "How do I run competitor content generation?",
    "pulse:nav/generator/bulk-prompt",
    [
      "Open [Tools → SEO → Studio](pulse:nav/generator/bulk-prompt).",
      "Configure competitor research inputs and generate content.",
    ],
    ["competitor generator", "competitor content"],
  ),
  pb(
    "generator/flow/overview",
    "generator/flow",
    "Free Flow",
    "How do I use Free Flow?",
    "pulse:nav/generator/flow",
    [
      "Open [Tools → SEO → Flow](pulse:nav/generator/flow).",
      "Enter a freeform prompt and generate sectioned content in the Flow workspace.",
    ],
    ["free flow", "flow", "freeform writing"],
  ),
  pb(
    "generator/image/overview",
    "generator/image",
    "AI images",
    "How do I generate AI images?",
    "pulse:nav/generator/image",
    [
      "Open [Tools → Media → Image](pulse:nav/generator/image).",
      "Enter image prompts and generate assets for content.",
    ],
    ["image generator", "ai images"],
  ),

  // generator/research
  pb(
    "generator/research/proposal",
    "generator/research",
    "Proposal research",
    "How do I run proposal research?",
    "pulse:nav/generator/research",
    [
      "Open [Tools → SEO → Research](pulse:nav/generator/research).",
      "Select the **Proposal** research section.",
      "Configure inputs and run the proposal research pipeline.",
    ],
    ["proposal", "proposal research"],
  ),
  pb(
    "generator/research/citation",
    "generator/research",
    "Citation research",
    "How do I run citation research?",
    "pulse:nav/generator/research",
    [
      "Open [Tools → SEO → Research](pulse:nav/generator/research).",
      "Select the **Citation** research section.",
      "Run citation discovery for the active property.",
    ],
    ["citation", "citation research"],
  ),
  pb(
    "generator/research/backlinking",
    "generator/research",
    "Backlinking research",
    "How do I run backlinking research?",
    "pulse:nav/generator/research",
    [
      "Open [Tools → SEO → Research](pulse:nav/generator/research).",
      "Select the **Backlinking** research section.",
      "Run backlink opportunity research.",
    ],
    ["backlinking", "backlink research"],
  ),
  pb(
    "reporting/performance/overview",
    "reporting/performance",
    "Organic reporting",
    "How do I view GSC and GA4 performance reports?",
    "pulse:nav/reporting/performance",
    [
      "Open [Reporting → Performance](pulse:nav/reporting/performance).",
      "Select a connected property with GSC and GA4 configured.",
      "Use the date range control and section pills (Performance, Indexing, Speed).",
    ],
    ["gsc report", "gsc reporting", "search console report", "organic reporting"],
  ),
  pb(
    "reporting/performance/ppc",
    "reporting/performance",
    "PPC reporting tasks",
    "How do I generate a Google Ads PPC report?",
    "pulse:nav/reporting/performance",
    [
      "Install recipes **ads-monthly-mom-report** or **ads-monthly-yoy-report** for automated PPC markdown reports.",
      "Assign a property with a 10-digit Google Ads customer ID on Dashboard → Properties.",
      "Track runs under the Agents rail.",
    ],
    ["ppc report", "ads report", "google ads report", "monthly ppc", "ppc mom", "ppc yoy"],
  ),

  // sitemap-optimizer
  pb(
    "sitemap-optimizer/plan-mode",
    "sitemap-optimizer",
    "Plan mode",
    "How do I use Sitemap plan mode?",
    "pulse:nav/sitemap-optimizer",
    [
      "Open [SEO → Sitemap](pulse:nav/sitemap-optimizer).",
      "Select **Plan** mode in the workspace header.",
      "Cluster and plan URL groups before running optimization.",
    ],
    ["plan mode", "sitemap plan"],
  ),
  pb(
    "sitemap-optimizer/url-optimizer",
    "sitemap-optimizer",
    "URL optimizer",
    "How do I run the URL optimizer?",
    "pulse:nav/sitemap-optimizer",
    [
      "Open [SEO → Sitemap](pulse:nav/sitemap-optimizer).",
      "Open the **URL optimizer** section.",
      "Configure and run URL optimization on sitemap clusters.",
    ],
    ["url optimizer", "optimize urls"],
  ),
  pb(
    "vertical-benchmarks/overview",
    "vertical-benchmarks",
    "Industry verticals",
    "How do I use Industry verticals benchmarks?",
    "pulse:nav/vertical-benchmarks",
    [
      "Open [SEO → Industry verticals](pulse:nav/vertical-benchmarks).",
      "Select a property and vertical benchmark package.",
      "Export or run bulk CSV benchmark workflows.",
    ],
    ["vertical benchmarks", "industry verticals"],
  ),

  // social
  pb(
    "gbp-post/overview",
    "gbp-post",
    "GBP posts",
    "How do I publish a GBP post?",
    "pulse:nav/gbp-post",
    [
      "Open [Social → GBP](pulse:nav/gbp-post).",
      "Select a property with GBP connected.",
      "Configure post copy and publish to Google Business Profile.",
    ],
    ["gbp", "google business profile post", "publish gbp"],
  ),
  pb(
    "content-calendar/overview",
    "content-calendar",
    "Content calendar",
    "How do I use the content calendar?",
    "pulse:nav/content-calendar",
    [
      "Open [Social → Calendar](pulse:nav/content-calendar).",
      "Generate or edit AI content calendar rows for the active property.",
    ],
    ["content calendar", "calendar"],
  ),
  pb(
    "social-creator/overview",
    "social-creator",
    "Social creator",
    "How do I create social posts?",
    "pulse:nav/social-creator",
    [
      "Open [Social → Creator](pulse:nav/social-creator).",
      "Configure post copy and visuals, then generate organic social posts.",
    ],
    ["social creator", "organic posts", "social posts"],
  ),

  // ppc
  pb(
    "ppc-google/overview",
    "ppc-google",
    "Google PPC",
    "How do I build Google Search campaigns?",
    "pulse:nav/ppc-google",
    [
      "Open [PPC → Google](pulse:nav/ppc-google).",
      "Select a property and seed campaigns from WordPress pages and GSC queries.",
    ],
    ["google ads", "ppc google", "search campaigns"],
  ),
  pb(
    "ppc-meta/overview",
    "ppc-meta",
    "Meta PPC",
    "How do I build Meta feed ads?",
    "pulse:nav/ppc-meta",
    [
      "Open [PPC → Meta](pulse:nav/ppc-meta).",
      "Select a property and generate Meta ads from page copy and creatives.",
    ],
    ["meta ads", "facebook ads", "instagram ads"],
  ),

  // standalone
  pb(
    "integrations/connect-site",
    "integrations",
    "Connect WordPress",
    "How do I connect a WordPress site?",
    "pulse:nav/integrations",
    [
      "Open [Integrations](pulse:nav/integrations).",
      "Add or select a WordPress site tile.",
      "Enter site URL and application credentials, then save.",
    ],
    ["integrations", "wordpress connect", "connect site"],
  ),
  pb(
    "knowledge/upload-files",
    "knowledge",
    "Knowledge Base files",
    "How do I upload knowledge base files?",
    "pulse:nav/knowledge",
    [
      "Open [Knowledge Base](pulse:nav/knowledge).",
      "Upload files or paste manual text for RAG knowledge used in generation.",
    ],
    ["knowledge base", "upload files", "rag", "kb"],
  ),
  pb(
    "api/browse-docs",
    "api",
    "API docs",
    "How do I browse API documentation?",
    "pulse:nav/api",
    [
      "Open [API Docs](pulse:nav/api).",
      "Browse endpoint groups in the API documentation browser.",
    ],
    ["api docs", "api documentation", "endpoints"],
  ),

  // Skills Library
  pb(
    "reporting.semrush.safe-fix",
    "dashboard/skills-library",
    "Semrush Safe Fix",
    "What does the Semrush Safe Fix skill do?",
    "pulse:nav/dashboard/skills-library",
    [
      "Open [Dashboard → Settings → Skills Library](pulse:nav/dashboard/skills-library).",
      "Find **Semrush Safe Fix Agent** (id `reporting.semrush.safe-fix`).",
      "Enable it on the property profile when you want no-approval Semrush Site Audit fixes (missing title/meta/alt, broken internal links and images) via Neo MCP, then a rescan for HTTP 200.",
    ],
    [
      "semrush safe fix",
      "sem rush fix",
      "semrush fix agent",
      "semrush fix",
      "safe fix agent",
      "what does the semrush fix agent do",
    ],
  ),
  pb(
    "content.posts.gap-check",
    "dashboard/skills-library",
    "Posts Content Gap Check",
    "What does the Posts Content Gap Check skill do?",
    "pulse:nav/dashboard/skills-library",
    [
      "Open [Dashboard → Settings → Skills Library](pulse:nav/dashboard/skills-library).",
      "Find **Posts Content Gap Check** (id `content.posts.gap-check`).",
      "Enable it on the property profile when you want next-month published and scheduled blog counts checked against the site blog quota, and Blog Ideas (GSC) started when short until WordPress upload finishes.",
    ],
    [
      "posts content gap check",
      "content gap check",
      "blog gap check",
      "content gap skill",
    ],
  ),
];

module.exports = { FEATURE_PLAYBOOKS_PART_B: FEATURE_PLAYBOOKS };