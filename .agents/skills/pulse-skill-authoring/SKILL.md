---
name: pulse-skill-authoring
description: >-
  Author or update Pulse product skills under skills/ (Property Skills Run/Auto,
  Node count/validate/execute scripts, assignableId). Use when creating a new
  Pulse skill, editing SKILL.md in skills/, wiring agent library / Property
  Skills, or matching posts-content-gap-check / entities-content-gap-check.
  Not for Cursor-only coding skills in .agents/skills except this guide.
---

# Pulse skill authoring

Pulse product skills live in `skills/`. They are not the same as Cursor coding skills.

## Required reading

1. Read [`docs/skills/creating-pulse-skills.md`](../../../docs/skills/creating-pulse-skills.md) **end to end**, especially **Wire-up checklist (Pulse app + agent library)** and **Local Docker: sync after every PHP change**.
2. Copy layout from one of these (same spine; do not invent a third):
   - [`skills/posts-content-gap-check/`](../../../skills/posts-content-gap-check/) — blog / posts package gap
   - [`skills/entities-content-gap-check/`](../../../skills/entities-content-gap-check/) — SAP package gap; prefer this for the newest full wire-up (Tasks UX, fill job, Docker sync)

## Non-negotiables

- One job per folder; kebab-case name; frontmatter with `assignableId` as `domain.area.action`.
- Layout: `SKILL.md`, `scripts/`, `scripts/lib/`, `scripts/__tests__/`, `assets/`, `references/`.
- Entrypoints: `--help`, JSON on stdout, errors on stderr, shared `EXIT` codes (0/2/3/4/5/6).
- Writes need `--confirm`; offer `--dry-run`.
- Meaningful file names (`build-count`, `validate-plan`). No junk-drawer `utils.mjs`.
- Scripts validate and run; rules and schemas hold policy. No inventing dates or quotas in code.
- Server-side Pulse API only. No browser fetch to WordPress or third parties.
- Keep `SKILL.md` short: overview, Available scripts, Checklist, Gotchas, When to read more.

## When wiring into the app (agent library / Property Skills)

Do the full checklist in `docs/skills/creating-pulse-skills.md`. Short form:

1. Hub PHP under `wordpress-plugins/neo-pulse-app/includes/<feature>/` (pipeline, runner, route, cron/schedule) + dispatcher, route registry, loader, recipe key.
2. Thin client: `backendApiUrl('/<skill-kebab>/run')` + PropertyOverviewSection Run that polls the agent run.
3. Register everywhere peers already list posts/entities/semrush: `pulse-agent-registry`, `ASSIGNABLE_SITE_AGENTS`, agent-run types/nav/grouping/lifecycle, `PROFILE_SKILL_KINDS`, skills-library map if needed.
4. **Tasks UX:** `trackStartedAgentRun` while polling; on start failure or thrown errors register an error Tasks row and `openTasksPanel()`. Never silent `.catch`. Goal met still leaves the count run visible.
5. **After any PHP change locally:** `npm run sync:local-wp`, then confirm the new files exist inside `wpstg-neopulse-local-php` (`/var/www/wp-content/plugins/...`). Host junctions alone do not update the Docker webroot volume. If Run “does nothing,” check for a missing container file and zero rows for your `recipe_key` in `wp_neo_pulse_agent_runs`.

## Do not

- Invent a different folder shape or exit-code scheme.
- Put secrets in the skill folder.
- Grow `SKILL.md` into a long essay; use `references/` instead.
- Ship Property Skills Run that fails or goal-mets with no Tasks feedback.
- Assume local PHP edits are live without `npm run sync:local-wp`.
