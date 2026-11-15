# Creating Pulse skills

Best practices for **Pulse product skills** under `skills/` (Property Skills Run / Auto, agents, Node scripts).

This is not the guide for Cursor coding skills in `.agents/skills/`. Those teach the IDE how to edit the app. Pulse skills under `skills/` do real work for a site: count, validate, execute.

**Reference skill:** [`skills/posts-content-gap-check/`](../../skills/posts-content-gap-check/). Copy that shape. Do not invent a second layout.

---

## What a Pulse skill is

One job. One folder. A short `SKILL.md` that a person or agent can follow. Thin Node scripts that print JSON, fail with clear exit codes, and never invent business answers in code.

If the skill needs judgment (dates, topics, wording), put rules in `references/` or a JSON schema in `assets/`, and let the agent or OpenRouter fill the plan. Scripts only validate and run.

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

## Wire-up checklist (Pulse app)

When the skill should show on a property or run from the UI:

1. Keep the skill folder complete and green under Vitest.
2. Add or extend a **server** route that runs the skill steps (browser calls `backendApiUrl` only). Reference: posts content gap run API used by [`src/lib/posts-content-gap/posts-content-gap-api.ts`](../../src/lib/posts-content-gap/posts-content-gap-api.ts).
3. If it is an assignable agent, register it in [`src/lib/agent-pipeline/pulse-agent-registry.ts`](../../src/lib/agent-pipeline/pulse-agent-registry.ts) with:
   - `id` equal to `metadata.assignableId`
   - `sourceModule` pointing at `skills/your-skill-name/SKILL.md`
4. Wire Property Skills Run / Auto only after the scripts and API exist. Do not invent a second skill registry.

---

## Do / Do not

**Do**

- Copy `posts-content-gap-check` as the template.
- Keep `SKILL.md` short and checklist-first.
- Use the shared exit code map.
- Name files and functions so a stranger can guess the job.
- Test help, usage failure, and validation.

**Do not**

- Put secrets, app passwords, or `.env` files in the skill folder.
- Browser-fetch WordPress or Semrush from the skill or from client code.
- Invent dates, quotas, or content in validators “to be helpful.”
- Grow `SKILL.md` into a novel; move depth to `references/`.
- Mount a different folder layout for the next skill.
- Silent retries or fallback paths the checklist did not name.

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
- [ ] Server API + thin client caller if the UI must run it
- [ ] Agent registry row if assignable (`id` + `sourceModule`)

---

## Closing

Pulse skills stay predictable when every skill looks like the last one: same folders, same exit codes, same checklist voice, code names that mean what they do. Start from `posts-content-gap-check`. Keep scripts thin. Keep rules where an agent can read them. Fail loud. That is the standard.
