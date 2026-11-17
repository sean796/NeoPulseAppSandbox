# Creating Pulse skills

Best practices for **Pulse product skills** under `skills/` (Property Skills Run / Auto, agents, Node scripts).

This is not the guide for Cursor coding skills in `.agents/skills/`. Those teach the IDE how to edit the app. Pulse skills under `skills/` do real work for a site: count, validate, execute.

**Reference skills (copy these; do not invent a third layout):**

| Job shape | Folder | Use when |
| --- | --- | --- |
| Count → optional client fill | [`skills/posts-content-gap-check/`](../../skills/posts-content-gap-check/) | Blog / posts package gap |
| Count → optional client fill | [`skills/entities-content-gap-check/`](../../skills/entities-content-gap-check/) | SAP / service-area package gap |
| Inventory → AI plan → Neo MCP write + email | [`skills/money-page-internal-links/`](../../skills/money-page-internal-links/) | Blog → money-page inbound links + sean@ report |

These are Property Skills with the same spine: Node scripts + PHP hub route/runner + thin React caller + Assignable row on the client profile. Prefer **entities** as the newer full wire-up example (Tasks UX, Docker sync, fill job). Prefer **posts** when matching blog quota / Blog Ideas Studio. Prefer **money-page-internal-links** when the skill plans site writes via Neo MCP and emails a follow-up report like Semrush Safe Fix.

---

## What a Pulse skill is

One job. One folder. A short `SKILL.md` that a person or agent can follow. Thin Node scripts that print JSON, fail with clear exit codes, and never invent business answers in code.

If the skill needs judgment (dates, topics, wording), put rules in `references/` or a JSON schema in `assets/`, and let the agent or OpenRouter fill the plan. Scripts only validate and run.

**Assignable Property Skill** means: Off / Auto / Run on the client profile Skills panel, an agent-run recipe for the count (or whole job), and usually a workspace Tasks row so Run is never silent.

---

## One job per skill

| Rule | How to apply it |
| --- | --- |
| Folder name | kebab-case verb phrase: `posts-content-gap-check` |
| One concern | Gap check is not also a full SEO audit. Split if the checklist grows a second product |
| Readable id | `metadata.assignableId` uses `domain.area.action` (example: `content.posts.gap-check`) |

### Frontmatter (required)

```yaml
---
name: your-skill-name
description: What it does. Use when … (triggers for Run, Auto, or agents).
compatibility: Requires Node 20+ from the Neo Pulse repo root, with the local Pulse API reachable. Not a browser script.
metadata:
  author: neo-digital
  version: "1.0"
  assignableId: domain.area.action
---
```

- **description:** third person, what + when. Include words people say when they want this skill.
- **compatibility:** Node from repo root, Pulse API. Say it is not a browser script.
- **assignableId:** stable. Match the agent registry id when you register the skill.

---

## Fixed folder layout

```text
skills/
  your-skill-name/
    SKILL.md                 # short contract + checklist
    scripts/
      count.mjs              # or other action entrypoints
      validate-….mjs
      execute.mjs
      lib/
        cli.mjs              # parseArgs, EXIT, printJson, printErr
        build-….mjs          # one concern per file
        fetch-….mjs
        validate-….mjs
      __tests__/
        your-skill-scripts.test.ts
    assets/
      something.schema.json  # shapes the agent must fill
    references/
      rules.md               # read only when writing or fixing that plan
```

| Path | Purpose |
| --- | --- |
| `SKILL.md` | Overview, scripts list, checklist, gotchas |
| `scripts/*.mjs` | Entrypoints people run from the repo root |
| `scripts/lib/*.mjs` | Helpers with names that mean something |
| `scripts/__tests__/` | Help, usage failures, validation happy path |
| `assets/*.schema.json` | Structured plans the agent writes |
| `references/*.md` | Rules loaded only when needed |

Do not dump unrelated helpers into `utils.mjs`. Do not put secrets in the skill folder.

---

## SKILL.md shape

Keep the main file short (about 200 lines or less). Use this section order:

1. **Title and one-paragraph overview** — what happens end to end.
2. **Available scripts** — one line each: path and what JSON or action it produces.
3. **Checklist** — numbered steps with copy-paste `node skills/…` commands. Exit codes called out where the agent must stop or fix a plan.
4. **Gotchas** — short bullets. Hard rules that prevent wrong runs.
5. **When to read more** — point at `references/` only for the step that needs them.

Progressive disclosure: details live in `references/` and schemas. The checklist stays the spine.

---

## Predictable script contract

### Names

Entrypoints are verbs: `count.mjs`, `validate-schedule.mjs`, `execute.mjs`.  
Lib files say what they build or check: `build-count.mjs`, `validate-plan.mjs`, `fetch-counts.mjs`, `calendar.mjs`, `sites.mjs`, `quota.mjs`.

