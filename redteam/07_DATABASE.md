# Northstar SellerOS — Database Verification (Red Team)

Verifier: ARCHITECTURE + DATABASE adversarial verification. Mode: evidence-only.
db/schema.ts (31 tables claimed) vs live DB (DATABASE_URL in .env).

Status: IN PROGRESS — findings appended incrementally.

## Summary Table (finalized at end)

| ID | Finding | Severity |
|----|---------|----------|

---

## DB-1: Zero foreign keys anywhere — referential integrity unenforced
- **Evidence**: `information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_TYPE='FOREIGN KEY'` → `[]` (empty across all 32 tables). Schema declares FK-like columns via a `fk()` helper that is just `bigint(... unsigned).notNull()` with **no `.references()`** (db/schema.ts:19-21). Live DB is TiDB v8.5.3 (`SELECT VERSION()` → `8.0.11-TiDB-v8.5.3-serverless`) — FK enforcement became GA in TiDB 8.5, so this is a schema choice, not an engine limit.
- **File/Line**: db/schema.ts:19-21 (`fk`/`fkNull` helpers); live DB constraint dump (2026-08-03).
- **Severity**: HIGH. Orphans possible: e.g. delete a contact → consent_records/suppression_list/conversations rows dangle; nothing stops it. Roadmap (docs/roadmap.md:20) admits hardening is future work.
- **Fix**: add `.references()` in schema or raw FK migrations; at minimum document "app-level integrity only".
- **Proof**: `SELECT TABLE_NAME, CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_TYPE='FOREIGN KEY' AND TABLE_SCHEMA=DATABASE()` → 0 rows.

## DB-2: Unique constraint inconsistency on idempotency keys
- **Evidence**: live `UNIQUE` constraints: `outbox.outbox_tenant_idem (tenantId,idempotencyKey)` ✓ per-tenant as F10 requires, but `campaign_messages.campaign_messages_idem (idempotencyKey)` is **global** — one tenant's key squats another's (the exact cross-tenant squatting F10 says must not happen, db/schema.ts:694 comment). `policy_decisions.idempotencyKey` (db/schema.ts:775) has **no unique index at all**.
- **File/Line**: db/schema.ts:427 (campaign_messages idemKey), :695 (outbox), :775 (policy_decisions).
- **Severity**: MEDIUM-LOW. Mitigation found: `grep idempotencyKey: api/routers` shows campaign send keys embed globally-unique serial ids (`campaign_launch_send_${campaign.id}`), and only db/seed.ts:358 inserts campaign_messages today — so cross-tenant collision is unreachable by current code paths. The client-supplied key path (conversations.ts:85,101,115 → enqueueOutbox) lands on outbox, which IS per-tenant unique. The invariant violation is latent, not live; policy_decisions key is write-only decoration without enforcement.
- **Fix**: `uniqueIndex on (tenantId, idempotencyKey)` for campaign_messages; decide whether policy_decisions.idempotencyKey should dedupe (add unique) or be dropped.
- **Proof**: `SELECT TABLE_NAME, CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_TYPE='UNIQUE'...` → shows `campaign_messages_idem` on single column; `SHOW INDEX FROM campaign_messages` confirms cols=idempotencyKey only.

## DB-3: Empty migrations directory — db:push is the only sync path
- **Evidence**: `db/migrations/` exists but contains **zero files**. `db:generate` was never run/retained. drizzle.config.ts points `out: "./db/migrations"`. package.json `db:push` runs `scripts/patch-drizzle-tidb.mjs && drizzle-kit push`. Docs (docs/deployment-guide.md:16,22) honestly document db:push as the apply mechanism ("idempotent") — no false migration claims found.
- **File/Line**: db/migrations/ (empty); package.json scripts; docs/deployment-guide.md:16.
- **Severity**: MEDIUM. No versioned schema history, no rollback, no reviewable diffs; `drizzle-kit push` on a prod DB can prompt interactively or destructive-drop. Acceptable for demo, unacceptable for the "production-hardening" claims.
- **Fix**: commit `drizzle-kit generate` output; use `db:migrate` in deploys; keep db:push for local only.
- **Proof**: `ls db/migrations` → empty; live schema parity (indexes below) proves push was used.

