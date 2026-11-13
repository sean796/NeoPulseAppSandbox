# Custom Shades of London: Blind Magic blog seed

Cursor / Pulse one-shot: rank Blind Magic GSC blog winners, rewrite for **Custom Shades of London** (London and Exeter, Ontario), publish via Pulse WordPress API.

## Prerequisites

- Local Pulse on `http://127.0.0.1:8080` (`npm run start:local`)
- `PULSE_HOST_API_TOKEN` in repo `.env` (script sends `X-Pulse-Host-Api-Token`)
- WordPress app passwords for Blind Magic and Custom Shades of London in local `teams/1/workspace.json` (`wordpress_sites`), or hub `sites.json` via `loadHubSites`
- OpenRouter key from env, `email-worker-keys.json`, or Manager settings

## Dry run (no WordPress writes)

```powershell
node scripts/custom-shades-of-london/seed-blogs-from-blind-magic.mjs --dry-run
```

## Live (November package: 2 posts)

```powershell
node scripts/custom-shades-of-london/seed-blogs-from-blind-magic.mjs
```

- Post 1: `publish` (near run day)
- Post 2: `future`, about 14 days later still in the same calendar month

Manifest: `test-output/csol-blind-magic-blog-seed-manifest.json`

## Flags

- `--dry-run` — rewrite only, no create-post
- `--limit=2` — default 2
- `--api-base=http://127.0.0.1:8080` — Pulse API base

Does **not** call Custom Shades GSC or Semrush. Does **not** use Neo MCP.
