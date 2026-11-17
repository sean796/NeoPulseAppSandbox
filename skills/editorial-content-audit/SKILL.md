---
name: editorial-content-audit
description: Fact-check auditor for every blog post and service-area page on one Integrations property. Extra effort on location, NAP, phone, and geo claims. Writes errors into one Google Sheet named findings and emails sean@neodigital.ca the same rows as a CSV. Use when Property Skills Run or Auto should audit editorial content for a client profile.
compatibility: Requires Node 20+ from the Neo Pulse repo root, with the local Pulse API reachable. Not a browser script.
metadata:
  author: neo-digital
  version: "1.3"
  assignableId: content.editorial.audit
---

# Editorial Content Audit

Read every published, scheduled, and draft blog post plus every service-area (entity) page for one Integrations site. Act as a **fact-check auditor**: verify buyer-facing claims against the property NAP, with extra effort on location, phone, address, state/province, country, and "we serve / install in" claims across **all** Integrations locations (not only the primary service city). Page audits use the Decision agent model (Gemini 3.8 Flash); the handoff rollup uses Blog. The only Drive file this skill writes is a Google Sheet named findings. It opens in Google Sheets. Rows are errors only. Email sean@neodigital.ca those same rows as a CSV. Findings `problem` / `fix` are short tasks with no "this page/post" stems. Do not edit the site. Do not audit page-sitemap money pages.

## Available scripts

- **`scripts/count.mjs`** — Page counts from inventory JSON (posts + service-area)
- **`scripts/validate-findings.mjs`** — Accept or reject a findings JSON against the schema

## Checklist

Progress:

- [ ] Step 1: Count pages
  ```bash
  node skills/editorial-content-audit/scripts/count.mjs --inventory inventory.json
  ```
- [ ] Step 2: If `pageCount` is 0, stop. Do not email.
- [ ] Step 3: Read `references/audit-rules.md` and audit each page into findings JSON
- [ ] Step 4: Validate
  ```bash
  node skills/editorial-content-audit/scripts/validate-findings.mjs --findings findings.json
  ```
- [ ] Step 5: Property Skills **Run** loads inventory, audits pages on the server, and emails the report

## Output

One Google Sheet named findings in the run folder. The same sheet is rewritten after each audited URL, before the next URL. Every audited page is a row. Pages with errors list those errors. A page with no errors is one row: its page id and `no errors`.

Status stays on audit progress (`Auditing N/total title`). The Drive folder and CSV link live on the run result, not in the step feed.

## Gotchas

- Client profile only (`/dashboard/{slug}`). Do not use the header connected site.
- Posts + entity CPT from the entity sitemap only. Skip page-sitemap, product, Hunter Douglas, promotion, shop-by-room, and location money pages.
- Blind Spot copy uses **Blind Spot**, never Shutter Spot.
- Custom Shades of London uses `service-area`, not `location`.
- Empty inventory: no email. Tasks shows zero pages.
- If a page reply has no findings array, call that page once more. If it still has none, skip that page and continue the audit.
- Each tick loads at most one REST page of posts, then audits the next page. It does not download the whole site before the first audit call. Follow the Output rules above.
- Fact-check auditor: collect every place, phone, address, and serve/install claim on the page, then ground each against the full NAP (`locations` + phones). Prefer those findings over polish.
- Use the full NAP: every location, street, and phone. A listed city is valid on every page. Do not replace one listed city with another.
- Check every phone number against the NAP phone list. Flag wrong state/province/country labels and out-of-area "we serve" cities.
- Do not write price findings. Do not use confirm for price.
- Do not flag the company describing its own showroom, size, or ranking. A missing property field is not a contradiction.
- An out-of-area fix deletes the foreign place names or names one listed city. Never say general terms.
- The site is not edited. No Neo MCP writes.

## When to read more

Read `references/audit-rules.md` only while writing or validating findings.
