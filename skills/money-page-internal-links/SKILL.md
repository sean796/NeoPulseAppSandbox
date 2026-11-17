---
name: money-page-internal-links
description: Pulls GSC-ranked product money pages, plans top-down AISEO internal links from those money pages to supporting blogs and related money pages, applies via Neo MCP, and emails sean@neodigital.ca.
compatibility: Requires Node 20+ from the Neo Pulse repo root. Neo MCP on the site for apply. Not a browser script.
metadata:
  author: neo-digital
  version: "2.1"
  assignableId: content.internal-links.money-pages
---

# Money Page Internal Links

1. Find a money page that is a product or service and already has enough body text.
2. Use that body text as the context to choose one outgoing target URL (a post or related page).
3. Pick 2-5 words already in that body text as the anchor. Neo MCP inserts the link there.
4. Keep applying across money pages until at least 5 linked rows are confirmed (target 10). Then email sean@neodigital.ca with the sheet.

## Neo MCP insert checklist

Do these in order:

- [ ] Resolve the WordPress post for the money page URL.
- [ ] Read body text Neo MCP can edit. Skip the page if there is not enough body text.
- [ ] From that body text, choose one target URL from the candidate list. The text chooses the link.
- [ ] Wrap 2-5 words already in that text with `<a href="that target">`. Save and clear caches.
- [ ] Confirm the page output has that exact `<a href>`. Sheet fields come from that confirmed link.

## Available scripts

- **`scripts/count.mjs`** — Money page count from inventory JSON
- **`scripts/validate-plan.mjs`** — Accept or reject a link plan against inventory JSON
- **`scripts/execute.mjs`** — Dry-run preview or confirm handoff to hub execute

## Checklist

Progress:

- [ ] Step 1: Count money pages
  ```bash
  node skills/money-page-internal-links/scripts/count.mjs --site-id SITE_ID --inventory inventory.json
  ```
- [ ] Step 2: If `goalMet` is true, stop.
- [ ] Step 3: Read `references/aiseo-internal-link-rules.md` and write `link-plan.json`
- [ ] Step 4: Validate
  ```bash
  node skills/money-page-internal-links/scripts/validate-plan.mjs --inventory inventory.json --plan link-plan.json
  ```
- [ ] Step 5: Apply via hub **Property Skills Run** (Neo MCP).

## Gotchas

- Direction is money page → support URL (top-down).
- Never use service-area / SAP URLs as destinations.
- Neo MCP is required on the site for apply.
- Money pages are product and service pages only. The keyword drives the brainstorm.
- The target may be a blog post or another page that fits the keyword.
- `anchorHint` is the GSC keyword. `targetUrl`, `anchorText`, and `snippet` come from the stored link after the write.
- Email only after at least one confirmed apply.
- Custom Shades of London is blocked until Neo MCP is approved for that property.