### CLI

- Every entry script supports `--help`.
- Help text includes **Usage**, **Options**, **Examples**, and **Exit codes**.
- Parse flags with a shared `parseArgs` (see the reference `scripts/lib/cli.mjs`).
- **stdout:** one JSON object (or a stream of JSON lines if you document that).
- **stderr:** usage, errors, help. Humans read stderr; agents parse stdout.

### Exit codes (standard map)

Use the same numbers across Pulse skills so debugging is predictable:

| Code | Meaning |
| --- | --- |
| 0 | Success (including “nothing to do” when that is valid) |
| 2 | Invalid arguments / usage |
| 3 | Site missing or site config incomplete |
| 4 | Required data unavailable (counts, API payload) |
| 5 | Plan or input rejected by validation |
| 6 | Auth or worker failure |

Export them as `EXIT.OK`, `EXIT.USAGE`, `EXIT.SITE`, `EXIT.COUNTS` (or `DATA`), `EXIT.PLAN`, `EXIT.WORKER` in `scripts/lib/cli.mjs`.

### Safety

- Writes that create posts, start jobs, or change live data require `--confirm`.
- Offer `--dry-run` to preview without starting work.
- Refuse to invent dates, quotas, or keywords in script code when the plan or site record should supply them.
- Fail fast. One clear stderr line. No silent retry that hides the real failure.

---

## Meaningful code

| Do | Do not |
| --- | --- |
| Name files after the job (`fetch-counts`, `validate-plan`) | Name files `helpers`, `misc`, `stuff` |
| One concern per lib module | One mega file for calendar + sites + HTTP |
| Comment the usage line at the top of each entry script | Leave runners undocumented |
| Return typed-shaped JSON fields with stable names | Change field names between runs without bumping the skill version |
| Keep scripts thin: fetch, build, validate, print | Hide business policy in nested conditionals that belong in `references/` |

If two helpers share only “string trim” style utilities, still prefer a small `cli.mjs` over a junk drawer.

---

## Easy to debug

1. **Stable exit codes** — operators and agents branch on the number, not on fuzzy log text.
2. **Fail visibly** — stderr says what failed (`--site-id is required`, `gap is 0; do not create a schedule plan`).
3. **JSON you can pipe** — `> count.json` then validate against that file.
4. **Tests** — at minimum:
   - `--help` exits 0 and prints Usage + Exit codes
   - missing required flags exit 2
   - validate rejects bad plans (exit 5) and accepts a good plan
   - execute without `--dry-run` or `--confirm` exits 2

Mirror [`skills/posts-content-gap-check/scripts/__tests__/posts-content-gap-scripts.test.ts`](../../skills/posts-content-gap-check/scripts/__tests__/posts-content-gap-scripts.test.ts).

Run from repo root, for example:

```bash
npx vitest run skills/posts-content-gap-check/scripts/__tests__/posts-content-gap-scripts.test.ts
```

---

## AI and schemas

- Prefer a JSON schema in `assets/` for plans the agent writes.
- Put must-follow rules in `references/`. Scripts validate; they do not rewrite a bad plan into a “close enough” plan.
- For semantic choices (topics, titles), use OpenRouter with a clear schema through existing Pulse server paths. Do not add browser `fetch` to WordPress or third-party APIs from skill scripts or client UI.
- Skill scripts talk to **this app’s API** (or local files the skill owns). Credentials stay server-side.

---

## Wire-up checklist (Pulse app + agent library)

When the skill should show on a property or run from the UI, do **all** of these. Mirror [`entities-content-gap-check`](../../skills/entities-content-gap-check/) (or posts) end to end. Do not invent a second skill registry.

### 1. Skill folder (Node)

- Keep `skills/<kebab-name>/` complete and green under Vitest.
- `assignableId` in frontmatter is the stable product id (example: `content.entities.gap-check`).

### 2. Hub PHP plugin (`wordpress-plugins/neo-pulse-app`)

Add a small feature folder next to posts/entities (same class naming):

| Piece | Example (entities) | Job |
| --- | --- | --- |
| Pipeline | `includes/entities-content-gap/class-entities-content-gap-pipeline.php` | Count / validate / payload (no Node required on the hub) |
| Runner | `…-runner.php` | `start` → create agent run → `finish` (count; mark fill needed) |
| Route | `…-route.php` | `POST /api/<skill-kebab>/run` after session auth |
| Schedule / cron | `…-schedule.php`, `…-cron.php` | Auto / due stamps when assigned |
| PHP smoke test | `tests/test-entities-content-gap.php` | Quota, validate, payload |

Then register the HTTP surface:

