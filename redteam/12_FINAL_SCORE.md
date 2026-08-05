# 12 — Final Score

**Commit:** `66c5d2b` (version b9c9858) · **Date:** 2026-08-03 · **Method:** 4 verifiers + 3 fix agents + lead consolidation; every number regenerated from executable runs, not copied from reports.

## FINAL VERDICT: ✅ **Pilot Ready**

For: a supervised Ontario brokerage pilot on fictional/demo data, with human approval gates active (A1–A2 autonomy), Kimi platform hosting, and the documented limitations below.
Not: production, multi-province operation, live-model autonomy, or real consumer data.

### Why not "Production Ready" (evidence, not caution)

1. **16/44 Ontario compliance rules are declared-only** (metadata, not executable controls) and 12 are partial — now truthfully documented in `docs/compliance-control-matrix.md`, but they are not enforced. Source: 04_COMPLIANCE.md per-row matrix + corrected matrix.
2. **17/20 agents are contract-tested cores with no production call sites**; the model gateway defaults to a deterministic mock — live-model behavior is unvalidated (UNTESTED_AND_MOCKED.md).
3. **Counsel review outstanding** — the policy pack is engineering-grade, not legal advice (docs/legal-review-checklist.md VERIFY items).
4. **All external integrations are mocks** — comms, calendar, listing data (never represented as live).
5. **Coverage floor** — 13/21 routers at ~0% direct test coverage; no CI run executed yet; db:push non-idempotent on TiDB.

### Why not merely "Beta" (evidence, not optimism)

1. **Battery regenerated green by an independent verifier AND by the lead:** check 0 / lint 0 / test 248/248 / evals 131+85 / build 0 / seed ×2 idempotent (08_TEST_RESULTS.md, GATE_OUTPUTS.md).
2. **The attack surface held:** 22 cross-tenant attacks blocked, 7 JWT forgery classes rejected, OAuth/CSRF/hash-chain/ceiling/idempotency suites re-verified (03_SECURITY.md).
3. **Every confirmed defect found by the swarm is fixed with a regression test** — 61 findings → 56 fixed, 5 accepted-and-documented residuals (02_CRITICAL_BUGS.md, 11_PATCHES.md). The fix wave added 109 tests.
4. **The documentation now tells the truth** — fabricated env table, false matrix rows, 20-agent framing, and hidden db:push danger all corrected (fix-rt-docs, 11 patches).
5. **The demo is reproducible** — seeded fictional Harbourline universe with a real blocked-CASL decision and an expired-consent lead; no real personal data anywhere.

### Scorecard (0–5, evidence-anchored)

| Dimension | Score | Anchor |
|---|---|---|
| Build & gates | 5/5 | all five gates exit 0, regenerated ×3 |
| Security | 4/5 | held under live attack; residuals: revocation, tail-truncation, no RLS backstop |
| Multi-tenancy | 4/5 | 22/22 attacks blocked; app-layer only, no DB RLS |
| Compliance executability | 3/5 | core enforced + fail-closed jurisdiction; 16 declared rules; counsel outstanding |
| Autonomy & workflows | 4/5 | gate→approval→drain proven e2e exactly-once; scheduler now real; drainer per-row containment |
| Data integrity | 4/5 | 60 FKs, atomic writes, idempotency scoped; db:push hazard documented |
| Documentation truth | 5/5 | every claim re-anchored to code this wave |
| Test depth | 3/5 | 248 green incl. adversarial; router coverage floor remains |
| AI capability | 2/5 | deterministic mock by design; live provider unvalidated |
| Performance | 3/5 | N+1s fixed; 1.24 MB eager bundle; 14 MB images; no load test |

**Weighted total: 3.7/5 — consistent with Pilot Ready, inconsistent with Production Ready.**

### Conditions to advance one level (Production Candidate)

1. Counsel sign-off on the Ontario pack + VERIFY items closed.
2. Live-provider swap with full eval re-run (131+85) and red-team re-check of agent-safety controls.
3. Production adapters for comms/calendar/listing data with contract tests (CASL footer re-verified live).
4. Router coverage ≥80% on security-sensitive routers; first CI run green; migration tooling replacing db:push.
5. Remaining residuals addressed or formally accepted by the broker of record: JWT revocation, audit tail-truncation anchoring, RLS hardening path (ADR-002).

