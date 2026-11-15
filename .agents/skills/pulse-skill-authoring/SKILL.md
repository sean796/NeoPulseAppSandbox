---
name: pulse-skill-authoring
description: >-
  Author or update Pulse product skills under skills/ (Property Skills Run/Auto,
  Node count/validate/execute scripts, assignableId). Use when creating a new
  Pulse skill, editing SKILL.md in skills/, or matching posts-content-gap-check
  patterns. Not for Cursor-only coding skills in .agents/skills except this guide.
---

# Pulse skill authoring

Pulse product skills live in `skills/`. They are not the same as Cursor coding skills.

## Required reading

1. Read [`docs/skills/creating-pulse-skills.md`](../../../docs/skills/creating-pulse-skills.md) end to end.
2. Use [`skills/posts-content-gap-check/`](../../../skills/posts-content-gap-check/) as the only reference layout.

## Non-negotiables

- One job per folder; kebab-case name; frontmatter with `assignableId` as `domain.area.action`.
- Layout: `SKILL.md`, `scripts/`, `scripts/lib/`, `scripts/__tests__/`, `assets/`, `references/`.
- Entrypoints: `--help`, JSON on stdout, errors on stderr, shared `EXIT` codes (0/2/3/4/5/6).
- Writes need `--confirm`; offer `--dry-run`.
- Meaningful file names (`build-count`, `validate-plan`). No junk-drawer `utils.mjs`.
- Scripts validate and run; rules and schemas hold policy. No inventing dates or quotas in code.
- Server-side Pulse API only. No browser fetch to WordPress or third parties.
- Keep `SKILL.md` short: overview, Available scripts, Checklist, Gotchas, When to read more.

## When wiring into the app

- Thin client calls `backendApiUrl` to a server route that runs the skill.
- If assignable, register in `src/lib/agent-pipeline/pulse-agent-registry.ts` with `id` = `assignableId` and `sourceModule` = `skills/<name>/SKILL.md`.

## Do not

- Invent a different folder shape or exit-code scheme.
- Put secrets in the skill folder.
- Grow `SKILL.md` into a long essay; use `references/` instead.
