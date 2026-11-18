# Redirect map rules

1. Ask that site's Neo MCP which published `/blog/` posts should redirect, and which one URL each group keeps.
2. Ask the same for published `service-area` pages as junk cleanup only: 0-click junk or same-place duplicates. Do not fold real cities, towns, or neighborhoods into one page.
3. Write one Google Sheet named `Pulse Redirect` with tabs `Blog` and `Service Areas`.
4. Stop. Do not apply 301s.

Sheet columns: `id,source,matching,destination,type,category,status,ignore`

- `source` is `blog/old-slug/` or the service-area path (no leading slash, trailing slash)
- `destination` is the full keeper URL (highest Search Console clicks in the group)
- `matching` is `exact`
- `type` is `301`
- `status` is `active`
- `category` and `ignore` are blank

Neo MCP's answer is the only source of rows. Blog: one keeper per similar intent. Service areas: junk cleanup only, never merge different places. No chains. Do not invent pairs. Never redirect a higher-click URL to a lower-click URL. Never self-redirect: keepers are destinations only and never appear in source.