### Closing statement (unchanged, still true)

Software controls reduce risk but **do not guarantee legal compliance**. This system ships with an engineering-grade Ontario policy pack requiring brokerage counsel and broker-of-record approval before production use. All integrations report truthful status; mock components are never represented as live.

---

## Post-remediation errata (2026-08-03, `8dacca0`+)

This section updates the record without rewriting the historical findings above (measured at `66c5d2b`).

1. **Finding ledger:** 61 red-team findings → **56 fixed** (including all 7 P0s and the proof-layer false-greens in the eval/docs layer), **5 accepted-and-documented residuals** (incl. JWT revocation list, audit tail-truncation anchoring, no DB-RLS backstop, router coverage floor, live-provider validation). Fix evidence: per-finding commit refs in `03_SECURITY.md` / `04_COMPLIANCE.md` summary tables; regression tests flipped at `66c5d2b`.
2. **appr-01 false-green incident (honest account):** the "131/131 golden" figure in GATE_OUTPUTS.md at `66c5d2b` was **wrong** — the true result at that commit was **130/131**: scenario appr-01 (stale approvals) failed because its fixture approval bound a non-canonical payload hash, while the gate requires the canonical `actionPayloadHash(kind + payload + destination)`. The fixture was corrected in **`8dacca0`** (`evals/golden.ts`) and a fresh run on 2026-08-03 genuinely passes **131/131** (errata recorded in `evals/report.md`). Any pre-`8dacca0` "131/131" claim — including the scorecard/verdict evidence lines above — should be read as 130/131 for that commit. The verdict does not change: the defect was in the eval fixture, not the gate (the gate correctly *rejected* the mis-bound approval — fail-closed working as designed).
3. **Release-mandate remediation:** P0/P1 follow-up work is in progress on the `release-*` branches (`release-eng` liveness/readiness probes + boot hardening, `release-docs` docs-truth + CI pipeline, `release-decon` fictional-data gate). Items land on master as those branches merge.
4. **Secret rotation = REQUIRED-EXTERNAL:** rotation of `DATABASE_URL` and `APP_SECRET` is a platform-side obligation outside this repo (the values are portal-provided; `APP_SECRET` is dual-use OAuth secret + JWT signing key — rotate together per `docs/deployment-guide.md` §2). No in-repo action can discharge it.
5. **Verdict — UNCHANGED: ✅ Pilot Ready** (demo harness, unmistakably fictional data only, human approval gates, mock integrations; supervised Ontario testing only). The errata above affect the evidence trail's accuracy, not the substance: every control the verdict rests on was re-verified post-fix.

### Updated health endpoints note

The live health check is the tRPC ping at `GET /api/trpc/ping` (`api/router.ts`); the historical reference to `/api/ping` in GATE_OUTPUTS.md is stale. `GET /api/livez` and `GET /api/readyz` staging probes are being added on `release-eng` (`api/boot.ts`).

---

## Release-lead final addendum (2026-08-03, `12f89ca82b300f43ee6734c06edc97c8b11e87b2`)

The release mandate is now COMPLETE. All P0 and P1 items closed; P2 staging smoke 14/14. The `release-*` branches are merged into `master` (= `final-build`) at `12f89ca`:

- **P0 credential incident:** exposure contained (garbage trees deleted, 735 MB; `.env` files purged; git history verified clean — garbage never entered the repo); rotation of `DATABASE_URL`/`APP_SECRET` recorded as REQUIRED-EXTERNAL in `release/ROTATION_STATUS.md` (no values printed).
- **P0 data decontamination:** 93 banned-token occurrences → 0 (real Toronto street names, the real brokerage domain `[REDACTED — pre-decontamination real-world identifier; see internal archive]`, non-555 phones); demo data now `DEMO-ON-*` + `M0M 0M0` + `harbourline.example` + `555-01XX`; CI-blocking `scripts/fictional-data-gate.mjs`; `docs/ASSET_PROVENANCE.md` created.
  - *Errata (2026-08-03): the historical evidence quote above originally reproduced the pre-decontamination real-world domain verbatim. It was redacted under the consent order as part of independent-audit remediation wave 2; the evidentiary meaning (which class of identifier was removed) is preserved. Original retained in the internal archive (`internal/`).*
