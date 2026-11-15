---
name: posts-content-gap-check
description: Checks next month published and scheduled blog posts for one Integrations site. Use when that month is short of the site saved blog quota and posts should be created from Blog Ideas, or when the property skill Run or Auto should do that check.
compatibility: Requires Node 20+ from the Neo Pulse repo root, with the local Pulse API reachable. Not a browser script.
metadata:
  author: neo-digital
  version: "1.0"
  assignableId: content.posts.gap-check
---

# Posts Content Gap Check

Count next month blog posts (published + scheduled) for one site. If the count is short of that site’s saved monthly blog quota, write a schedule plan, validate it, then start Blog Ideas until WordPress upload finishes.

## Available scripts

- **`scripts/count.mjs`** — Next-month published + scheduled blog counts and gap JSON
- **`scripts/validate-schedule.mjs`** — Accept or reject a schedule plan against count JSON
- **`scripts/execute.mjs`** — Dry-run or confirm-start the Blog Ideas task

## Checklist

Progress:

- [ ] Step 1: Count next month
  ```bash
  node skills/posts-content-gap-check/scripts/count.mjs --site-id SITE_ID > count.json
  ```
- [ ] Step 2: If `goalMet` is true, stop. Do not create posts.
- [ ] Step 3: Read `references/schedule-rules.md` and write `schedule.json` from `assets/schedule.schema.json`
- [ ] Step 4: Validate
  ```bash
  node skills/posts-content-gap-check/scripts/validate-schedule.mjs --count count.json --plan schedule.json
  ```
  If exit 5, fix `schedule.json` and validate again. Do not invent dates in code.
- [ ] Step 5: Preview (optional)
  ```bash
  node skills/posts-content-gap-check/scripts/execute.mjs --site-id SITE_ID --count count.json --plan schedule.json --dry-run
  ```
- [ ] Step 6: Make the posts in Blog Ideas Studio (background)
  Property Skills **Run** counts the gap, then starts a background **Blog Ideas Studio** task. That task generates **one idea per gap** and creates those posts without driving the open UI.

## Gotchas

- Next calendar month in America/Edmonton, not the current month.
- Blog post type `post` only. Do not count `service-area`.
- Do not call `content_gap_check` or the Forge recipe `blog-content-gap-check`.
- Last schedulable day is the last day of the month minus 5.
- Gap 0 means stop with no new posts.
- `keywordSource` is always `gsc`.
- Posts are made by Blog Ideas Studio: Ideas, then the post run.
- Quota comes from the site record. Do not put a package tier name in titles or client-facing copy.
- `execute` refuses to create posts without `--confirm`. Use `--dry-run` to preview.

## When to read more

Read `references/schedule-rules.md` only while writing or fixing `schedule.json`.
