---
name: scenario-without-persona
description: >-
  Keep blog and service-area scenarios free of invented homeowner first names.
  Use situation openers (In this scenario / Consider a common situation / For
  example / In most cases) with a homeowner / their wording. Rewrites live pages
  via OpenRouter and saves only accepted HTML. Use when Property Skills or an
  agent must remove fictional people from illustrative examples.
compatibility: Requires Node 20+ from the Neo Pulse repo root and OPENROUTER_API_KEY (or email-worker-keys). WordPress writes use Integrations Application Password or Neo MCP.
metadata:
  author: neo-digital
  version: "1.0"
  assignableId: content.scenario.without-persona
---

# Scenario without persona

Illustrative examples are **situations**, not named people. Never invent a homeowner first name (Nadia, Arthur, Anya, Maya, Olivia, or any other proper first name). Keep product names and place names (Hunter Douglas, Paul Kane Park, James Macdonald Bridge, Mark Outside-Mount).

## Available scripts

- **`scripts/rewrite-scenarios.mjs`** — OpenRouter returns the full rewritten HTML for each page that has an invented first name. The script only validates (no placeholders, no in-script copy swaps) and saves. Supports `--site` or `--all-sites`.

## Checklist

Progress:

- [ ] Step 1: Read `references/wording.md`
- [ ] Step 2: Dry-run one site
  ```bash
  node skills/scenario-without-persona/scripts/rewrite-scenarios.mjs --site advanceblindsanddrapery.com --dry-run --limit 3
  ```
- [ ] Step 3: Confirm one site, or the whole portfolio
  ```bash
  node skills/scenario-without-persona/scripts/rewrite-scenarios.mjs --site advanceblindsanddrapery.com --confirm
  node skills/scenario-without-persona/scripts/rewrite-scenarios.mjs --all-sites --confirm --skip blindmagic.com
  ```
- [ ] Step 4: Purge cache for changed URLs (WP Engine / Neo MCP / NitroPack)

## Gotchas

- A first name is a homeowner only when the sentence treats them as a person in an example.
- Product brands, parks, bridges, and instruction labels are not homeowners.
- Empty model output or a rewrite that drops a preserved token: leave that page unchanged and report it.
- No find-and-replace of names in code. The model rewrites the spans.

## When to read more

Read `references/wording.md` before rewriting or writing new scenarios.
