# Residual Risk Report — Northstar SellerOS release `f3e19ac` (2026-08-03)

Appends to `redteam/12_FINAL_SCORE.md` errata. Historical findings preserved; this is the current truth after the independent-audit remediation (wave 2).

## Wave-2 audit findings → disposition (6 blockers)

| # | Audit finding | Disposition |
|---|---|---|
| 1 | package-lock.json had 6 `npm.mirrors.msh.team` resolved URLs despite claims of zero | FIXED — all 6 normalized to registry.npmjs.org (host swap only; versions/integrity untouched, tarball sha512 verified); new CI-blocking `scripts/lockfile-host-gate.mjs` (707 resolved URLs, allowlist npmjs-only); clean-room `npm ci --registry=https://registry.npmjs.org` exit 0 with 0 mirror references |
| 2 | Outer delivery had 15 banned identifier matches (HANDOFF.md, 12_FINAL_SCORE.md, FINAL_GIT_DIFF.txt) + 56 more found in design/ | FIXED — 12_FINAL_SCORE.md redacted (errata noted); FINAL_GIT_DIFF.txt quarantined to `internal/` (withheld note left); design/ (17 pre-decontamination drafts, unreferenced by current code) quarantined to `internal/design/`; new `scripts/delivery-scan.mjs` scans the whole delivery incl. nested archives — public scan: **0 hits** |
| 3 | HANDOFF.md stale, claimed "production-grade" | FIXED — rewritten as truthful public handoff: supervised Ontario fictional-data demo pilot, mock integrations, 3/20 agents wired / 17 unwired declared, explicitly not production-ready, WAITING_FOR_OWNER_ROTATION |
| 4 | Credential rotation outstanding | UNCHANGED — **WAITING_FOR_OWNER_ROTATION**; platform-console action; not claimed |
| 5 | CI omitted evals, used db:push, ran Node 20 | FIXED — evals step added; db:push replaced by committed-migration proof (migrate ×2 + audit-row survival, proven on Node 22.22.0); CI pins Node 22.22.0; package.json engines >=22.22.0; docs updated |
| 6 | No hosted CI run proving DB-backed tests from clean checkout | EXTERNAL BLOCKER — no git remote exists in this environment; honest PENDING. Mitigation: independent verifier ran the full battery from a brand-new extraction of the shipped ZIP (see GATE_TABLE.md / SMOKE_RESULTS.md) |

## Standing residuals (unchanged in substance)
- R1 rotation (external) — see above.
- R2 audit-chain tail truncation not detected (row tamper IS detected) — roadmap.
- R3 6 moderate npm audit findings, dev-only, no upstream fix; production audit = 0.
- R4 DB-7 test-infra flake (loud, retry passes).
- R5 db:push TiDB prompt hazard — mitigated (CI now uses committed migrations; docs warnings).
- R6 retention/suppression manual cadence (RB-6) — roadmap.
- R7 17/20 agent cores unwired — declared, by design for the pilot slice.
- R8 Node baseline raised to >=22.22.0 (was: react-router engines warning) — RESOLVED by wave 2.
- R9 hosted CI URL — honest PENDING (external).

## Verdict
**Demo Pilot Deployable — suitable only for supervised Ontario testing using unmistakably fictional data, human approval gates and mock integrations — GATED: WAITING_FOR_OWNER_ROTATION of DATABASE_URL and APP_SECRET. Not production-ready.**

## Addendum — concurrency root-cause analysis (verifier finding, fixed at `2e6b579`)

**Finding (independent verifier):** `api/audit.concurrency.test.ts` flaked ~50% under full-suite parallel load (4 runs: fail/pass/fail/pass), always `ER_DUP_ENTRY` on `workflow_events.workflow_events_wf_seq`; 4/4 stable when run alone.

**Root cause (not just symptoms):** `appendWorkflowEvent` allocates an event sequence number via **read-max-then-insert** (`SELECT max(seq) … INSERT seq+1`) guarded by the unique index `workflow_events_wf_seq`. Between the read and the insert there is a **race window**: N concurrent writers can all read the same max and compute the same next seq; the unique index correctly rejects all but one. Rejection is the database doing its job — the defect was in the **retry budget**: only 3 attempts, while 5 concurrent appends can force a single writer to collide up to 4 times before winning a seq. Under full-suite load the latency window widens (shared DB, parallel vitest workers), so collisions exceeded the budget and the dup-key error escaped as an unhandled rejection — violating the function's own contract comment.

**Why retries are a mitigation, not a cure:** raising the budget (3 → 10 attempts, tolerating 9 collisions, with 5–20ms jittered backoff and max(seq) re-read inside every attempt) makes the escape practically unreachable and de-synchronizes competing writers — but the underlying race window still exists. The complete cures are roadmap items: (a) an atomic per-workflow sequence allocator (single-row `UPDATE … SET last_seq = last_seq + 1 … RETURNING` — the DB serializes increments, no collision possible), or (b) transactional seq allocation with `SELECT … FOR UPDATE` on the workflow row. Either removes the window instead of absorbing it.

**Evidence the mitigation holds:** 4 consecutive full-suite runs 252/252 + 4 single-file runs 4/4 (8/8 total, zero flakes) at `7b23ccd`, independently reproducible. **The race-window note supersedes the old "DB-7 flake" residual (R4)**: the unhandled-error escape is fixed; the architectural race window is documented above as the honest residual with its two cures.

## Addendum 2 — appendAudit race (High-1 from the final review) FIXED at `4e1414b`

The final-release review's High-1 finding was independently reproduced from a clean checkout (fresh DB, 5-way concurrent appends × 80 rounds): **before = 241 ok / 159 dup-key escapes / 400 (39.8% audit rows lost)**; the 3-attempt budget was mathematically insufficient (up to 4 collisions per writer). Fix mirrors `2e6b579` exactly (10 attempts + 5–20ms jitter + tip re-read per attempt; only ER_DUP_ENTRY masked). **After = 400/400, 0 escapes, chain complete (distinct seq 1–400, no gaps).** Regression test added (`api/audit.concurrency.test.ts`: 5-way concurrent audit appends all land + chain verifies). Full battery after fix: 253/253 tests (2 consecutive runs), evals 131/131 + 85/85, build OK, gates clean. The architectural race window remains absorbed-not-removed — permanent cures stay on the roadmap (atomic per-tenant seq allocator / FOR UPDATE allocation). No remaining High blockers; rotation remains WAITING_FOR_OWNER_ROTATION.
