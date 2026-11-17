---
name: entities-content-gap-check
description: Checks next month published and scheduled service-area pages for one Integrations site. Use when that month is short of the site SAP package quota and pages should be created from the locations grid, or when the property skill Run or Auto should do that check.
compatibility: Requires Node 20+ from the Neo Pulse repo root, with the local Pulse API reachable. Not a browser script.
metadata:
  author: neo-digital
  version: "1.0"
  assignableId: content.entities.gap-check
---

# Entities Content Gap Check

Count next month service-area pages (published + scheduled) for one site. If the count is short of that site’s saved monthly SAP quota, write a schedule plan, validate it, then run the locations grid, build the entity CSV, and create the missing pages.

## Available scripts

- **`scripts/count.mjs`** — Next-month published + scheduled SAP counts and gap JSON
- **`scripts/validate-schedule.mjs`** — Accept or reject a schedule plan against count JSON
- **`scripts/execute.mjs`** — Dry-run or confirm-start the entities package fill

## Checklist

Progress:

- [ ] Step 1: Count next month
  ```bash
  node skills/entities-content-gap-check/scripts/count.mjs --site-id SITE_ID > count.json
  ```
- [ ] Step 2: If `goalMet` is true, stop. Do not create pages.
- [ ] Step 3: Read `references/schedule-rules.md` and write `schedule.json` from `assets/schedule.schema.json`
- [ ] Step 4: Validate
  ```bash
  node skills/entities-content-gap-check/scripts/validate-schedule.mjs --count count.json --plan schedule.json
  ```
  If exit 5, fix `schedule.json` and validate again. Do not invent dates in code.
- [ ] Step 5: Preview (optional)
  ```bash
  node skills/entities-content-gap-check/scripts/execute.mjs --site-id SITE_ID --count count.json --plan schedule.json --dry-run
  ```
- [ ] Step 6: Make the pages (background)
  Property Skills **Run** counts the gap, then starts a background fill: locations grid, entity CSV for the gap count, then create those service-area pages.

## Gotchas

- Next calendar month in America/Edmonton, not the current month.
- Service-area / entity CPT only. Do not count blog `post`.
- Do not call `content_gap_check` or the posts gap skill for this job.
- Last schedulable day is the last day of the month minus 5.
- Gap 0 means stop with no new pages.
- Page count is the gap, not the full package quota when some pages are already scheduled.
- Quota comes from the site record. Do not put a package tier name in titles or client-facing copy.
- Requires entity sitemap and a property primary keyword for the grid.
- `execute` refuses to create pages without `--confirm`. Use `--dry-run` to preview.

## When to read more

Read `references/schedule-rules.md` only while writing or fixing `schedule.json`.