## DB-4: Index parity confirmed live; but tenant indexes missing on 7 child tables
- **Evidence**: full `information_schema.STATISTICS` dump matches schema exactly (all declared indexes exist live — push-sync verified). Tables with `tenantId` column but **no tenant index**: comparables, valuations, campaign_messages, messages, offer_terms, transaction_tasks, workflow_events. Also missing: `outbox.status` (drainer polls `WHERE status='pending'` — full scan, api/store/drizzle.ts:240-248), `conversations.contactId`, `dossiers.propertyId`, `strategies.propertyId`, `seller_direction_artifacts.propertyId`.
- **File/Line**: db/schema.ts:304,323,426-429,471-473,550,632-634,672-674; api/store/drizzle.ts:240.
- **Severity**: LOW today (DB is a 1-tenant demo: contacts=7, messages=6 rows), HIGH at scale: drainer full-scans outbox per drain; per-tenant queries on child tables scan by child-FK index only.
- **Fix**: add composite indexes `(tenantId, status)` on outbox; tenant indexes or composite (childId is fine if always queried by parent) — but routers DO query some by tenant+child (e.g. offer_terms by tenantId+id in offers.verifyTerm → PK lookup, OK).
- **Proof**: `SHOW INDEX` dump (full table in verification notes); row counts: all tables ≤47 rows except none.

## DB-5: No database transactions anywhere — multi-write flows are non-atomic
- **Evidence**: `grep -rn "\.transaction(" api db` (excl. tests) → **0 matches**. Concrete multi-write flows with no atomicity:
  - campaigns.launch (api/routers/campaigns.ts:54-102): policy decision insert → approvals insert → campaigns update → outbox enqueue → audit append = 5 writes, 0 tx. Crash mid-flow leaves e.g. campaign `approved` + outbox row but no audit row.
  - approvals.decide (api/routers/approvals.ts:57-64): update + audit append.
  - workflow runner (api/workflows/runner.ts:89-118): per step — outbox enqueue(s) → appendWorkflowEvent → updateWorkflow, all separate statements.
  - offers.upload (api/routers/offers.ts:41-59): offer insert + N term inserts + audit.
- **File/Line**: as above.
- **Severity**: HIGH for an app whose pitch is auditability/compliance. Event-sourcing mitigates the runner (see DB-6), but router flows have no recovery story.
- **Fix**: wrap each router's write set in `db.transaction()`; or move all writes behind Store methods that transact.
- **Proof**: grep output empty; code inspection of cited lines.

## DB-6: Workflow runner crash recovery — mostly sound, one liveness hole
- **Evidence**: runner appends outbox effects BEFORE the `step_completed` event (runner.ts:89-110), so crash-between is replay-safe; re-enqueue dedupes on unique (tenantId,idempotencyKey) — design claim "zero duplicates" holds for that window. BUT `handleWebhook` (runner.ts:203-206) checks `store.getWorkflow(workflowId).status === "waiting"` — the **stale cache row**, not the replayed truth. Crash between `appendWorkflowEvent(step_completed, waitFor=…)` (runner.ts:105) and `updateWorkflow({status:"waiting"})` (runner.ts:114) leaves the row `running` forever; the webhook is then recorded as seen (`seenWebhooks`) yet never resumes the workflow → **permanently stuck workflow** with no auto-resume daemon (see ARCH-9: drainer is manual-only).
- **File/Line**: api/workflows/runner.ts:203-206 vs :105-118; api/store/drizzle.ts:286-290 (getWorkflow reads cache row).
- **Severity**: MEDIUM-HIGH (requires crash in a 3-statement window; demo "simulateRestart" never hits it because updates succeed).
- **Fix**: derive `waiting` from `replayed.waitFor`/`after.waitFor` (already computed) instead of the cache row; add a periodic stuck-workflow sweeper.
- **Proof**: code trace; no transaction spans the two writes (DB-5).

