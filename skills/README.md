# Pulse skills

Product skills that run real work for an Integrations site (count, validate, execute). Not Cursor coding skills (those live under `.agents/skills/`).

## Authoring standard

Read **[Creating Pulse skills](../docs/skills/creating-pulse-skills.md)** before adding a skill.

Every new skill must follow that guide and match the reference layout below.

## Skills in this folder

| Skill | Assignable id | Job |
| --- | --- | --- |
| [`posts-content-gap-check`](posts-content-gap-check/) | `content.posts.gap-check` | Count next-month blog posts vs site quota; schedule and start Blog Ideas when short |
| [`entities-content-gap-check`](entities-content-gap-check/) | `content.entities.gap-check` | Count next-month SAP pages vs site quota; run locations grid, entity CSV, and create pages when short |

## Quick layout reminder

```text
skills/<skill-name>/
  SKILL.md
  scripts/           # entrypoints (count, validate-…, execute)
  scripts/lib/       # named helpers + cli.mjs EXIT codes
  scripts/__tests__/
  assets/            # JSON schemas
  references/        # rules read only when needed
```

Run entrypoints from the **repo root**, for example:

```bash
node skills/posts-content-gap-check/scripts/count.mjs --site-id SITE_ID
```