1. **Dispatcher** — [`includes/router/class-api-dispatcher.php`](../../wordpress-plugins/neo-pulse-app/includes/router/class-api-dispatcher.php): prefix `entities-content-gap-check/` → route class.
2. **Route registry** — [`includes/router/class-api-route-registry.php`](../../wordpress-plugins/neo-pulse-app/includes/router/class-api-route-registry.php): `POST` path listed.
3. **Loader** — [`includes/class-neo-pulse-app-loader.php`](../../wordpress-plugins/neo-pulse-app/includes/class-neo-pulse-app-loader.php): require classes; cron `init` / activate / deactivate.
4. **Recipe key** — [`includes/agent-runs/class-agent-runs-recipe-registry.php`](../../wordpress-plugins/neo-pulse-app/includes/agent-runs/class-agent-runs-recipe-registry.php): snake_case key (example: `entities_content_gap_check`), title, `managerTabs`.
5. **Skills library store** (if the skill appears in Library prompts) — [`includes/skills-library/class-skills-library-store.php`](../../wordpress-plugins/neo-pulse-app/includes/skills-library/class-skills-library-store.php).
6. **Data paths** — only if the runner writes work dirs under Pulse data ([`includes/storage/class-neo-pulse-data-paths.php`](../../wordpress-plugins/neo-pulse-app/includes/storage/class-neo-pulse-data-paths.php)).

**Runner contract (Property Skills pattern):**

- `resolve_run_context` loads the site from the Integrations **mirror** and merges the posted body (`siteId`, credentials, name, url). Posted `appPassword` must win; the mirror often omits secrets.
- `start` creates the agent run and returns `{ ok, runId }` (HTTP **202**).
- `finish` runs the count (and any server steps). Put structured `result` on the run: `goalMet`, `gap` / page counts, hints the client fill needs (`entityPageCount`, `publishTimeHint`, etc.).
- Auto path: only sites with `assignedAgentIds` containing this `assignableId`.

### 3. Thin React / TypeScript client

| Piece | Example | Job |
| --- | --- | --- |
| API caller | [`src/lib/entities-content-gap/entities-content-gap-api.ts`](../../src/lib/entities-content-gap/entities-content-gap-api.ts) | `backendApiUrl('/entities-content-gap-check/run')` + session headers |
| Optional fill job | [`src/lib/entities-content-gap/entities-package-fill-job.ts`](../../src/lib/entities-content-gap/entities-package-fill-job.ts) | Client-side grid → CSV → create pages when count says gap > 0 |
| Property Run | [`PropertyOverviewSection.tsx`](../../src/components/integrations/wordpress/PropertyOverviewSection.tsx) | `start…` → poll agent run → optional `startWorkspaceTask` fill |

**UI contract (mandatory):**

- Browser calls **this app’s API only** (no direct WordPress / third-party fetch).
- Poll the agent run with `trackStartedAgentRun` so Tasks can show the count.
- On start failure, missing `runId`, or thrown errors: **register a Tasks row with `status: "error"`** and `openTasksPanel()`. Never `.catch(() => ({ ok: false }))` with no UI.
- If `goalMet` or gap &lt; 1: stop fill; still leave the agent-run task visible (open Tasks).
- If gap &gt; 0: `startWorkspaceTask` for the fill (`kind` = recipe key). Profile skills stay on the client URL.

### 4. Agent library / registry / Tasks surface

Touch every list that already knows posts/entities/semrush. Miss one and Run looks broken.

| File | What to add |
| --- | --- |
| [`src/lib/agent-pipeline/pulse-agent-registry.ts`](../../src/lib/agent-pipeline/pulse-agent-registry.ts) | `id` = `assignableId`, `sourceModule` = `skills/<name>/SKILL.md` |
| [`src/lib/agent-library/agent-library-api.ts`](../../src/lib/agent-library/agent-library-api.ts) | Row in `ASSIGNABLE_SITE_AGENTS` (`id` + `label`) |
| [`src/lib/agent-library/__tests__/agent-library-entries.test.ts`](../../src/lib/agent-library/__tests__/agent-library-entries.test.ts) | Assert assignable + skills catalog entry |
| [`src/lib/agent-runs-types.ts`](../../src/lib/agent-runs-types.ts) | Recipe key union member |
| [`src/lib/agent-runs/agent-run-navigation.ts`](../../src/lib/agent-runs/agent-run-navigation.ts) | Title / section / recipe recognition |
| [`src/lib/agent-runs/agent-run-grouping.ts`](../../src/lib/agent-runs/agent-run-grouping.ts) | Group bucket (example: `editorial`) |
| [`src/contexts/use-agent-runs-lifecycle.ts`](../../src/contexts/use-agent-runs-lifecycle.ts) | Include recipe in lifecycle filters if peers are listed |
| [`src/contexts/TaskManagerProvider.tsx`](../../src/contexts/TaskManagerProvider.tsx) | `PROFILE_SKILL_KINDS` includes recipe key |
| [`src/lib/skills-library/skills-library-api.ts`](../../src/lib/skills-library/skills-library-api.ts) | Map `assignableId` → library slug if Library uses it |