- **P0 false-green eval:** fixture fixed at `8dacca0`; **131/131 re-measured at `12f89ca`** (see `release/GATE_TABLE.md` errata).
- **P1 engineering:** package identity `northstar-selleros@1.0.0-pilot`; lockfile normalized to registry.npmjs.org (0 internal hosts); clean-room `npm ci` exit 0; production audit **0 vulnerabilities** (6 moderate dev-only residuals documented); committed versioned migrations `db/migrations/0000_init.sql` proven exit 0 on a fresh isolated DB, no-op on rerun, audit_log never truncated; `/api/livez` + `/api/readyz` + SIGTERM/SIGINT graceful shutdown added and proven live.
- **P1 docs truth + CI:** stale "pending merge" claims removed (drainer, demo-role gate, province tagging are implemented); every 131/131 claim now carries commit + date; "production-grade" replaced with honest pilot framing; `.env.example` matches code-read vars exactly; CI workflow (mysql:8 service, secret scan, fictional-data gate, all gates, prod dep audit) committed — hosted CI URL = honest PENDING (`release/CI_STATUS.md`).
- **P2 staging:** smoke battery **14/14 PASS** against an isolated throwaway DB (created → migrated → seeded → dropped); results in `release/SMOKE_RESULTS.md`.

**FINAL VERDICT (gated on all P0/P1 — all passed):**
**Demo Pilot Deployable — suitable only for supervised Ontario testing using unmistakably fictional data, human approval gates and mock integrations.**

Deliverables: `release/` — source ZIP + SHA-256, manifest, zero-secret scan, fictional-data scan, rotation status, gate table, dependency audit, CI status, smoke results, residual-risk report.

---

## Wave-2 addendum — independent clean-room audit remediation (2026-08-03, `2e6b57914fe27c0db45f95b0e8b11ad7e8efe369`)

An external clean-room audit found 6 release-package blockers; all fixed and re-verified by an independent verifier running the full battery from a brand-new extraction of the shipped ZIP (not a git checkout), on Node v22.22.0:

1. **Lockfile**: 6 residual `npm.mirrors.msh.team` URLs (introduced by the wave-1 dependency upgrades) normalized to registry.npmjs.org — host swap only, integrity untouched (tarball sha512 verified). New CI-blocking `scripts/lockfile-host-gate.mjs` (707 URLs, npmjs-only). Private-registry count: **0**.
2. **Outer delivery hygiene**: 15 banned identifier matches (HANDOFF.md, this file, FINAL_GIT_DIFF.txt) + 56 more in unreferenced `design/` drafts — redacted here or quarantined to `internal/`. New `scripts/delivery-scan.mjs` scans the whole delivery incl. nested archives: public delivery **0 hits**.
3. **HANDOFF.md**: rewritten — no "production-grade"; states supervised Ontario fictional-data demo pilot, truthful mocks, 3/20 agents wired (17 unwired declared), not production-ready, WAITING_FOR_OWNER_ROTATION.
4. **Rotation**: unchanged, WAITING_FOR_OWNER_ROTATION (owner platform-console action).
5. **CI**: Node 22.22.0 pinned; `npm run evals` added; `db:push` replaced by committed-migration proof (migrate ×2 + audit-row survival, verbatim proof); lockfile gate added.
6. **Hosted CI**: still no remote — honest PENDING (external blocker).
7. **Verifier's own find**: `appendWorkflowEvent` retry budget (3) was mathematically insufficient for 5-way concurrent appends (up to 4 collisions) — ER_DUP_ENTRY escape at ~50% under full-suite load. Fixed at `2e6b579` (10 attempts + 5–20ms jittered backoff, max(seq) re-read per attempt). Root cause = read-max-then-insert race window on `workflow_events_wf_seq`; retries absorb it, they do not remove it — the cures (atomic per-workflow seq allocator / transactional FOR UPDATE allocation) are roadmap. Evidence: 4× full-suite 252/252 (fix agent) + 2× 252/252 (independent verifier) — zero flakes, zero skips.

**Verifier result: VERIFIED — 17 battery items + 14/14 smoke** (numbers in `release/GATE_TABLE.md`, `release/SMOKE_RESULTS.md`).

**Verdict — UNCHANGED, still gated:**
**Demo Pilot Deployable — suitable only for supervised Ontario testing using unmistakably fictional data, human approval gates and mock integrations — GATED: WAITING_FOR_OWNER_ROTATION. Not production-ready.**
