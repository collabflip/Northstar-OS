# Northstar SellerOS — Final Deployment Documentation

**Release:** `northstar-selleros@1.0.0-pilot` · **Freeze tag:** `v1.0.0-pilot`
**Verdict (unchanged, evidence-backed):** Demo Pilot Deployable — suitable only for supervised Ontario testing using unmistakably fictional data (Harbourline Realty seed), human approval gates, and mock integrations. **NOT production-ready** (3/20 agent cores wired; 17 unwired; integrations are mocks).
**Gate:** `WAITING_FOR_OWNER_ROTATION` — see §3. Nothing here claims credentials are rotated, CI is hosted, or the app is published: those are owner actions.

Canonical artifact hashes and commit SHAs are recorded in `release/MANIFEST.md` (outer delivery folder), regenerated whenever artifacts change. This document intentionally does not embed them so it can live under the freeze tag without churn.

---

## 1. What ships

- Production build: `npm run build` → `dist/boot.js` (esbuild bundle; only Node builtins + `mysql2` external) + `dist/public/`.
- Start: `npm start` (`NODE_ENV=production node dist/boot.js`), port from `PORT`.
- Runtime: **Node ≥ 22.22.0**, npm ≥ 10 (`engines`; react-router 8.3.0 requirement).
- Database: MySQL 8-compatible; the intended platform database is TiDB (validated on TiDB v8.5.3-serverless — §4).
- Reusable smoke battery: `node scripts/smoke.mjs --base <url>` (committed this release; no dependencies).

## 2. Prerequisites

1. Node ≥ 22.22.0 (`node --version`).
2. A MySQL 8-compatible database (TiDB on the target platform).
3. Platform environment variables: `DATABASE_URL`, `APP_ID`, `APP_SECRET`, `KIMI_CLIENT_ID`/`KIMI_CLIENT_SECRET` (or platform-injected OAuth), `KIMI_AUTH_URL`, `KIMI_OPEN_URL`, `KIMI_REDIRECT_URI`. See `.env.example` — it is complete and current.
4. `npm ci` (lockfile is public-registry-only; `npm run gate:lockfile` proves it).

## 3. Owner credential rotation — REQUIRED-EXTERNAL (owner action)

Status: **WAITING_FOR_OWNER_ROTATION**. The agent cannot perform this: rotation happens in the owner’s platform console. Do not paste credential values into chat, tickets, docs, or git.

1. In the platform console, rotate **DATABASE_URL** (database user/password) for the provisioned TiDB instance.
2. Generate a new **APP_SECRET** locally (owner’s own terminal): `openssl rand -hex 32`. Never transmit it; paste only into the platform console’s secret field.
3. Update both values in the platform environment configuration.
4. Redeploy/restart (platform action), then verify: `node scripts/smoke.mjs --base <url>` — `/api/readyz` must return `{"status":"ready"}` (proves the server reaches the DB with the new URL).
5. Only after this succeeds may the release status move off `WAITING_FOR_OWNER_ROTATION` (owner updates `release/ROTATION_STATUS.md`).

## 4. Hosted database validation — record (2026-08-03, post-freeze-candidate)

Validated against the **actual provisioned platform database** (TiDB `8.0.11-TiDB-v8.5.3-serverless`, port 4000):

1. **Finding:** all 33 tables existed but `__drizzle_migrations` was **empty** — schema had been created out-of-band (push-style), so `npm run db:migrate` failed with `Table 'approvals' already exists` (42S01). Left unrepaired, the first future migration would have collided on the deployment target.
2. **Drift check before any repair** (evidence that journaling hides nothing): all 7 named UNIQUE constraints present with identical columns (incl. `audit_tenant_seq(tenantId,seq)`, `workflow_events_wf_seq(workflowId,seq)`); FK count 60 = 60 in `db/migrations/0000_init.sql`; PRIMARY KEY on all 33 tables; column counts spot-checked (`audit_log` 15, `workflow_events` 7) match the DDL.
3. **Repair (baseline journaling):** inserted exactly one journal row — `hash = sha256(0000_init.sql)` = `d7e714dbc440…f610`, `created_at = 1785716123698` (journal `when`) — precisely the row drizzle-orm’s migrator writes (verified against `node_modules/drizzle-orm/mysql-core/dialect.js`).
4. **Proof after repair:** `npm run db:migrate` → exit 0 no-op; `node scripts/ci-migrate-proof.mjs` → **OK: migrate×2 idempotent; audit proof row survived; tables=33; proof rows cleaned up** (verified 0 leftover rows).
5. Live fictional seed state at validation time: 1 tenant, 4 users, 6 audit rows, 2 outbox rows (Harbourline Realty demo data only).

