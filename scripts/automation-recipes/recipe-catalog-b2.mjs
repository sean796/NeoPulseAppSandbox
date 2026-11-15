/**
 * Automation recipe catalog definitions (data).
 */
import {
  trigger,
  action,
  calendarAction,
  POLL,
  COOLDOWN,
  SIG_IMPR_UP_CTR_DOWN,
  SIG_CLICKS,
  SIG_CTR,
  SIG_POSITION,
  SIG_QUICK_WIN,
  PAGES_META_ACTION,
  ENTITY_PAGE_CREATOR_PAYLOAD,
  ENTITY_GENERATOR_PAYLOAD,
  SAP_GENERATOR_PAYLOAD,
} from "./recipe-build-helpers.mjs";
export const recipesPartB2 = [
  {
    keyword: "entity-generator-monthly",
    name: "Entity generator",
    description: "Generate entity location rows as bulk CSV from a Local Dominator grid with Wikipedia and entity sitemap validation.",
    notes: [
      "Requires a Local Dominator grid CSV upload (or upstream workflow export).",
      "Outputs entity-bulk.csv with skeleton rows (entity, title template, Wikipedia).",
      "Does not hydrate GSC keywords or publish WordPress pages.",
      "Default: 3 ad groups × 5 locations = 15 entity rows.",
      "Chain with SAP generator to hydrate and schedule pages.",
    ],
    category: "local-seo",
    verticals: ["local-seo", "general"],
    tags: ["entity", "csv", "grid", "monthly"],
    prerequisites: ["wordpress", "entity-sitemap"],
    filters: {
      executionKinds: ["entity_generator"],
      targetBuckets: ["sap"],
      actionCount: 1,
    },
    defaultTasks: [
      calendarAction(
        "entity-generator-run",
        "Generate entity CSV",
        "entity_generator",
        { ...ENTITY_GENERATOR_PAYLOAD },
      ),
    ],
  },
  {
    keyword: "sap-generator-monthly",
    name: "SAP generator",
    description: "Hydrate entity CSV rows with GSC keywords and schedule SAP pages to WordPress.",
    notes: [
      "Upload an entity CSV or chain from Entity generator in a workflow.",
      "Fills keywords, titles, meta, and slugs, then publishes SAP pages.",
      "Default: 15 pages scheduled evenly across the month.",
    ],
    category: "local-seo",
    verticals: ["local-seo", "general"],
    tags: ["entity", "sap", "monthly"],
    prerequisites: ["wordpress", "gsc", "entity-sitemap"],
    filters: {
      executionKinds: ["sap_generator"],
      targetBuckets: ["sap"],
      actionCount: 1,
    },
    defaultTasks: [
      calendarAction(
        "sap-generator-run",
        "Create SAP pages from entity CSV",
        "sap_generator",
        { ...SAP_GENERATOR_PAYLOAD },
      ),
    ],
  },
  {
    keyword: "blog-freshness-radar",
    name: "Blog Freshness Radar",
    description: "Full AISEO on blog posts when total search clicks decline.",
    notes: [
      POLL,
      "Scope: blog posts (Posts bucket).",
      "Runs when " + SIG_CLICKS(20, 150).toLowerCase(),
      "Higher click-drop threshold (20%) for noisier post-level GSC data.",
      COOLDOWN,
    ],
    category: "maintenance",
    verticals: ["editorial"],
    tags: ["gsc", "posts", "clicks", "blog"],
    prerequisites: ["gsc", "wordpress"],
    filters: {
      executionKinds: ["content_optimizer"],
      targetBuckets: ["posts"],
      triggerSignals: ["clicks_drop"],
      actionCount: 1,
    },
    defaultTasks: [
      action(
        "blog-freshness",
        "Refresh blog posts on clicks drop",
        "content_optimizer",
        "posts",
        trigger([{ signal: "clicks_drop", operator: "gte", value: 20, minImpressions: 150 }]),
      ),
    ],
  }
];