## DB-7: Audit chain + workflow event seq use read-max-then-insert — race under concurrency
- **Evidence**: `appendAudit` (api/audit.ts:34-35) does `getLastAudit` → `seq=last+1` → `appendAuditRow` with no lock/tx. Two concurrent mutations in one tenant compute the same seq; `audit_tenant_seq` unique index makes one INSERT fail with unhandled duplicate-key error → caller's business write already committed but its audit row is lost and the request 500s. Same pattern in `appendWorkflowEvent` (api/store/drizzle.ts:298-314) guarded by `workflow_events_wf_seq` — webhook concurrent with resume → one fails unhandled.
- **File/Line**: api/audit.ts:30-68; api/store/drizzle.ts:292-319.
- **Severity**: HIGH. The audit chain is the compliance spine; losing audit rows under normal concurrency (two staff acting simultaneously) breaks the append-only invariant. No retry anywhere (`grep retry api/audit.ts api/store/drizzle.ts` → none).
- **Fix**: single-statement seq allocation (`INSERT ... SELECT COALESCE(MAX(seq),0)+1` in one tx with tenant row lock, or `GET_LOCK`), with duplicate-key retry.
- **Proof**: code inspection; unique index exists (DB-2 dump) so the failure mode is an exception, not silent corruption — partial mitigation noted.

## DB-8: Tenancy tests cover MemoryStore, not the production DrizzleStore
- **Evidence**: api/store/tenancy.test.ts:6 instantiates `new MemoryStore()` for all 7 cross-tenant tests. DrizzleStore (api/store/drizzle.ts) — the production implementation — is never tenancy-tested at store level. Live-DB tests exist (api/testkit/liveDb.ts used by 6 router test files incl. campaigns/offers/outbox) which exercise *some* DrizzleStore paths, but no test asserts e.g. DrizzleStore.getContact/getApproval cross-tenant denial. Additionally DrizzleStore doc comment "Every lookup is tenant-scoped" (drizzle.ts:21) is false: `getWorkflow`, `listWorkflowEvents`, `updateWorkflow`, `markOutbox`, `appendWorkflowEvent` take no tenantId (lines 286-340, 250-263). Routers currently pre-check tenancy (api/routers/workflows.ts:24-27,39-42,74-77) so exploitability is low.
- **File/Line**: api/store/tenancy.test.ts:6-13; api/store/drizzle.ts:19-23,286-340.
- **Severity**: MEDIUM. Contract tests that don't bind the production implementation give false confidence; the unscoped methods are a latent IDOR if any future caller forgets the pre-check.
- **Fix**: run the tenancy suite against DrizzleStore via liveDb fixture; add tenantId param to workflow/outbox store methods or fix the doc comment.
- **Proof**: test file inspection; method signatures in drizzle.ts.

## DB-9: Tenant isolation column coverage — PASS with 4 justified exceptions
- **Evidence**: of 32 tables, 26 have NOT NULL `tenantId`; exceptions: `users`, `tenants`, `policy_packs`, `integrations` (global by design), `policy_rules.tenantId` nullable (null=global pack content, db/schema.ts:745), `model_calls.tenantId` nullable (db/schema.ts:803). Live DB confirms all 32 tables exist with matching names. Mission brief said "31 tables" — actual count is **32** in both schema and live DB (name sets identical).
- **File/Line**: db/schema.ts (full read); live `SHOW TABLES`.
- **Severity**: INFO/PASS. integrations contains no per-tenant config (name/kind/status/truthfulNote/config) — acceptable as global registry; flag only that `config` JSON could someday carry tenant secrets — it currently must not.
- **Fix**: none required; add tenantId to integrations if per-tenant integration config is roadmap'd.
- **Proof**: schema read + `SHOW TABLES` diff (32 == 32, names match).

