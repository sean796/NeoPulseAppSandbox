---
name: fact-checker
description: Product and service claim fact-checker for every blog post and service-area page on one Integrations property. Uses an OpenRouter web model to ground claims against manufacturer, government, independent research, and educational sources. Writes claim rows into one Google Sheet named fact-checker and emails sean@neodigital.ca the same rows as a CSV with an AISEO grade. Use when Property Skills Run or Auto should verify product claims for a client profile.
compatibility: Requires Node 20+ from the Neo Pulse repo root, with the local Pulse API reachable. Not a browser script.
metadata:
  author: neo-digital
  version: "1.11"
  assignableId: content.product.fact-check
---

# Fact Checker

Read every published, scheduled, and draft blog post plus every service-area (entity) page for one Integrations site. Act as a **product claim fact-checker**: extract material factual claims, match them to competitive-neutral external evidence via an OpenRouter web model (`openai/gpt-6-sol:online`), and write one row per claim into a Google Sheet. The email includes a separate AISEO score. Market context comes from the profile macro location (city, state, country only). Do not audit streets, phones, or NAP. Do not edit the site. Do not audit page-sitemap money pages. This is not a proofreading pass.

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

One Google Sheet named fact-checker in the run folder. The same sheet is rewritten after each audited URL, before the next URL. One row per claim. Columns keep Claim link, Category, Verdict, Source title, Source URL, Source type, Qualification, and Suggested wording, plus Evidence and Severity.

Only material claims with competitive-neutral proof, or business claims flagged for company confirmation, appear. No unsupported rows. No duplicate claims. No stylistic noise.

The email reports the average AISEO score and letter, the main factual problems, required corrections, optional improvements, and a publication recommendation.

Status stays on audit progress (`Checking N/total title`). The Drive folder and CSV link live on the run result, not in the step feed.

## Gotchas

- Client profile only (`/dashboard/{slug}`). Do not use the header connected site.
- Posts + entity CPT from the entity sitemap only. Skip page-sitemap, product, Hunter Douglas, promotion, shop-by-room, and location money pages.
- Macro location only: city, state, country from Integrations locations and service city. No streets or phones.
- Exact claim match: the source must support the wording, model, and conditions, not only the topic.
- Competitive-neutral sources only: manufacturer docs, government, research, industry associations, educational or news pages. No competitor retailers, affiliate pages, or generic SEO blogs.
- Supported, partially supported, and contradicted need an external http(s) source URL. Homepages do not count.
- Every suggestion needs an external source URL on the same row. No business-confirmation rows. No unsupported rows. If there is no source URL, omit the claim.
- Suggested wording may recommend a direct evidence link with `rel="nofollow"` only when that same source URL supports the change.
- Empty inventory: no email. Tasks shows zero pages.
- If a page reply has no claims array, call that page once more. If it still has none, skip that page and continue.
- In-article post check: each quote must occur exactly once. If the sentence is repeated, extend it with unique neighboring words and return one edit per copy. A repeated quote is rejected. Rewrite those edits until every quote is unique. Do not fail the post because a sentence was repeated.
- Each tick loads at most one REST page of posts, then checks the next page.
- The site is not edited. No Neo MCP writes.

## When to read more

Read `references/fact-check-rules.md` only while writing or validating claims.
