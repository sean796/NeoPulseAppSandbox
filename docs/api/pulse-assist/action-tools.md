# Pulse Assist action tools

Task manager tools for Pulse Assist Build mode. Ask and Plan preview actions; Build executes writes.

## Submodes

| Submode | Task tools |
|---------|------------|
| Ask | Read tools only. Write intent returns preview card with `submode_switch: build`. |
| Plan | Read tools + execution preview table. No database writes. |
| Build | Executes planned tool calls (create/update tasks and projects). |

## Read tools

- `tasks_list_projects`
- `tasks_list_sections`
- `tasks_search`
- `tasks_list_my`
- `team_list_members`
- `tasks_list_templates`
- `recipes_list` (filters: category, bucket, execution, signal, vertical, q)
- `recipes_describe` (keyword)

## Write tools (Build only)

- `tasks_create`
- `tasks_create_batch` (max 25 tasks per request)
- `tasks_update`
- `tasks_create_project` (supports `templateKeyword`, `taskClients`, `wordpressSiteId`)
- `tasks_save_template`
- `tasks_delete_template`
- `recipes_install` (keyword, wordpressSiteId, optional title) — site-bound automation project
- `recipes_run` (mode: `evaluate`, `now`, `install_only`; keyword; wordpressSiteId; optional taskId)
- `executions_start` (taskId; optional executionKind and executionPayload overrides)
- `gsc_reporting_execute` (comparePreset: `mom` | `yoy`; saveToDisk; wordpressSiteId)
- `ads_reporting_execute` (comparePreset: `mom` | `yoy`; saveToDisk; wordpressSiteId)
- `post_creator_execute` (postCount; keywordSource; optionalPrompt; scheduleTimesPerMonth; scheduleStartDay; scheduleStartTime; featuredImage; postDestination; wordpressSiteId)

## GSC reporting automations

Install monthly report recipes from the automation library:

- `gsc-monthly-mom-report` — calendar monthly MoM report with local download
- `gsc-monthly-yoy-report` — calendar monthly YoY report with local download

Or queue an immediate report from Build:

```json
{ "tool": "gsc_reporting_execute", "args": { "comparePreset": "mom", "saveToDisk": true, "wordpressSiteId": "site-id" } }
```

## PPC reporting automations

Install monthly Google Ads report recipes from the automation library:

- `ads-monthly-mom-report` — calendar monthly MoM PPC report
- `ads-monthly-yoy-report` — calendar monthly YoY PPC report

The property must have a 10-digit Google Ads customer ID. MCC is login-customer-id only.

Or queue an immediate report from Build:

```json
{ "tool": "ads_reporting_execute", "args": { "comparePreset": "mom", "saveToDisk": true, "wordpressSiteId": "site-id" } }
```

## Post creator automations

Install monthly post creator recipes from the automation library:

- `monthly-post-creator` — calendar monthly post generation (configurable post count)
- `monthly-3-posts-editorial` — 3 posts on the 1st of each month, spread across the month

Or queue an immediate run from Build:

```json
{
  "tool": "post_creator_execute",
  "args": {
    "postCount": 3,
    "keywordSource": "prompt",
    "optionalPrompt": "local SEO tips aligned with site gaps",
    "scheduleTimesPerMonth": 3,
    "scheduleStartDay": 1,
    "scheduleStartTime": "09:00",
    "featuredImage": true,
    "postDestination": "wordpress",
    "wordpressSiteId": "site-id"
  }
}
```

## Templates

Read templates with `tasks_list_templates`. Save or update one template with `tasks_save_template`:

```json
{ "keyword": "monthly-seo", "name": "Monthly SEO", "defaultTasks": [{ "keyword": "audit", "title": "Monthly SEO Audit", "status": "todo" }] }
```

Create a project from a template:

```json
{ "tool": "tasks_create_project", "args": { "title": "Monthly Tasks", "templateKeyword": "monthly-seo", "taskClients": [{ "taskKeyword": "audit", "clientSiteId": "site-id" }] } }
```

Build returns **Saved template**, **Deleted template**, **Created project**, or **Installed automation** cards with past-tense summaries.

See [Automation recipes](../automation-recipes/overview.md) for the JSON catalog and install flow.

## Automation recipes

Ask and Plan can list and describe recipes. Build installs and runs them.

- `recipes_install` creates a site-bound automation project and links to **Tasks**.

```json
{ "tool": "recipes_install", "args": { "keyword": "gsc-monthly-mom-report", "wordpressSiteId": "site-id" } }
```

```json
{ "tool": "recipes_install", "args": { "keyword": "ads-monthly-mom-report", "wordpressSiteId": "site-id" } }
```

## Request context

Include `team_context` on `POST /api/pulse-assist/stream` and `POST /api/pulse-assist`:

```json
{
  "team_context": {
    "teamId": 1,
    "teamName": "Neo Digital Inc.",
    "activeProjectId": 12,
    "activeProjectTitle": "Advance Blinds",
    "members": [{ "userId": 42, "displayName": "PIO", "jobTitle": "SEO Specialist" }],
    "projects": [{ "id": 12, "title": "Advance Blinds", "keyword": "advance-blinds" }]
  }
}
```

## Stream events

- `action_plan` — planned tool calls before Build execution
- `tool` — per-tool execution progress (`running` | `done` | `error`)

## Orchestration

1. Action intent router classifies task-manager requests
2. Dynamic slice team (member/project/task specialists)
3. Lead execution agent produces `toolCalls` JSON
4. Build mode runs tools via `Neo_Pulse_App_Tasks_Store`

## Project creation

Build mode supports creating new task projects via `tasks_create_project`.

Example prompts (typos like `projecrt` / `porject` are handled):

- `create a new project called Client Optimization`
- `create a ne projecrt called porject optimizastion`

The intent router matches project-creation phrases on the Tasks tab. Build returns a **Created project** card with `action_result.createdProjectId`.

## Compound project + task

When a single message asks for a new project and one or more tasks, Build runs both tools in order:

1. `tasks_create_project` with normalized title (e.g. `"monthly tasks"` → `"Monthly Tasks"`)
2. `tasks_create` or `tasks_create_batch` with `projectId: 0` (executor chains the new project id)

Example prompt:

- `create a new project called monthly tasks and add a task to optimize all posts every first of month`

Expected Build result:

- Project **Monthly Tasks**
- Task **Optimize {client} posts** with due date on the next 1st of the month
- Card title **Created project and 1 task** with preview table columns `Task`, `Project`, `Due`
- Past-tense summary body from execution results (not future-tense preview copy)

If the project is created but the task write fails, Build returns an error card **Project created, task missing** instead of silent success.

## Endpoints

- `POST /api/pulse-assist/stream` — Ask/Plan (NDJSON) and Build (NDJSON)
- `POST /api/pulse-assist` — Build sync (used by Build harness)
