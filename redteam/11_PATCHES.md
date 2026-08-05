# 11 — Patches (Complete Fix Manifest)

All commits from the remediation waves, in order, between `679f2f6` (pre-red-team delivery) and `66c5d2b` (final). Full diff: `FINAL_GIT_DIFF.txt` (68 files, +3,458/−543).

## Branch fix-rt-sec (security/authz) — merged via bcdaed1

| SHA | Patch |
|---|---|
| `548db82` | SEC-2 chooseDemoRole restricted to demo tenant · SEC-3 fintrac_* tasks officer-only with audited attempts |
| `1767ebe` | SEC-1 offers.upload/consents.* validate referenced ids belong to caller's tenant |
| `1d8091d` | SEC-4 conditional decide UPDATE (status='pending') · SEC-6 decide rejects consumed approvals + binding coordinates · SEC-7 actionPayloadHash binds (kind, payload, destination) |
| `5af6cc8` | SEC-9 session JWT clientId verified, TTL 1yr→7d, revocation roadmap-noted |
| `e11a19d` | Session cookie SameSite=Lax · compliance.fintracQueue query→mutation (audited) |
| `4120be4` | ARCH-6 offers.byProperty inArray + offers.upload batched INSERT |
| `501434c` | lint chore |
| (merged) | `redteam-sec` + `redteam-compliance` PoC branches — 54 adversarial tests, flipped to regression assertions |

## Branch fix-rt-data (database/workflows) — merged via 4709ee6

| SHA | Patch |
|---|---|
| `0b7d676` | DB-1 — 60 foreign keys live; seed wipe order; orphan cleanup (17 approvals, 3 workflows, 5 audit rows) |
| `6585323` | DB-7 — audit/workflow seq duplicate-key retry under concurrency |
| `328d6fd` | DB-5 — Store.transaction(); atomic write sets (launch, runner steps, drainer) |
| `e205607` | DB-6 — webhook stale-status crash window closed (status re-derived from events) |
| `084f567` | DB-8 — 5 store methods tenant-scoped; tenancy suite binds live DrizzleStore |
| `742f47c` | SEC-5 — idempotency scope (tenantId, action, key); live index swap; sanctioned engine edit |
| `6e5b079` | SEC-6 — approvals.usedAt (live DDL); drainer consumes in execution tx; gate freshness rejects consumed (sanctioned engine edit) |
| `71b2f31` | SEC-10 — webhook role gate + waitEventTypes allowlist + approval binding + WebhookRejectedError · GAP-6 — workflows router e2e suite (8 tests) |
| `516bb81` | COMP-3 — contacts.province (live DDL) + contact_jurisdiction 16th gate check, fail-closed (sanctioned engine edit) |
| `a50b0af` | ARCH-7/GAP-7 — drainer interval worker (DRAINER_INTERVAL_MS=30000) + per-row poison containment |
| `4410f2f` | ARCH-6 — conversations.list batched (2N+1 → 2 queries) |
| `1f38c78` | lint unblock + seed Jonah province=ON (fictional) |
| `80600a7` | eval report refresh |

## Branch fix-rt-docs (truth layer) — merged via bcdaed1

| SHA | Patch |
|---|---|
| `c434121` | COMP-2 — compliance matrix restructured: Enforcement column, 44 rows, honest 16/12/16 |
| `78db597` | COMP-1 — scenario-test claims corrected in 7 files |
| `f2501d7` | COMP-6 — agents truth: 20 contract-tested / 3 wired / 17 pending |
| `05a629b` | COMP-8/9 — gateway caps wording; payload-snapshot limitation L14 |
| `c80184c` | GAP-1 — env table rewritten from process.env ground truth (12 real vars, file:line) |
| `bcca2e6` | GAP-2 — db:push truncate-audit_log warnings ×4 docs |
| `b59c074` | GAP-3/4 — threat model C5/C6 → declared |
| `461f8f5` | GAP-5 — .github/workflows/ci.yml (check/lint/test/evals) |
| `1288b9f` | GAP-8..12 — db:migrate note, TTL 48h, broken refs, unsubscribe claim |
| `85c3b8b` | Data provenance statement ×4 docs (fictional-only) |
| `0f5356d`,`0f02081` | sweep — drainer truth, runbook phantoms, CSP claim, ADR-002 unmet mandate |

## Consolidation (lead) — 66c5d2b

| SHA | Patch |
|---|---|
| `66c5d2b` | Final 7 cross-branch PoC flips → regression assertions (SEC-5 coexistence, SEC-6 consumed-replay blocked, SEC-10 FORBIDDEN ×3, PIPEDA-07 column + QC fail-closed, tenantEscape webhook FORBIDDEN) |

## Live DDL applied to the shared dev TiDB (manual, additive — no db:push)

1. 60 `ALTER TABLE … ADD FOREIGN KEY` (CASCADE / SET NULL per nullability)
2. Outbox index swap → `UNIQUE (tenantId, action, idempotencyKey)`
3. `ALTER TABLE approvals ADD COLUMN usedAt TIMESTAMP NULL`
4. `ALTER TABLE contacts ADD COLUMN province VARCHAR(2) NULL`
5. Orphan debris cleanup (17 approvals + 3 workflows + 5 audit_log rows from dead red-team tenants)

## Verification of this manifest

Every commit was gated at commit time (targeted tests), and the merged head passed the full battery: check 0 · lint 0 · test 248/248 · evals 131+85 · build 0 · seed ×2 idempotent. Exact outputs: `GATE_OUTPUTS.md`.
