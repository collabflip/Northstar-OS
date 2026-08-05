# Gate Table — Northstar SellerOS wave-2 release

**Final commit** `2e6b57914fe27c0db45f95b0e8b11ad7e8efe369` · **ZIP SHA-256** `423cd7d31d026660f57c56ce0e4f111a8c51687040854f18ed0d9b0ab289887a`

All results below were measured by an **independent verifier** from a **brand-new extraction of the shipped ZIP** (no node_modules, no dist at start — confirmed), running on **Node v22.22.0**, 2026-08-03 UTC. Verbatim outputs; nothing rounded.

| # | Command | Result (verbatim key output) | Verdict |
|---|---|---|---|
| 1 | `sha256sum northstar-selleros-source.zip` | `423cd7d3…9887a` — matches manifest byte-for-byte | PASS |
| 2 | fresh unzip to /tmp/verify | `node_modules`=0 dirs, `dist`=0 dirs | PASS |
| 3 | `npm ci` (default) | exit 0, 310 packages | PASS |
| 4 | `npm ci --registry=https://registry.npmjs.org` (clean-room #2) | exit 0; install-log `msh.team`/`npmmirror` hits = **0**; 592 fetches all registry.npmjs.org | PASS |
| 5 | `npm run gate:lockfile` + grep | `lockfile-host gate: clean (707 resolved URLs, hosts: registry.npmjs.org)`; grep msh.team=**0**, npmmirror=**0** | PASS |
| 6 | `node scripts/secret-scan.mjs` | `secret scan: clean (297 tracked files scanned)`, exit 0 | PASS |
| 7 | `node scripts/delivery-scan.mjs /mnt/agents/output` | `delivery scan: clean (329 files scanned, 1 archives inspected)` — **0** banned hits public; `--include-internal`: 67 hits ALL in `internal/` (quarantined, by design) | PASS |
| 8 | `npm run check` (tsc -b) | exit 0 | PASS |
| 9 | `npx tsc --noEmit` | exit 0 | PASS |
| 10 | `npm run lint` | exit 0 — 0 errors, 5 warnings (react-hooks/exhaustive-deps, pre-existing) | PASS |
| 11 | `npm run evals` | `golden scenarios: 131/131 passed (100%)` · `simulator: 85/85 checks passed across 8 conversations` | PASS |
| 12 | `node scripts/ci-migrate-proof.mjs` (fresh DB) | `migrate×2 idempotent; audit proof row survived; tables=33; proof rows cleaned up`, exit 0 | PASS |
| 13 | `db:migrate` + `db:seed` ×2 (fresh DB) | identical counts both runs: contacts 7, consents 10, properties 4, comparables 7, approvals 2, offers 2, workflows 2, outboxSent 2, policyRules 47 | PASS |
| 14 | `npm test` ×2 (third fresh DB, migrated+seeded) | `Test Files 36 passed (36)` · `Tests 252 passed (252)` — **0 failed, 0 skipped**, both runs; `audit.concurrency` stable (no flake) | PASS |
| 15 | `npm run build` | exit 0; `dist/boot.js` 2.6mb + `dist/public/index.html` present | PASS |
| 16 | `npm audit --omit=dev` / `npm audit` (npmjs registry) | production: **found 0 vulnerabilities**; full: 0 high / 0 critical / **6 moderate (dev-only, no upstream fix)** | PASS |
| 17 | CI yaml static check | Node 22.22.0 pin L72; lockfile gate L78-82; migration-proof L100-105; evals L110-111; `db:push` only in prohibition comments | PASS |

## Verifier deviations (environment-level, honestly reported)
- `npm test` requires the full env set + a seeded DB (matching CI's env injection); without it 4 files fail at suite level — expected, not a defect.
- The sandbox mirror does not implement the npm audit endpoint; audits ran against `--registry=https://registry.npmjs.org`.
- secret-scan needs `git ls-files`; the verifier ran a throwaway `git init && git add -A` inside the clean-room (artifact untouched).

## Historical errata (unchanged, mandatory honesty)
- Wave-1 "131/131" claim at `66c5d2b` was wrong (actual 130/131, fixture bug); fixed at `8dacca0`, re-measured at every SHA since.
- Wave-1 GATE_TABLE/CI_STATUS claimed lockfile private-registry count 0 while 6 URLs remained — caught by the external audit, fixed in wave 2 with a CI-blocking gate to prevent recurrence.
- Verifier round 1 ran off-spec (working tree, 5 gates only) — its results were discarded; this table is round 2, full battery.

## Concurrency root cause (user-required — not merely green tests)
`appendWorkflowEvent` allocates workflow-event seqs via **read-max-then-insert** under the `workflow_events_wf_seq` unique index. The read→insert gap is a race window: N concurrent writers read the same max and compute the same next seq; the unique index correctly rejects all but one. The defect was the **retry budget (3)** being mathematically insufficient for the worst case (5-way append → up to 4 collisions per writer); under full-suite load the window widens and the dup-key escaped as an unhandled error (~50% flake). Fix (`2e6b579`): 10 attempts (tolerates 9 collisions) + 5–20ms jittered backoff + max(seq) re-read every attempt; only that specific dup-key error is masked, everything else propagates. **Retries absorb the race; they do not remove it.** The cures — atomic per-workflow sequence allocator (`UPDATE … last_seq+1 … RETURNING`) or transactional `SELECT … FOR UPDATE` allocation — are roadmap items, recorded in `RESIDUAL_RISK.md`.
