# Credential Rotation Status — Northstar SellerOS

## STATUS: WAITING_FOR_OWNER_ROTATION (since 2026-08-03)

Rotation of `DATABASE_URL` and `APP_SECRET` is a platform-console action that the agent cannot perform. **No rotation has been claimed or performed.** Everything below is containment and verification only.

## Incident (P0, contained 2026-08-03)
Live credentials were present in plaintext in garbage trees OUTSIDE the git repository but inside the outer delivery folder (`app-garbage/app2/.env`, `app-garbage/app2/d/.env`). Values are NOT reproduced here.

## Containment (DONE)
- Both `.env` files deleted; all four garbage trees fully deleted (app-garbage, app-junk, app-governance — 735 MB total — plus docs-draft).
- Verified: the shipped source ZIP contains NO `.env`, NO `node_modules`, only `.env.example` (git archive of tracked files only).
- Verified: git history of the delivery repo NEVER contained any `.env` or garbage-tree file.

## What the owner must do (platform console)
1. **Rotate DATABASE_URL** in the platform database console.
2. **Rotate APP_SECRET** (dual-use: Kimi OAuth secret + JWT HS256 signing key). Rotation automatically invalidates ALL pre-rotation sessions — desired.
3. Update the deployment environment and redeploy.
Until these are done the release remains **WAITING_FOR_OWNER_ROTATION** and must not be used for any supervised session.

## Preventive gates now in CI (this release line)
- `scripts/secret-scan.mjs` — blocks private keys, non-placeholder APP_SECRET, non-local DATABASE_URLs, AWS-style keys.
- `scripts/lockfile-host-gate.mjs` — blocks any non-npmjs registry host in the lockfile.
- `scripts/delivery-scan.mjs` — blocks real-world identifiers across the entire delivery, including nested archives.

## Update (2026-08-03, freeze)
Status unchanged: **WAITING_FOR_OWNER_ROTATION**. Owner runbook now in `DEPLOYMENT.md` §3 (rotate DATABASE_URL + APP_SECRET in the platform console, redeploy, verify with `node scripts/smoke.mjs --base <url>` — `/api/readyz` must return ready). Note: the working tree's gitignored `.env` holds the live platform values for the preview runtime; it is untracked and absent from the delivery ZIP (verified 2026-08-03).
