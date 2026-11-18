# Live prompt rewrite rules

`livePrompt` is the standing instruction injected into content actions that already carry the word blacklist.

## Shape

- One readable block of current post-writing rules.
- Every rule cites a `sourceUrl` and the archive entry `date` that introduced it.
- No rule without an archive item that already stores that `sourceUrl`.
- No em dash.
- No invented Google updates.

## When to rewrite

- Rewrite only when the newest dated entry has a non-empty `items` array.
- If `items` is empty, leave the previous `livePrompt` unchanged.

## Extract output (OpenRouter)

```json
{
  "title": "short search title",
  "items": [
    {
      "publishedAt": "YYYY-MM-DD",
      "title": "official title",
      "sourceUrl": "https://...",
      "whatChanged": "one sentence",
      "postRule": "one standing rule for how posts should be written"
    }
  ]
}
```

`items` may be `[]`. The model must not output archive `id` or `date`.

## Rewrite output (OpenRouter)

```json
{
  "livePrompt": "standing post rules with sources and dates"
}
```
