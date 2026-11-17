---
name: fact-checker
description: Product and service claim fact-checker for every blog post and service-area page on one Integrations property. Uses an OpenRouter web model to ground claims against manufacturer, manual, government, and industry sources. Writes claim rows into one Google Sheet named fact-checker and emails sean@neodigital.ca the same rows as a CSV. Use when Property Skills Run or Auto should verify product claims for a client profile.
compatibility: Requires Node 20+ from the Neo Pulse repo root, with the local Pulse API reachable. Not a browser script.
metadata:
  author: neo-digital
  version: "1.0"
  assignableId: content.product.fact-check
---

# Fact Checker

Read every published, scheduled, and draft blog post plus every service-area (entity) page for one Integrations site. Act as a **product claim fact-checker**: extract important product and service claims, ground each against outside sources via an OpenRouter web model (`openai/gpt-4o:online`), and write one row per claim into a Google Sheet. Market context comes from the profile macro location (city, state, country only). Do not audit geo or NAP. Do not edit the site. Do not audit page-sitemap money pages.

## Available scripts

- **`scripts/count.mjs`** — Page counts from inventory JSON (posts + service-area)
- **`scripts/validate-claims.mjs`** — Accept or reject a claims JSON against the schema

## Checklist

Progress:

- [ ] Step 1: Count pages
  ```bash
  node skills/fact-checker/scripts/count.mjs --inventory inventory.json
  ```
- [ ] Step 2: If `pageCount` is 0, stop. Do not email.
- [ ] Step 3: Read `references/fact-check-rules.md` and audit each page into claims JSON
- [ ] Step 4: Validate
  ```bash
  node skills/fact-checker/scripts/validate-claims.mjs --claims claims.json
  ```
- [ ] Step 5: Property Skills **Run** loads inventory, fact-checks pages on the server, and emails the report

## Output

One Google Sheet named fact-checker in the run folder. The same sheet is rewritten after each audited URL, before the next URL. One row per claim. A page with no product or service claims is one row with verdict `no product claims`.

Status stays on audit progress (`Checking N/total title`). The Drive folder and CSV link live on the run result, not in the step feed.

## Gotchas

- Client profile only (`/dashboard/{slug}`). Do not use the header connected site.
- Posts + entity CPT from the entity sitemap only. Skip page-sitemap, product, Hunter Douglas, promotion, shop-by-room, and location money pages.
- Macro location only: city, state, country from Integrations locations and service city. No streets or phones.
- Product and service claims only. Geo and NAP stay with Editorial Content Audit.
- Supported and partially supported claims need an http(s) source URL that is not the client site.
- Empty inventory: no email. Tasks shows zero pages.
- If a page reply has no claims array, call that page once more. If it still has none, skip that page and continue.
- Each tick loads at most one REST page of posts, then checks the next page.
- The site is not edited. No Neo MCP writes.

## When to read more

Read `references/fact-check-rules.md` only while writing or validating claims.
