# Operations Runbooks — Northstar SellerOS

Day-2 operations for the durable runner, policy gate, seeds, and evals. Each runbook: symptoms → diagnosis → action → verification. Module names per `ARCHITECTURE_CONTRACT.md`. For security/privacy/regulatory incidents use `docs/incident-runbooks.md` instead.

**Probes.** The live health endpoint is the tRPC ping at `GET /api/trpc/ping` (`api/router.ts`). `GET /api/livez` and `GET /api/readyz` liveness/readiness endpoints for staging probes are added on the release engineering branch (`api/boot.ts`) and are available once merged.

## RB-1 — Outbox drainer stopped or backing up

**Symptoms.** Approved actions not executing; `outbox` rows accumulating with `status = pending`; campaign sends and calendar bookings silent; UI "worker" indicator degraded.

**Diagnosis.**
1. Count backlog and age: `SELECT status, COUNT(*), MIN(createdAt) FROM outbox GROUP BY status;`
2. Inspect failures: `SELECT id, action, attempts, lastError FROM outbox WHERE status='failed' ORDER BY id DESC LIMIT 20;`
3. Confirm the drainer worker is running. The drainer runs as an **in-process interval worker** started by the API server (`api/boot.ts`, `DRAINER_INTERVAL_MS`, default 30000ms; `0` disables it — check the env first). The `workflows.simulateRestart` procedure, the seed, and evals also invoke drains directly.

**Action.**
1. Restart the drainer: restart the API process (`npm run dev` / the deployed service — the interval worker starts at boot unless `DRAINER_INTERVAL_MS=0`).
2. **Do not manually delete or mark rows `sent`.** The drainer dedupes by unique `idempotencyKey` and re-evaluates the commit-time policy gate fresh on every attempt — replay is safe by design (ADR-003/ADR-005).
3. For rows with repeated `failed` + `lastError`: fix the root cause (provider config, payload shape) — then reset `status='pending', attempts=0` for **those rows only**.
4. If `lastError` shows policy blocks: this is the gate working, not a drainer fault. Route the blocked item's `policyDecisionId` to the responsible human via the Approval Inbox; do not override.

**Verification.** Backlog drains; no duplicate external effects (check provider logs / mock send log against `idempotencyKey`); `policy_decisions` rows exist for every drained item; `audit_log` chain has no sequence gaps.

## RB-2 — Stuck workflow resume

**Symptoms.** A `workflows` row sits in `status='running'` with `currentStep` unchanged across drainer cycles (e.g., a transaction workflow paused mid-journey).

**Diagnosis.**
1. `SELECT id, kind, subjectId, status, currentStep, version FROM workflows WHERE id=?;`
2. Replay log: `SELECT seq, type, createdAt FROM workflow_events WHERE workflowId=? ORDER BY seq;` — the last event shows where execution stopped.
3. Check for a pending approval (`approvals.status='pending'` for the subject) or an outbox item blocked by the gate — the workflow may be correctly waiting, not stuck.

**Action.**
1. If waiting on approval: route to the approver; if the approval expired (`expiresAt` past), the gate will block on resume — create a fresh approval with the current payload rather than resurrecting the old one (stale-approval replay protection, ADR-005).
2. If genuinely stuck (no pending approval, no pending outbox, no recent events): restart the worker. The runner replays `workflow_events`, rebuilds state, and resumes from `currentStep`.
3. Never edit `workflow_events` (append-only) or hand-mutate `workflows.state` — if state is corrupt, escalate to engineering with the event log exported.

**Verification.** Workflow advances; no duplicate actions (idempotency); the demo moment in `docs/demo-script.md` §7 reproduces this scenario deliberately.

## RB-3 — Policy-gate outage posture (fail closed)

**Symptoms.** `evaluateAction` errors or timeouts; drainer pausing; all outbound side effects halted; UI shows blocked actions with gate-unavailable reasons.

**This is the designed posture.** Per ADR-005, when authority or evidence cannot be evaluated, the system fails closed: **no sends, no bookings, no publications.** Do not implement a bypass, a "warn mode," or a manual send path — any of these voids the compliance architecture (and CASL/FINTRAC exposure begins at the first unsanctioned CEM).