**Prohibition (unchanged):** never run `npm run db:push` against the platform database — it is not idempotent on existing TiDB schemas and can prompt to truncate `audit_log`. The schema source is `db/migrations` via `npm run db:migrate`.

## 5. Hosted CI stand-up — owner steps (workflow is turnkey)

The workflow `.github/workflows/ci.yml` is complete and validated (YAML parse-checked; all 14 steps; every referenced script present; triggers on push/PR to `main`, `master`, `final-build`, `release-*`). It needs **no secrets**: every env value is an obviously-fake test constant and the database is an ephemeral `mysql:8` service container.

Owner actions (require the owner’s git-hosting account — the agent cannot do these):

1. Create a private repository on the owner’s git host (e.g. GitHub).
2. `git remote add origin <repo-url>` then `git push -u origin master --tags`.
3. Open the Actions tab: the `ci` workflow runs automatically on the push.
4. Expected gates (in order): install → lockfile-host gate → secret scan → fictional-data gate → typecheck ×2 → lint → migration proof (`ci-migrate-proof` on ephemeral mysql:8) → tests (253) → evals (131 golden + 85 simulator) → build → `npm audit --omit=dev --audit-level=high`.
5. Honest coverage note: CI validates migrations on `mysql:8`; TiDB-specific validation was performed separately against the real platform database (§4). If TiDB-specific features are ever adopted, swap the CI service image (flagged in the workflow comments).

Status until the push exists: **PENDING (owner action)** — see `release/CI_STATUS.md`.

## 6. Publish and post-publish smoke

Publishing is the owner’s manual platform action (「发布」button). The agent never publishes.

After publishing:

1. Run the committed smoke battery against the published URL:
   `node scripts/smoke.mjs --base https://<published-url>`
   Expected: **7/7 PASS** — app shell 200, tRPC ping, `/api/livez`, `/api/readyz` (live DB), unauthenticated 401, 404 route, OAuth 302 → authorize URL.
2. The DB-backed battery items (tenant isolation, blocked-CASL demo, approval single-use, audit-chain verify, migrate/seed idempotency, restart stability) are pre-publish gates — evidence in `release/SMOKE_RESULTS.md` (14/14 at wave-2 + deployment-target addendum this release).
3. First-login check: sign in with Kimi OAuth, confirm the Harbourline Realty demo tenant loads and the blocked-CASL banner/demo behaves as documented.

## 7. Rollback

- Code: every release state is a git tag/SHA. Redeploy the previous tag via the platform console (or `git checkout v1.0.0-pilot && npm ci && npm run build`).
- Database: `0000_init` is additive-only; there is **no down-migration**. Rollback means pointing the app at the pre-release database state (platform snapshot/backup) — treat DB snapshots as an owner console responsibility. Do not hand-write down-migrations against the live audit chain.

## 8. Freeze record

- Freeze tag `v1.0.0-pilot` (annotated) on the release commit; gate state at freeze: **253/253 tests ×2**, **131/131 + 85/85 evals**, typecheck + lint clean, secret scan / fictional-data gate / lockfile-host gate / whole-delivery scan clean, 0 prod vulnerabilities (`release/DEP_AUDIT.txt`), 7/7 deployment-target smoke.
- Canonical ZIP + SHA-256: `release/northstar-selleros-source.zip`, hash in `release/SHA256SUMS.txt` and `release/MANIFEST.md`.

## 9. Go / No-Go checklist

| # | Item | State |
|---|---|---|
| 1 | Owner rotated DATABASE_URL + APP_SECRET (§3) | ☐ WAITING_FOR_OWNER_ROTATION |
| 2 | Hosted DB validated on platform TiDB (§4) | ☑ Done 2026-08-03 (journal repaired; migrate×2 proof) |
| 3 | Hosted CI green on owner’s git host (§5) | ☐ PENDING owner push (workflow turnkey) |
| 4 | Post-publish smoke 7/7 (§6) | ☐ After owner publishes (7/7 pre-publish on deployment-target runtime) |
| 5 | Release frozen + tagged (§8) | ☑ `v1.0.0-pilot` |
| 6 | This documentation | ☑ |

Residual risks (retry-hardened seq allocation absorbs — does not remove — the race window; permanent atomic allocator on roadmap; 17/20 cores unwired; mocks not live): `release/RESIDUAL_RISK.md`.
