# Release Manifest — Northstar SellerOS (FROZEN — tag `v1.0.0-pilot`)

- **Freeze tag**: `v1.0.0-pilot` (annotated) on commit `c63286ad5896bd83da54b4f386461cb4437a6bce` (branch `master` = `final-build`)
- **Source ZIP**: `northstar-selleros-source.zip` (built via `git archive` of tag `v1.0.0-pilot` — tracked files only)
- **SHA-256**: `fc1cabe9ba7756f61181cfbb383cc0989f904d458bdcde78e98f3d4bc51601da`
- **Package identity**: `northstar-selleros@1.0.0-pilot` (private) · **Runtime**: Node.js ≥ 22.22.0
- **Credential status**: **WAITING_FOR_OWNER_ROTATION** — see `ROTATION_STATUS.md`; do not use for any supervised session until the owner rotates `DATABASE_URL` and `APP_SECRET` in the platform console.
- **Guaranteed absent from the ZIP**: `.env` (only `.env.example`), secrets, `node_modules`, `dist`, garbage trees, duplicate source trees — verified by entry listing (0 banned entries).
- **Private-registry count in lockfile**: **0** (CI-blocking `scripts/lockfile-host-gate.mjs`: 707 resolved URLs, all registry.npmjs.org).
- **Whole-package banned-token count (public delivery scan incl. nested ZIP)**: **0** (`scripts/delivery-scan.mjs`); contaminated historical evidence is quarantined under `internal/` (FINAL_GIT_DIFF.txt, design/ drafts, info.md) and excluded from the public delivery by design.
- Previous ZIPs (`768f1f49…`, `70434ba8…`, `423cd7d3…`, `a07ef534…`) are SUPERSEDED. Freeze delta over `a07ef534…`: final deployment documentation (`DEPLOYMENT.md`), committed reusable smoke battery (`scripts/smoke.mjs`, proven 7/7 against the platform-TiDB-backed runtime), and removal of `race-stress.ts` (scratch stress harness that leaked into `4e1414b`'s tracked tree and the `a07ef534…` ZIP; deleted at freeze).
- **Hosted-DB validation (2026-08-03)**: provisioned platform database = TiDB `8.0.11-TiDB-v8.5.3-serverless`; schema drift check clean vs `0000_init.sql` (7/7 unique constraints, 60/60 FKs, 33/33 PKs); empty drizzle journal repaired via baseline row (`hash d7e714dbc440…f610`, `created_at 1785716123698`); `db:migrate` no-op exit 0; `ci-migrate-proof` green (migrate ×2 idempotent, audit-row survival, cleanup verified). Details: `DEPLOYMENT.md` §4.

## Release contents
| Path | What |
|---|---|
| `release/northstar-selleros-source.zip` | canonical portable source tree (root `northstar-selleros/`) |
| `release/SHA256SUMS.txt` | SHA-256 of the ZIP |
| `release/MANIFEST.md` | this file |
| `release/ZERO_SECRET_SCAN.txt` | secret-scan output |
| `release/FICTIONAL_DATA_SCAN.txt` | fictional-data gate output |
| `release/ROTATION_STATUS.md` | WAITING_FOR_OWNER_ROTATION — incident + containment + owner actions |
| `release/GATE_TABLE.md` | exact gate outputs from the independent verifier (regenerated after verification) |
| `release/DEP_AUDIT.txt` | dependency audits |
| `release/CI_STATUS.md` | hosted CI = honest PENDING + workflow state + local proofs |
| `release/SMOKE_RESULTS.md` | 14-item staging smoke battery (regenerated after verification) |
| `release/RESIDUAL_RISK.md` | wave-2 dispositions + standing residuals |
| `DEPLOYMENT.md` (in ZIP, repo root) | final deployment documentation: rotation runbook, hosted-DB validation record, CI stand-up, publish + post-publish smoke, rollback, go/no-go |
| `HANDOFF.md` (outer) | truthful public handoff (rewritten; no "production-grade") |
| `redteam/` (outer) | 12 red-team reports + errata; contaminated items withheld to `internal/` |

## Verdict
**Demo Pilot Deployable — suitable only for supervised Ontario testing using unmistakably fictional data, human approval gates and mock integrations — GATED: WAITING_FOR_OWNER_ROTATION. Not production-ready.**

## Platform version
- **Version ID**: `ea827eb` (saved 2026-08-03 on the frozen tree; preview via the conversation version card). The version tool adds an empty administrative commit on top of `c63286a` — zero content delta; the freeze tag `v1.0.0-pilot` points at `c63286a`.
- Publishing remains the owner's manual action (「发布」button) — preview only; nothing is published or deployed.
