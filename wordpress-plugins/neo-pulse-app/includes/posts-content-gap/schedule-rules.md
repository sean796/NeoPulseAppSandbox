# Schedule plan rules

Write exactly one JSON object:

```json
{
  "publishDates": ["YYYY-MM-DD"],
  "publishTime": "HH:MM"
}
```

Rules:

1. `publishDates.length` must equal `gap` from the count JSON.
2. Every date must be unique.
3. Every date must fall inside `month` (`YYYY-MM`).
4. Every date must be on or before `lastAllowedDay`.
5. No date may appear in `occupiedDates`.
6. `publishTime` is 24-hour `HH:MM`. Use `publishTimeHint` from the count JSON unless a different time is clearly better for spacing.

Do not name a package tier. Do not invent a different month. Do not pad or shrink the date list to make validation pass.