**Action.**
1. Restore `api/policy/engine.ts` availability (service restart; DB connectivity for `policy_packs`/`policy_rules`/`policy_decisions`).
2. Confirm the Ontario pack version is intact and `policy_packs.status` is active — a missing/renamed pack fails closed, which looks identical to an outage.
3. On recovery, the interval drainer picks up queued items automatically on its next tick — each is re-evaluated fresh; nothing needs manual payload replay.
4. File an incident record (Sev-2; see `docs/incident-runbooks.md` ladder) noting duration — counsel may want the blocked-action log for the period.

**Verification.** A known-good test action (seeded opted-in listing alert) evaluates `allow`; previously queued items drain or block with legible reasons.

## RB-4 — Seed reset (demo environment)

**When.** Demo data drifted; reviewer wants a clean run of `docs/demo-script.md`; after test runs that mutated seeded consents/approvals.

**Action.**
```bash
npm run db:seed:reset   # drops demo tenant data, re-runs db/seed.ts
```

> ⚠️ Do **not** substitute `npm run db:push -- --force`: on TiDB `db:push` is not idempotent — re-running it against a synced schema prompts to **TRUNCATE `audit_log`** (destroying the tamper-evident chain) and fails silently (exit 0) when non-interactive. It must never run in CI or against production data. The seed scripts above are the safe, demo-tenant-scoped reset path.

**Cautions.**
1. Only ever run in demo environments. **Never in production** — the seed creates the "Harbourline Realty Inc., Brokerage" tenant and demo-impersonation roles, which must not exist in production (ASSUMPTIONS #3). There is no `SEED_DEMO` flag in code — the seed is controlled simply by not running this script against a production database.
2. Reset invalidates in-flight workflows and approvals by design; finish or discard them first.

**Verification.** Demo cast present: Maya Chen (registrant), the Pelletiers / DEMO-ON-PROPERTY-001 dossier, Jonah Whitfield (buyer lead); Ontario policy pack active; integration statuses read mock/not_connected.

## RB-5 — Evaluation runs

**When.** Before any release; after any policy-pack, gateway, agent, or provider change; **mandatorily** after configuring a live model endpoint via `MODEL_GATEWAY_*` (ADR-004).

**Action.**
```bash
npm run test          # unit + policy (executable decision tests for ~13 rule IDs; scenario
                      # metadata validated for all 44) + security + i18n parity + API integration
npm run evals         # golden scenarios (≥100 across spec §13 categories) + seller-conversation simulator
```
Results are generated to `evals/report.md` — pass rates per category, representative failures, corrections made, remaining limitations.

**Interpreting.**
1. Any failed **policy** scenario is a release blocker — no exceptions; route to the compliance owner named in the rule's `escalationPath`.
2. Failed **security** scenarios (cross-tenant, injection, exfiltration, stale approval, duplicate webhook, restart-resume) are release blockers.
3. Quality regressions (extraction citations, comparable relevance, conversation quality) below the thresholds recorded in the previous `evals/report.md` block autonomy-level increases but not necessarily release — record the decision.
4. With the default mock provider (`MODEL_GATEWAY_BASE_URL` unset), results are deterministic; identical inputs must produce identical reports. Nondeterminism under the mock provider is itself a bug (seed leakage) — investigate before trusting the run.

**Verification.** `evals/report.md` regenerated with exact counts (per ASSUMPTIONS #8, numbers are reported as measured, never rounded targets); green `npm run test`.

## RB-6 — Retention & suppression hygiene (manual cadence — no scheduler yet)

**Cadence — honest status: no scheduled jobs exist yet.** The `agents/PrivacyRetention` retention logic is an unwired agent core; there is no consent-hygiene report workflow (CASL-08 partial), no DNCL renewal alert (DNCL-01), and no FIN-02 review countdown (FIN-02 declared). Until these ship (roadmap), run the checks below **manually** at the stated cadences and record the run in the ops log:

**Checks.**
1. Legal-hold records are never purged — job log must show holds skipped, not deleted (PIPEDA-03, FIN-08).
2. Suppression coverage 100%: every unsubscribe in `suppression_list`, zero sends to suppressed contacts in provider logs (CASL-06).
3. Consent expiries upcoming in 14 days surfaced for re-confirmation (CASL-03).
4. Any purge attempt on records < 5 years in the FINTRAC register is blocked and logged — investigate as a potential incident, not an ops error.
