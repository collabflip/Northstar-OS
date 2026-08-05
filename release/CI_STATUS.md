# CI Status — honest report

**Hosted CI URL: PENDING — external blocker, not a code defect.** No git remote (GitHub/GitLab) is attached to this repository in this environment, so no pipeline run URL exists. Claiming one would be fabrication. To activate: push to any GitHub remote — the workflow runs as-is.

## Workflow state (`.github/workflows/ci.yml`, release SHA `f3e19ac`)
The independent audit's three CI defects are fixed:
- **Node baseline**: `setup-node` pins `22.22.0` (react-router 8.3.0 engines require >=22.22.0).
- **Evals added**: `npm run evals` runs as a CI step after tests.
- **db:push removed**: replaced by `migration proof` (`node scripts/ci-migrate-proof.mjs`) — migrate ×2 on the CI service DB with an inserted audit_log row proven to survive the second run. db:push is prohibited in CI (TiDB truncate-prompt hazard).
- Plus: `lockfile-host gate` step after `npm ci`; secret scan; fictional-data gate; `npm run check`; `tsc --noEmit`; lint; full `npm test` (no DB-suite skipping exists in the tests); build; `npm audit --omit=dev --audit-level=high`. mysql:8 service with health checks; all env values obviously test-only.

## Local proof executed (in lieu of hosted CI)
- `scripts/ci-migrate-proof.mjs` on a fresh TiDB database, executed on real Node v22.22.0: migrate#1 exit 0 → proof tenant+audit row inserted → migrate#2 exit 0 (no-op) → audit row survived, table count stable at 33 → rows cleaned up → exit 0.
- `npm run evals` on Node v22.22.0: golden 131/131, simulator 85/85.
- Full clean-room battery (npm ci through 14/14 smoke): see `release/GATE_TABLE.md` and `release/SMOKE_RESULTS.md` — executed by an independent verifier against the shipped ZIP, not a git checkout.

## Known platform caveat
CI uses `mysql:8`; production targets TiDB 8.5. No TiDB-specific features are used today — if adopted, the service image must change. `npm audit` requires the official registry (sandbox mirrors do not implement the audit endpoint).

## Update (2026-08-03, freeze)
Workflow re-validated for hosted stand-up: YAML parse-checked, 14 steps, all referenced scripts present, triggers on push/PR to `main`/`master`/`final-build`/`release-*`. **Still PENDING owner push** — standing up hosted CI requires the owner's git-hosting account (DEPLOYMENT.md §5). Additionally: migrations are now validated on the real platform TiDB as well (DEPLOYMENT.md §4), closing the mysql:8-vs-TiDB caveat for this release.