### 5. Local Docker: sync after every PHP change

Host junctions under `wpstaging/.../www/wp-content/plugins` are **not** what PHP-FPM serves. The container uses the **Docker webroot volume**. New PHP folders can exist on disk and still be **missing in the container**. Symptom: UI Run does nothing / Tasks stay empty / `wp_neo_pulse_agent_runs` never gets the new `recipe_key`.

After editing `wordpress-plugins/neo-pulse-app` (or `-wp`):

```powershell
npm run sync:local-wp
```

That script junctions on the host **and** `docker cp`s into `wpstg-neopulse-local-php`, then signals opcache reload. See [`docs/deploy-local-branching-pathway.md`](../deploy-local-branching-pathway.md) and [`scripts/sync-local-wp-plugins.ps1`](../../scripts/sync-local-wp-plugins.ps1).

**Verify before blaming the UI:**

```powershell
docker exec wpstg-neopulse-local-php sh -c "test -f /var/www/wp-content/plugins/neo-pulse-app/includes/<your-folder>/<your-route>.php && echo OK"
```

Empty auth probe should be **401**, not a generic missing route after login. A real Run must insert a row in `wp_neo_pulse_agent_runs` with your `recipe_key`.

### 6. Tests to run (agent executes these)

```bash
npx vitest run skills/<kebab-name>/scripts/__tests__/
npx vitest run src/lib/agent-library/__tests__/agent-library-entries.test.ts
php wordpress-plugins/neo-pulse-app/tests/test-<skill>.php
npm run sync:local-wp
```

---

## Do / Do not

**Do**

- Copy `posts-content-gap-check` or `entities-content-gap-check` as the template (same layout).
- Keep `SKILL.md` short and checklist-first.
- Use the shared exit code map.
- Name files and functions so a stranger can guess the job.
- Test help, usage failure, and validation.
- Sync Docker plugins after PHP wire-up; confirm an agent-run row exists after Run.
- Fail into Tasks (error row + open panel). Never silent catch.

**Do not**

- Put secrets, app passwords, or `.env` files in the skill folder.
- Browser-fetch WordPress or Semrush from the skill or from client code.
- Invent dates, quotas, or content in validators “to be helpful.”
- Grow `SKILL.md` into a novel; move depth to `references/`.
- Mount a different folder layout for the next skill.
- Silent retries or fallback paths the checklist did not name.
- Assume the host plugin junction is live inside Docker without `sync:local-wp`.
- Ship Property Skills Run that returns early with no Tasks / agent-run feedback.

---

## New skill checklist

Copy this when starting a skill:

- [ ] Folder `skills/<kebab-name>/` with one clear job
- [ ] Frontmatter: name, description, compatibility, metadata (author, version, assignableId)
- [ ] `SKILL.md`: overview, Available scripts, Checklist, Gotchas, When to read more
- [ ] Entrypoints with `--help`, JSON stdout, stderr errors
- [ ] `scripts/lib/cli.mjs` with standard `EXIT` codes
- [ ] Meaningful lib file names (no junk-drawer `utils`)
- [ ] Schema and/or `references/` for agent-written plans
- [ ] Vitest coverage for help, usage, validate
- [ ] Hub PHP: pipeline, runner, route, cron/schedule as needed
- [ ] Dispatcher + route registry + loader + agent-runs recipe key
- [ ] Thin client API + PropertyOverviewSection Run/Auto wiring
- [ ] Agent registry + `ASSIGNABLE_SITE_AGENTS` + agent-run types/nav/grouping/lifecycle
- [ ] `PROFILE_SKILL_KINDS` (+ skills-library map if Library lists it)
- [ ] Tasks: poll `trackStartedAgentRun`; errors and goalMet open Tasks; no silent `.catch`
- [ ] `npm run sync:local-wp` and confirm container has the new PHP files
- [ ] Smoke: Run creates `wp_neo_pulse_agent_runs` row; gap path starts fill task when required

---

## Closing

Pulse skills stay predictable when every skill looks like the last one: same folders, same exit codes, same checklist voice, code names that mean what they do. Start from `posts-content-gap-check` or `entities-content-gap-check`. Keep scripts thin. Keep rules where an agent can read them. Fail loud into Tasks. Sync the hub plugin into Docker before you trust local Run. That is the standard.