## DB-10: Live audit hash chain — VERIFIED (with environment caveat)
- **Evidence**: replayed `verifyAuditChain` logic (sha256 over canonical stableStringify fields, api/audit.ts:71-97) against live `audit_log` read-only: per-tenant chains verify (tenant 3244410: 6 rows VERIFIED; a second transient tenant's 1-row chain VERIFIED). `workflow_events` (workflowId,seq) uniqueness holds (7/7, 5/5 distinct). Chain verification is exposed only as a manual tRPC query (`audit.verifyChain`, api/routers/audit.ts:22-26) — docs/deployment-guide.md:82 calls it a "verification job"; no scheduled job exists (no interval/cron in api/boot.ts).
- **Caveat**: during verification the shared DB was actively mutated by other processes (audit row count changed 6→10→7; transient fixture tenants appeared/disappeared). Results are snapshot-consistent per query but the environment is not quiescent — incidentally demonstrating that concurrent writers are realistic, which makes DB-7's race non-theoretical.
- **Severity**: PASS (chain integrity), LOW (doc overstatement "job").
- **Proof**: scratch verifier implementing stableStringify+sha256 over live rows; output above.

## DB-11: Seed wipes the tenant's audit_log — append-only is a convention, not enforced
- **Evidence**: db/seed.ts:62 deletes `audit_log` rows for the demo tenant on every reseed (wipe-then-insert, documented "Re-runnable"). Append-only audit is enforced nowhere at DB level (no revokes on DELETE, no trigger — TiDB has no triggers). The chain survives reseed only because everything referencing old hashes is also wiped.
- **File/Line**: db/seed.ts:38-66.
- **Severity**: LOW for demo (seed is explicitly demo-tenant-scoped and honest), but proves "append-only" holds by convention only (api/audit.ts:27 comment admits this).
- **Fix**: for production posture, separate audit schema without DELETE grants.
- **Proof**: seed.ts wipe list includes s.auditLog.

## Test-suite corroboration
- MemoryStore-path suites all green: 12 files / 114 tests passed (`npx vitest run` on runner, tenancy, audit, agents, gateway, integrations, policy×4, kimi auth) — 2026-08-03, local worktree. Live-DB suites (users/campaigns/fintrac/offers/valuations/outbox) NOT run by this verifier (would write to the shared TiDB; mission constraint = read-only).

---

## Summary Table

| ID | Finding | Severity |
|----|---------|----------|
| DB-1 | Zero foreign keys (32/32 tables), integrity app-level only | HIGH |
| DB-2 | Idempotency uniques inconsistent: campaign_messages global, policy_decisions none; outbox correct (latent, keys currently internal) | MEDIUM-LOW |
| DB-3 | Empty db/migrations — db:push-only sync (honestly documented) | MEDIUM |
| DB-4 | Indexes match schema live; tenant/status indexes missing on 7 child tables + outbox.status | LOW now / HIGH at scale |
| DB-5 | No DB transactions anywhere; 5-write campaign launch etc. non-atomic | HIGH |
| DB-6 | Runner crash-recovery sound except stale-status webhook liveness hole | MEDIUM-HIGH |
| DB-7 | Audit seq + event seq read-max-then-insert race → lost audit rows under concurrency | HIGH |
| DB-8 | Tenancy tests bind MemoryStore, not DrizzleStore; 5 store methods ignore tenantId | MEDIUM |
| DB-9 | Tenant column coverage PASS (26 NOT NULL + 4 justified globals + 2 nullable-by-design); 32 tables live, names match | PASS |
| DB-10 | Live audit chain verifies; "verification job" is a manual query; concurrent writers observed | PASS / LOW |
| DB-11 | Seed wipes demo-tenant audit_log; append-only by convention | LOW |
