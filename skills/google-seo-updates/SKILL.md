---
name: google-seo-updates
description: >-
  Searches official Google Search Central sources every Monday (and on Generate),
  appends one dated archive entry of major SEO changes that affect how posts are
  written, and rewrites a standing livePrompt used on content actions. Profile
  agnostic. Use when Google SEO rules, ranking updates, or the live post-writing
  prompt should be refreshed.
compatibility: Requires Node 20+ from the Neo Pulse repo root, with the local Pulse API reachable. Not a browser script.
metadata:
  author: neo-digital
  version: "1.1"
  assignableId: seo.google.updates
---

# Google SEO Updates

One OpenRouter online model call (`openai/gpt-6-sol:online`) does query fan-out for the current month (core update, ranking, Search Central, Search Console, SEO news), then writes a detailed monthly summary and sourced stories into one dated archive entry. Rewrite `livePrompt` when that entry has new post rules. Monday cron and Skills tab Generate share the same job. No DataForSEO. No RSS.

## Available scripts

- **`scripts/validate-archive.mjs`** — Accept or reject a dated archive entry JSON
- **`scripts/run.mjs`** — Dry-run or confirm-POST Generate on the hub

## Checklist

Progress:

- [ ] Step 1: Read `references/official-sources.md` and `references/live-prompt-rules.md`
- [ ] Step 2: Validate a sample entry (optional)
  ```bash
  node skills/google-seo-updates/scripts/validate-archive.mjs --entry entry.json
  ```
  If exit 5, fix the entry and validate again.
- [ ] Step 3: Preview Generate
  ```bash
  node skills/google-seo-updates/scripts/run.mjs --dry-run
  ```
- [ ] Step 4: Run Generate on the hub
  ```bash
  node skills/google-seo-updates/scripts/run.mjs --confirm
  ```
  Or press **Generate** on this skill in the Skills tab.

## Gotchas

- Official Google sources only. Do not pull third-party recaps.
- Each search appends one dated entry. Earlier entries stay.
- Code owns `id` and `date`. The model does not pick them.
- Empty `items` still saves the dated entry. `livePrompt` stays as it was.
- A failed search writes `lastRunError` and does not append an entry.
- This skill is not assigned on client profiles.

## When to read more

Read `references/official-sources.md` and `references/live-prompt-rules.md` while writing or fixing extract and rewrite prompts.
