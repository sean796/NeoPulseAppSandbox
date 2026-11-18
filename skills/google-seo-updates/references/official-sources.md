# Official Google sources

Only Google Search Central / Search status URLs may feed an archive entry.

## How discovery works

1. **OpenRouter online** (`openai/gpt-6-sol:online`) searches the live web.
2. Start from `https://developers.google.com/search/blog` and `https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history`.
3. Open official article pages on `developers.google.com/search/` or `status.search.google.com`.
4. Return those URLs in `sourcesChecked` and any new major changes in `items`. Do not use third-party SEO recap sites.

Do not use DataForSEO. Do not use the dead RSS URL `https://developers.google.com/search/blog/rss.xml`.

## Rules

- Run discovery on every search (Monday cron and Generate).
- Keep only major SEO changes that change how a post should be written (indexing, ranking systems, structured data for posts, content quality guidance that affects blog or SAP copy).
- Drop product UI announcements, Search Console feature notes, and ads news unless they change post writing rules.
- Every kept item must cite a real official `sourceUrl` the model opened.
- Source URLs already stored on an older archive entry must not appear again in the new entry.
