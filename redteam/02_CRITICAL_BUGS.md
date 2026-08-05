# 02 — Critical Bugs (Confirmed → Fixed → Proven)

Every entry: evidence, file, severity, fix, and post-fix proof. Full PoC detail lives in the reviewer reports (03/04/05/07/10). All fixes merged at `66c5d2b`.

## C-1 · SEC-2 — Arbitrary self-privilege-escalation via chooseDemoRole (HIGH)

- **Evidence:** live PoC — a `team_member` in ANY tenant called `auth.chooseDemoRole` → `broker_of_record` → decided A4 approvals + changed the autonomy ceiling; then → `fintrac_officer` → opened the FINTRAC queue. Docs claimed "demo tenant only"; code enforced nothing.
- **File:** `api/auth-router.ts:14-23`, `api/queries/users.ts:111`
- **Fix:** `548db82` — demo tenant resolved via `findDemoTenant()`; FORBIDDEN in any other tenant.
- **Proof:** flipped PoC (`api/redteam/privEscalation.test.ts`) — non-demo escalation blocked, role unchanged, downstream gates hold. 248/248.

## C-2 · SEC-3/COMP-5 — FINTRAC write path open to any role (MEDIUM-HIGH)

- **Evidence:** PoC — `team_member` finalized a `fintrac_str` task via `completeTask` with zero verification. F3 had protected reads only.
- **File:** `api/routers/transactions.ts:44-58`
- **Fix:** `548db82` — fintrac_* tasks completable only by `fintrac_officer`; attempts audited before auth.
- **Proof:** PoC `909cc9c` flipped (non-officer FORBIDDEN, officer positive control).

## C-3 · DB-1 — Zero foreign keys across all 32 tables (HIGH)

- **Evidence:** `information_schema` query → empty; schema `fk()` helper had no `.references()`.
- **File:** `db/schema.ts` (all relations)
- **Fix:** `0b7d676` — 60 FKs applied live (CASCADE for NOT NULL children, SET NULL for nullable); seed wipe order fixed; 17 approvals + 3 workflows + 5 audit_log orphan rows from dead red-team tenants cleaned first.
- **Proof:** bogus-parent insert rejected; seed ×2 green; cascade test green.

## C-4 · DB-5 — Zero database transactions anywhere (HIGH)

- **Evidence:** `grep "\.transaction("` → 0. Campaign launch = 5 non-atomic writes (decision → approval → status → outbox → audit).
- **File:** `api/routers/campaigns.ts`, `api/workflows/runner.ts`, `drainer.ts`, `api/routers/approvals.ts`
- **Fix:** `328d6fd` (data) + `1d8091d` (decide conditional UPDATE) — critical write sets are single SQL transactions.
- **Proof:** forced mid-transaction error → zero partial rows; double-decide race → 0/10 (deterministic CONFLICT).

## C-5 · DB-7 — Audit chain + workflow seq race under concurrency (HIGH)

- **Evidence:** read-max-then-insert with no lock/retry (`api/audit.ts:34-35`, `api/store/drizzle.ts:298-304`); concurrent writers observed on the shared DB during verification.
- **Fix:** `6585323` — duplicate-key catch + bounded retry re-reading max, inside transactions.
- **Proof:** concurrent appends land both rows, chain verifies (Memory + live DB).
- **Residual:** live-DB concurrency probe can flake `ER_DUP_ENTRY` under parallel vitest workers (2× in ~10 runs; loud, never silent). Tracked as residual risk.

## C-6 · ARCH-7/GAP-7 — Outbox drainer had no scheduler (MEDIUM-HIGH, functional)

- **Evidence:** no interval/worker in `api/boot.ts`; drains only via a manual `simulateRestart` demo mutation. Escalated rows would wait forever in production.
- **Fix:** `a50b0af` — `DRAINER_INTERVAL_MS` interval worker (default 30000, 0 disables), per-tenant cycles, per-row poison containment (`attempts+1`, `lastError`), never under `NODE_ENV=test`, clearInterval on close.
- **Proof:** `api/boot.drainer.test.ts` — fake-timer tick drains without any manual call; exactly-once across 100+ ticks; poison row contained and retried.

