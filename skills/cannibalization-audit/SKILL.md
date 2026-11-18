---
name: cannibalization-audit
description: >-
  Ask that site's Neo MCP which published /blog/ posts and service-area pages
  should redirect and which one URL each group keeps, then write one Pulse Redirect
  workbook with two tabs from that answer.
  Suggests only. Does not apply 301s until the user accepts. Use for cannibalization
  audit, redirect map, content cull, or topic consolidation.
compatibility: Requires that site's Neo MCP. Not a browser script.
metadata:
  author: neo-digital
  version: "1.5"
  assignableId: content.blog.cannibalization-audit
---

# Cannibalization Audit

## Steps

1. Ask that site's Neo MCP which published `/blog/` posts should be redirected, and which one URL each group keeps.
2. Ask the same for published `service-area` pages, but only as junk cleanup: 0-click junk or same-place duplicates. Do not fold real cities, towns, or neighborhoods into one page.
3. Write one Google Sheet named `Pulse Redirect` with two tabs: `Blog` and `Service Areas`.
4. Stop. Do not apply 301s.

## Sheet

`id,source,matching,destination,type,category,status,ignore`

- `source` = `blog/old-slug/` or the service-area path
- `destination` = full keeper URL
- `matching` = `exact`
- `type` = `301`
- `status` = `active`
- `category` and `ignore` blank

## Rules

- One workbook: tab `Blog`, tab `Service Areas`. Same columns on both.
- Neo MCP's answer is the only source of rows.
- Blog: one keeper per similar intent. Service areas: junk cleanup only (0-click junk or same-place duplicates). Never merge different places.
- The destination is the highest-click URL in the group (Search Console, last 90 days). Never redirect a stronger page to a weaker one.
- Never self-redirect. Keepers are destinations only; they never appear in the source column.
- If Neo MCP returns nothing, stop. Do not invent pairs.
- Suggest only until the user accepts.
