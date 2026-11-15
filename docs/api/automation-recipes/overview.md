---
title: Automation recipes overview
slug: automation-recipes/overview
section: Automation recipes
order: 0
---

<!-- manual -->

The automation recipe catalog ships as JSON files under `wordpress-plugins/neo-pulse-app/recipes/`. Each recipe is a WHEN/THEN SEO automation template that installs as a site-bound team automation project.

## Routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/teams/{teamId}/tasks/automation-recipes` | List catalog entries with optional filters |
| GET | `/api/teams/{teamId}/tasks/automation-recipes/{keyword}` | Describe one recipe (includes `defaultTasks`) |
| GET | `/api/teams/{teamId}/tasks/automation-blocks/triggers` | Trigger block catalog (GSC, schedule, poll) |
| GET | `/api/teams/{teamId}/tasks/automation-blocks/actions` | Action block catalog (optimizer, post creator, reporting) |

### List query params

- `category` — reactive, maintenance, local-seo, onboarding
- `bucket` — pages, posts, sap, all
- `execution` — meta-only, full-aiseo
- `signal` — GSC trigger signal id
- `vertical` — general, local-seo, home-services, editorial, ecommerce
- `q` — search name, description, keyword, tags
- `includeTasks` — include full `defaultTasks` array

## Install

POST `/api/teams/{teamId}/tasks/projects` with:

```json
{
  "title": "Advance Blinds — SEO Autopilot Flywheel",
  "sourceTemplateKeyword": "seo-autopilot-flywheel",
  "isAutomation": true,
  "wordpressSiteId": "wp-123",
  "defaultTasks": []
}
```

Pass customized `defaultTasks` from the planner and `sourceTemplateKeyword` (not `templateKeyword`) so the server uses your plan instead of re-resolving the template.

Installed projects set `isAutomation: true` and expand recipe actions as trigger tasks assigned to Pulse.

Calendar editorial recipes (`monthly-post-creator`, `monthly-3-posts-editorial`) use `executionKind: post_creator` and run the Generator bulk post pipeline on a monthly schedule.

## Pulse Assist tools

| Tool | Mode | Purpose |
| --- | --- | --- |
| `recipes_list` | Ask, Plan, Build | Filtered catalog |
| `recipes_describe` | Ask, Plan, Build | One recipe by keyword |
| `recipes_install` | Build | Install recipe for a site |
| `recipes_run` | Build | `evaluate`, `now`, or `install_only` |

## UI

Pulse Assist and the Tasks automation APIs install recipes as automation projects. Manual projects and My Tasks stay under **Teams → Tasks**.

## Recipe JSON shape

```json
{
  "keyword": "entity-sap-guardian",
  "name": "Entity SAP Guardian",
  "description": "Full AISEO on entity pages when rankings drop.",
  "isAutomation": true,
  "category": "local-seo",
  "verticals": ["local-seo", "home-services"],
  "tags": ["gsc", "sap"],
  "prerequisites": ["gsc", "wordpress", "entity-sitemap"],
  "filters": {
    "executionKinds": ["content_optimizer"],
    "targetBuckets": ["sap"],
    "triggerSignals": ["position_drop"],
    "actionCount": 1
  },
  "triggerBlock": {
    "keyword": "gsc-position-drop",
    "kind": "gsc",
    "source": "gsc",
    "targetBucket": "sap",
    "triggerConfig": {}
  },
  "actionBlock": {
    "keyword": "content-optimizer-full",
    "executionKind": "content_optimizer",
    "executionPayload": { "targetBucket": "sap", "updateMode": "update" },
    "title": "Refresh entity pages on position drop"
  },
  "defaultTasks": []
}
```

Multi-action recipes may also include `actionBlocks[]`. Regenerate files with `node scripts/build-automation-recipes.mjs`.