## C-7 · SEC-5 — Idempotency squatting across action types (MEDIUM)

- **Evidence:** PoC — attacker enqueued `cem.send` under predictable key `campaign_launch_send_<id>`; the later broker-approved launch returned `launched:true` while its intent was NEVER enqueued (annihilated).
- **Fix:** `742f47c` — uniqueness/lookups now scoped `(tenantId, action, idempotencyKey)` (live index swap); sanctioned one-line engine gate edit.
- **Proof:** flipped PoC — both intents coexist; same (tenant, action, key) still dedupes.

## C-8 · SEC-6 — Approvals never consumed (replay within 48h TTL) (MEDIUM)

- **Evidence:** PoC — one approval authorized repeated launches.
- **Fix:** `6e5b079` + `1d8091d` — `usedAt` column (live DDL), drainer consumes in the execution transaction, gate `approval_freshness` blocks consumed approvals, decide rejects consumed.
- **Proof:** `drainer.approvals.test.ts` + flipped replay PoC — drained once; replay blocked with /consumed/; zero side effects.

## C-9 · SEC-10 — Forged webhooks walk workflows past human-approval waits (MEDIUM)

- **Evidence:** PoC — `team_member` forged `approval_granted` (no signature, arbitrary eventType, fresh dedupeKeys) and advanced seller_journey past its wait state.
- **Fix:** `71b2f31` — role gate (broker_of_record / brokerage_admin / transaction_coordinator), per-definition `waitEventTypes` allowlist, `approval_granted` bound to a real tenant-scoped decided-approved unconsumed approval, pre-append `WebhookRejectedError`.
- **Proof:** `api/routers/workflows.test.ts` (8 e2e tests) + flipped forgery PoCs (all FORBIDDEN/BAD_REQUEST, workflow unmoved).

## C-10 · COMP-3 — Quebec contacts silently evaluated under Ontario rules (HIGH, compliance)

- **Evidence:** PoC — contacts had no province field; a QC resident in an ON tenant got `allow` with zero flag, while docs claimed province tagging.
- **Fix:** `516bb81` — `contacts.province` (live DDL), `contactOutsideProductionScope` control, 16th gate check `contact_jurisdiction` failing closed to escalate with ruleId PIPEDA-07.
- **Proof:** `api/policy/jurisdiction.test.ts` (7 tests) + flipped province PoC.

## C-11 · Documentation layer fabricated reality (HIGH, trust)

- **GAP-1:** deployment-guide env table 100% fabricated (17/17 vars absent from code) → rewritten from `process.env` ground truth with file:line citations (`c80184c`).
- **COMP-2:** 10 compliance-matrix rows claimed "as implemented" controls that don't exist → restructured with enforced/partial/declared column; honest counts 16/12/16 (`c434121`).
- **COMP-6:** docs presented a 20-agent working journey; 3/20 agents wired → corrected everywhere (`f2501d7`).
- **GAP-2:** `db:push` can prompt to TRUNCATE the tamper-evident audit_log and exits 0 non-interactively → prominent warnings in 4 docs; "(idempotent)" claim removed (`bcca2e6`).
- **GAP-3/4:** threat-model C5/C6 controls had zero implementing code → reclassified declared (`b59c074`).

## Fixed additionally (non-critical, all regression-tested or documented)

SEC-1 cross-tenant reference pollution (offers.upload/consents.*) · SEC-4 decide race · SEC-7 action-kind binding · SEC-9 JWT clientId + 7-day TTL · session cookie SameSite=Lax · fintracQueue GET→mutation · DB-6 stale-status crash window · DB-8 five store methods ignoring tenantId · ARCH-6 N+1 (offers, conversations) · GAP-5 CI config added · GAP-6 workflows router 0% → 8 e2e tests · GAP-8..12 docs corrections.
