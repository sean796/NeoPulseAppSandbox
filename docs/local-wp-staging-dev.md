# Local WP Staging dev (neopulse.local)

**Full branching runbook (local → Git → neodigital.ca → clients):** [deploy-local-branching-pathway.md](deploy-local-branching-pathway.md)

**Canonical checkout:** `b:\Neo Pulse\pulse` (GitHub: [neodigitalca/Google-Ads](https://github.com/neodigitalca/Google-Ads)). Do not run Vite from a second clone (e.g. `B:\Neo Pulse\Google-Ads-main`) on port 8080.

Use WP Staging Desktop as an **offline demo stack** while editing NEO Pulse. When updates are ready, push to production with the existing neodigital deploy pipeline.

## Architecture

| Layer | Local | Production |
|-------|-------|------------|
| React UI | Vite dev `http://localhost:8080` | `https://neodigital.ca/app/` |
| API (`/api/*`) | `https://neopulse.local` (proxied by Vite) | `https://neodigital.ca` |
| WordPress plugins | Junctioned from repo into WP Staging | SFTP via `deploy:neodigital-app` |

Repo edits under `wordpress-plugins/neo-pulse-wp` and `wordpress-plugins/neo-pulse-app` sync into the local site via directory junctions.

## Prerequisites

1. **Docker Desktop** running
2. **WP Staging Desktop** site `neopulse.local` created and containers up
3. Repo root **`.env`** with API keys (OpenRouter, DataForSEO, Semrush, etc.)
4. **SFTP config** for production deploy only: `wordpress-plugins/flowbie-wpengine.config.json` (not needed for local dev)

## One-time setup

From repo root:

```powershell
npm run setup:local-wp
```

This will:

1. Fix Windows hosts (`127.3.2.1 neopulse.local`) via UAC prompt
2. Write `neo-pulse-wp/.env` and `neo-pulse-app-secrets.php` from repo `.env`
3. Junction repo plugins into WP Staging `www/wp-content/plugins/`

If paths differ on your machine, copy and edit:

```powershell
copy scripts\local-wp-staging.config.example.json scripts\local-wp-staging.config.json
```

Then activate plugins:

1. Open **https://neopulse.local/wp-admin/**
2. Plugins → activate **NEO Pulse WP** and **NEO Pulse App**

Bootstrap the API (first run only):

```powershell
curl.exe -k -X POST https://neopulse.local/api/auth/setup-admin `
  -H "Content-Type: application/json" `
  -d "{\"email\":\"admin@neopulse.local\",\"password\":\"your-local-password\",\"displayName\":\"Local Admin\",\"teamName\":\"Local Demo\"}"
```

## Daily dev loop

**One local entry (Docker + WordPress + a single Vite dev server):** run **`start-neopulse-local.bat`** from the repo root (same as `npm run start:local` / `npm run launch:local`).

After one-time `npm run setup:local-wp`, **`npm run dev`** uses the same orchestrator (`scripts/dev.cjs`) as the bat file’s Vite step. Do **not** run raw `npx vite` or a second Vite on port 8080.

Open **http://localhost:8080**. Do **not** use WP Admin → **NEO Pulse App** for the UI (that iframe targets `/neo-pulse/` on local WP, which has no built SPA). Vite always proxies `/api` to **neopulse.local** in dev (never production).

Edit React in `src/` or PHP in `wordpress-plugins/` and refresh. Plugin changes apply immediately when junctions reach the Docker webroot (see [deploy-local-branching-pathway.md](deploy-local-branching-pathway.md) if plugins are missing in the container).

To re-sync secrets or plugins after `.env` changes:

```powershell
npm run sync:local-wp
```

Startup verifies `http://127.0.0.1:8080/__neo-pulse/dev-meta.json` matches this repo path.

## Push to production

Follow the production section in [deploy-local-branching-pathway.md](deploy-local-branching-pathway.md) and [deploy-neo-pulse.md](deploy-neo-pulse.md):

```powershell
git add -A
git reset -- wordpress-plugins/.deploy/*.zip wordpress-plugins/*.zip
git commit -m "Deploy: short summary"
git push origin main

npm run deploy:neodigital-app
npm run smoke:neo-pulse
```

Client-site plugin deploy (`neo-pulse-wp` to WP Engine clients) stays separate:

```powershell
npm run deploy:wp-staging
npm run deploy:wp-clients
```

## npm scripts

| Script | Purpose |
|--------|---------|
| `start:local` | Docker + neopulse.local + Vite (:8080) |
| `launch:local` | Same as `start:local`, opens browser |
| `setup:local-wp` | One-time hosts + secrets + plugin sync |
| `sync:local-wp` | Re-sync plugins and regenerate secrets |
| `dev` / `start` | Vite via `scripts/dev.cjs` (`/api` → `neopulse.local`) |
| `generate:local-app-secrets` | Regenerate app plugin secrets only |
| `setup:local-dominator` | Local Dominator env, secrets paths, recipe check |
| `setup:local-dominator:smoke` | Same plus Advance Blinds grid export smoke test |
| `deploy:neodigital-app` | Ship SPA + app plugin to neodigital.ca |

## Local Dominator grid export (Research automation)

Forge **Research** runs `POST /api/local-dominator/export-grid`, which spawns Node + Puppeteer on the **WordPress host** (same requirement as the Google Maps screenshot scraper).

Local staging:

1. Run `npm run setup:local-dominator` (creates `.env.localdominator`, wires Node export paths into app secrets).
2. Edit `.env.localdominator` with your Local Dominator login.
3. Run `npm run sync:local-wp` so the **Research** recipe (25 total) is copied into the WP container.
4. Optional CLI smoke test: `npm run setup:local-dominator:smoke` or `npm run localdominator:export:json`.
5. Install the **Local Dominator grid export** recipe via Assist or the automation recipes API, run it, then confirm the CSV deliverable on the agent run.

If Node/Puppeteer is unavailable inside the WP container, the API returns `LD_EXPORT_EXEC_BLOCKED`.

## Troubleshooting

### HTTPS Endpoint red in WP Staging Desktop

Often a false alarm. Nginx rejects TLS without the correct hostname. Test in a browser: **https://neopulse.local/** should load.

### Connection refused on neopulse.local

Check hosts file has:

```
127.3.2.1 neopulse.local
127.3.2.1 adminer.neopulse.local
```

Re-run `npm run setup:local-wp` or `scripts/fix-wp-staging-hosts.ps1` as Administrator.

### Plugin folder exists but is not a junction

Remove the copied folder under `wp-content/plugins/neo-pulse-wp` (or `-app`), then:

```powershell
npm run sync:local-wp
```

Or force robocopy mirror:

```powershell
powershell -File scripts/sync-local-wp-plugins.ps1 -ForceRobocopy
```

### API 401 / session cookies

Local dev uses `http://localhost:8080` proxying to HTTPS WordPress. Vite rewrites cookie domain to `localhost`. Clear site cookies and log in again via the app. If login throws "Something went wrong", clear Local Storage key `neo-pulse_device_auth` for `localhost:8080`.

### Login uses wrong backend / 429 on auth

You are not on this repo’s dev server, or port 8080 is serving another checkout. Run **`start-neopulse-local.bat`**, confirm terminal shows `NEO Pulse dev root: ...\pulse`, and check `__neo-pulse/dev-meta.json`. Retire duplicate folders such as `Google-Ads-main` so nothing else binds to 8080.

### Self-signed certificate warnings

Expected for `neopulse.local`. Accept once in the browser or use `-k` with curl.

## Related files

- [deploy-local-branching-pathway.md](deploy-local-branching-pathway.md)
- [deploy-neo-pulse.md](deploy-neo-pulse.md)
- [`scripts/local-wp-staging.config.example.json`](../scripts/local-wp-staging.config.example.json)
- [`scripts/sync-local-wp-plugins.ps1`](../scripts/sync-local-wp-plugins.ps1)
- [`scripts/setup-local-wp.ps1`](../scripts/setup-local-wp.ps1)
- [`scripts/generate-local-app-secrets.mjs`](../scripts/generate-local-app-secrets.mjs)
- [`vite.config.ts`](../vite.config.ts) (reads `VITE_LOCAL_API_TARGET`)
