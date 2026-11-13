# Flatten, push, and keep live up to date

This runbook exists so Neo Pulse **never** sits as a huge uncommitted / unpushed tree while Render still shows an old SHA. That lag is stressful and avoidable.

## Why this matters

- Local dirty trees do not change live.
- Render does **not** deploy from every GitHub remote. Production UI and hub deploy from **`app-sandbox`** (`NeoPulseAppSandbox`), branch `main`.
- Canonical product history also lives on **`origin`** (`neodigitalca/neo-pulse`).

If those remotes lag your laptop, the live header SHA (for example `abf91a1`) will not match what you just built.

## Live surfaces

| Surface | URL | Driven by |
|---------|-----|-----------|
| Pulse UI (Render) | https://neo-pulse-static.onrender.com/ | `app-sandbox` `main` → service `neo-pulse-static` |
| Pulse hub API | https://pulse-host-wp-hub.onrender.com | `app-sandbox` `main` → service `pulse-host-wp-hub` |
| Canonical GitHub | https://github.com/neodigitalca/neo-pulse | `origin` `main` |
| Render source repo | https://github.com/sean796/NeoPulseAppSandbox | `app-sandbox` `main` |

**Note:** `https://app.neodigital.ca/` is **not** Neo Pulse today (Lead Connector). Do not use it as the Pulse frontend for OAuth or “is live updated?” checks.

## Flatten checklist (agent or human)

1. `git status -sb`  
   - Intentional product changes must be staged.  
   - Leave out: `.env*`, secrets PHP, `.local-dev-vite.pid`, `scripts/_tmp-*`.

2. If you have multiple local WIP commits on `main` that should be one ship unit:
   ```bash
   git add -A
   git reset HEAD -- .local-dev-vite.pid scripts/_tmp-*   # adjust excludes
   git reset --soft origin/main
   git commit -m "Ship: <one clear summary of the whole change set>."
   ```

3. Push both remotes:
   ```bash
   git push origin main
   git push app-sandbox main
   ```
   If step 2 rewrote commits already on `app-sandbox`:
   ```bash
   git push --force-with-lease app-sandbox main
   ```

4. Confirm:
   ```bash
   git status -sb          # clean of real work
   git rev-parse --short HEAD
   ```
   Then check Render deploys for `neo-pulse-static` and `pulse-host-wp-hub` land on that commit (or wait for autoDeploy).

5. Spot-check live UI: open https://neo-pulse-static.onrender.com/ and confirm the build/header SHA matches HEAD (when the UI shows it).

## Agent rule

Cursor agents must follow [`.cursor/rules/repo-flatten-push-live.mdc`](../.cursor/rules/repo-flatten-push-live.mdc) on every shippable turn: no “done” with a mountain of unpushed files when live was supposed to update.

## Anti-patterns

- Pushing only a small GMB slice to `app-sandbox` while hundreds of other local files stay uncommitted.
- Checking `app.neodigital.ca` and thinking Pulse is stale or wrong.
- Ending a session with `main...origin/main [ahead N]` plus a dirty working tree after the user asked to ship.
- Committing secrets or temp probe scripts “to clear status.”

## Quick recovery if live looks old

1. Confirm which commit Render last deployed (`app-sandbox` / Render dashboard).
2. Confirm local `git rev-parse HEAD` and whether `origin` / `app-sandbox` point at it:  
   `git fetch origin app-sandbox` then compare SHAs.
3. If work exists only locally: run the flatten checklist above immediately.
4. If push succeeded but deploy failed: fix the hub/static deploy error (boot/PHP missing files, build fail), then redeploy. Flattened git alone is not enough if the container crashes.
