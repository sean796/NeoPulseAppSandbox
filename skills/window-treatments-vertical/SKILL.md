---
name: window-treatments-vertical
description: >-
  Standing Hunter Douglas dealer rules for Neo Digital blinds clients. Injected
  on every content run when the site is Window treatments, Tailored Interiors,
  or Interiors by Laura. Skills Library only. Use when blinds vertical product
  names, trademarks, country spelling, or promotion claims must stay correct.
compatibility: Requires Node 20+ from the Neo Pulse repo root, with the local Pulse API reachable. Not a browser script.
metadata:
  author: neo-digital
  version: "1.0"
  assignableId: vertical.window-treatments.guide
---

# Window Treatments Vertical

Standing prompt for blinds clients. Content chat injects it beside the word blacklist when the site is a Window treatments client, Tailored Interiors, or Interiors by Laura. Not assigned on client profiles.

## Available scripts

- **`scripts/show-prompt.mjs`** — Print the standing prompt JSON from `references/standing-prompt.md`

## Checklist

Progress:

- [ ] Step 1: Read `references/standing-prompt.md`
- [ ] Step 2: Print the standing prompt
  ```bash
  node skills/window-treatments-vertical/scripts/show-prompt.mjs
  ```
- [ ] Step 3: Confirm Skills Library inspect shows the same text for `vertical.window-treatments.guide`

## Gotchas

- Library only. Do not add this id to profile assignable skills.
- Inject runs only when the request carries a blinds `siteId` and the word blacklist block is present.
- Public names: **Blind Spot**, **Custom Shades of London**.
- Tailored Interiors and Interiors by Laura are included even when tagged Interior design.
- Do not invent promotions, prices, or end dates in generated copy unless the page is that offer and the date has not passed.

## When to read more

Read `references/standing-prompt.md` when editing the injected rules.
