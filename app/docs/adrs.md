# Architecture Decision Records — Northstar SellerOS

Status legend: **Accepted** (binding for this build). Each ADR records context, decision, rationale, consequences, and the documented swap path back to the spec §7 suggestion. These ADRs satisfy spec §14 deliverable 6 and implement the deviations permitted by spec §7 ("unless rigorous research supports a better alternative"). See `ARCHITECTURE_CONTRACT.md` (binding) and `ASSUMPTIONS.md`.

---

## ADR-001 — Delivery stack: React+Vite / Hono+tRPC / Drizzle+MySQL / local durable runner / typed agent framework

**Status:** Accepted
**Deciders:** Architecture workstream
**Date:** 2026-08-02

### Context

Spec §7 suggests Next.js + FastAPI (Python 3.12) + Temporal workers + PostgreSQL/RLS + LangGraph + pgvector/OpenSearch. The delivery platform mandates and operationally proves a different full-stack composition. We must weigh spec fidelity against (a) end-to-end type safety, (b) single-language contracts, (c) platform-managed database and hosting, and (d) the requirement that the repository actually run with one command in this environment.

### Decision

| Spec §7 suggestion | Delivered | Location |
|---|---|---|
| Next.js (`apps/web`) | React 19 + Vite + TypeScript SPA | `src/` |
| FastAPI / Python (`apps/api`) | Hono + tRPC 11, TypeScript | `api/` |
| PostgreSQL + RLS | MySQL + Drizzle ORM | `db/` (`db/schema.ts`) |
| Temporal workers (`apps/worker`) | Event-sourced durable runner | `api/workflows/` |
| LangGraph (`packages/agents`) | Typed agent framework, one contract for all 20 agents | `api/agents/` |
| pgvector / OpenSearch | Interface only, **not connected** (truthful status) | `api/integrations/` |
| Docker Compose / Terraform | Platform-managed runtime; Terraform is roadmap | `docs/roadmap.md` |

Monorepo mapping retained for contract purposes: `apps/web → src/`, `apps/api → api/`, `packages/domain → contracts/`, `packages/policy → api/policy/`, `packages/agents → api/agents/`, `packages/integrations → api/integrations/`, `packages/evals → evals/`, docs → `docs/`.

### Rationale

1. **End-to-end type safety.** tRPC 11 + shared zod schemas in `contracts/` give compile-time guarantees across the exact boundaries spec §7 hardens with "strict Pydantic or JSON schemas" — same intent, enforced in one language with zero code generation drift.
2. **Single-language contracts.** One TypeScript domain model (`db/schema.ts` + `contracts/`) removes the Python/TS schema-duplication failure mode (divergent validation rules between FastAPI and the web app).
3. **Platform-managed database.** MySQL is the managed, backed-up, Canada-region-capable datastore provided by the delivery platform. PostgreSQL RLS is replaced by application-enforced tenant isolation — see ADR-002 for the honest trade-off and tests.
4. **Runnable in this environment.** Temporal server, LangGraph, and pgvector cannot be provisioned here. Interface-compatible local implementations (ADR-003, agent contract in `api/agents/types.ts`) keep the architecture honest and the swap path short, rather than shipping non-running scaffolding.
5. **Agent contract fidelity.** The binding `AgentResult<T>` interface (typed result, confidence, evidenceIds, assumptions, unresolvedConflicts, proposedAction, riskClass, autonomyLevel, requiresHumanApproval, rationale without chain-of-thought, model/prompt versions) satisfies spec §8 exactly, without requiring a graph runtime.

### Consequences

- **Positive:** one language; compile-time API contracts; deterministic, reproducible demo; smaller operational surface; the full spec §15 Definition of Done is achievable locally.
- **Negative:** two proven ecosystem components (Temporal, Postgres RLS) are substituted; MySQL has no RLS, so isolation correctness rests on the data-access layer and its tests (ADR-002); the durable runner is younger than Temporal (ADR-003); retrieval (pgvector) is deferred to the roadmap.
- **Agent wiring status (stated honestly):** all 20 agent cores exist in `api/agents/` and satisfy the binding `AgentResult<T>` contract (20/20 contract-valid, all covered by tests and/or evals). **Three are wired into production call paths:** ConversationalLead (`api/routers/conversations.ts:11`), OfferExtraction (`api/routers/offers.ts:10` + `db/seed.ts`), TransactionCoordinator (`api/routers/transactions.ts:13` — read-only health summary, no gating). The remaining **17 are contract-tested cores pending workflow wiring** (roadmap): they run in `agents.test.ts` and the eval harness, not in request paths. `AgentResult.proposedAction` currently has **no central consumer** — the three wired routers honor `requiresHumanApproval` by convention, not via a dispatcher.
- **Neutral:** Python-based ML tooling, if ever needed, would sit behind the model gateway (`api/gateway/`), not in the request path.

### Swap path (spec-conformant production)

1. **Web → Next.js:** routes map 1:1 from `src/pages/`; tRPC React hooks are portable to Next.js App Router via `@trpc/react-query`; no contract change.
2. **API → FastAPI:** zod schemas in `contracts/` are the single source; regenerate Pydantic models from the JSON Schema export; routers in `api/router.ts` map to FastAPI routers by name.
3. **DB → PostgreSQL:** Drizzle supports both dialects; `db/schema.ts` column types are portable; the `withTenant(ctx)` repository guard is replaced/augmented by RLS policies (ADR-002 hardening note).
4. **Runner → Temporal:** ADR-003 documents the activity/Workflow mapping.
5. **Agents → LangGraph:** each `api/agents/<name>.ts` deterministic core becomes a graph node; the `AgentResult<T>` envelope is already the checkpoint shape; human interrupts map to `requiresHumanApproval` → Approval Inbox.

---

## ADR-002 — Application-enforced tenant isolation on MySQL

**Status:** Accepted (with production-hardening obligation)
**Deciders:** Architecture + Security workstreams
**Date:** 2026-08-02

### Context

Spec §7/§11 require "tenant row-level security." PostgreSQL RLS enforces isolation inside the database, so even a buggy query cannot leak across tenants. The delivered datastore is MySQL (platform-managed), which has no RLS equivalent.

### Decision

Tenant isolation is enforced in the **data-access layer**:

1. Every business table in `db/schema.ts` carries a non-nullable `tenantId`.
2. All reads/writes go through scoped repository helpers; a `withTenant(ctx)` guard injects the tenant predicate and **rejects any query constructed without a tenant context** — there is no unscoped query path in `api/`.
3. Object-level authorization middleware in `api/router.ts` re-checks that the target row's `tenantId` equals the caller's tenant before returning or mutating.
4. FINTRAC artifacts are further restricted: STR queue and related records are visible only to role `fintrac_officer` (anti-tipping-off, rule FIN-07) — a second authorization axis beyond tenant.
5. The append-only `audit_log` is hash-chained (`prevHash`/`hash`) so cross-tenant tampering or deletion is detectable.

### Tests (mandatory, blocking)

Cross-tenant leakage tests are first-class and run in `npm run test`:

- For every router in `api/router.ts`: seed tenants A and B with identically-shaped data; assert tenant A's session cannot read, list, mutate, or infer tenant B's rows via any procedure (including ID-guessing, filter smuggling, and join traversal).
- Negative test: repository call without `withTenant(ctx)` throws.
- Eval coverage: `evals/` includes cross-tenant leakage scenarios per spec §13.

**Coverage status (honest, red-team GAP-6):** the mandate above is the release-gate policy, but it is not yet met — measured v8 coverage puts 13 of 21 tRPC routers at 0% (no test executes a line of them); cross-tenant suites currently cover the store contract and 6 router files. Closing per-router tenancy coverage is a blocking gap before any multi-tenant production claim.

### Consequences

- **Positive:** works on the managed MySQL; isolation logic is explicit, typed, and unit-testable; portable to any SQL store.
- **Negative (stated honestly):** a future code path that bypasses the repository helpers would bypass isolation. There is no database-level backstop. This is an **application-level** control, not DB-enforced RLS.

### Production hardening note (required before multi-tenant production)

1. Migrate to PostgreSQL and implement RLS policies keyed to a per-request `app.tenant_id` GUC, keeping `withTenant(ctx)` as defence-in-depth (swap path in ADR-001, item 3); **or**
2. If MySQL is retained: separate database/schema per tenant for regulated tiers, plus a CI static check that fails any raw SQL outside the repository layer, plus a runtime query auditor sampling for missing tenant predicates.
3. In both cases: quarterly cross-tenant penetration test and the existing leakage suite as a release gate.

---

## ADR-003 — Event-sourced outbox workflow runner instead of Temporal

**Status:** Accepted
**Deciders:** Architecture workstream
**Date:** 2026-08-02

### Context

Spec §7 mandates Temporal for durable business processes: journeys must "survive outages, worker restarts, duplicate webhooks, API failures, and long pauses without duplicating actions" (spec §4). A Temporal server cannot be provisioned in this environment.

### Decision

Implement a durable runner in `api/workflows/` with Temporal-shaped semantics:

- **Tables (Drizzle, `db/schema.ts`):** `workflows(kind, subjectId, status, currentStep, state, version)`, `workflow_events(workflowId, seq, type, payload, createdAt)` (append-only), `outbox(id, idempotencyKey UNIQUE, action, payload, status[pending|sent|failed], attempts, lastError)`.
- **Pure steps:** workflow steps are pure transition functions `(state, event) → state'`; no step performs I/O.
- **Side effects only via outbox:** a step emits an outbox record; a **drainer** process delivers it — and every delivery passes the commit-time policy gate (`api/policy/engine.ts`) fresh at send time (ADR-005).
- **Resume:** restart = replay `workflow_events` → rebuild state → resume from `currentStep`. Unique `idempotencyKey` on the outbox guarantees at-most-once external effect even across duplicate webhooks and redeliveries.

### Verification

- Kill a worker mid-workflow, restart, assert resume with **zero duplicate actions** (also scripted in `docs/demo-script.md`).
- Duplicate webhook delivery test: second delivery is deduped by `idempotencyKey`.
- Policy-gate interplay test: an outbox item whose consent has expired between enqueue and drain is **blocked at drain time**, proving the check is commit-time, not enqueue-time.

### Consequences

- **Positive:** the durability, idempotency, and resume guarantees spec §4 demands are demonstrably real in this build; semantics are a deliberate subset of Temporal's, so the mental model transfers.
- **Negative:** no Temporal visibility UI, no built-in cron/activity retry tuning beyond the drainer's `attempts`/`lastError`, and the runner has far less production mileage than Temporal.

### Swap path to Temporal (documented)

| Local concept | Temporal equivalent |
|---|---|
| `workflows` row + `workflow_events` replay | Workflow Execution + Event History |
| Pure transition step | Workflow function (deterministic) |
| Outbox record | Activity invocation with `ActivityOptions.RetryPolicy` |
| `idempotencyKey` (unique) | Activity idempotency key / `WorkflowIdReusePolicy` |
| Drainer through policy gate | Activity worker wrapping side effects (gate retained unchanged) |
| `requiresHumanApproval` pause | `await condition` / signal from Approval Inbox |

Because all side effects already flow through one outbox→gate→drain path, only the scheduling/durability substrate changes on swap; business logic, the policy gate, and the audit chain are untouched.

---

## ADR-004 — Deterministic mock model provider as the default model gateway

**Status:** Accepted
**Deciders:** Architecture + Evals workstreams
**Date:** 2026-08-02

### Context

Spec §7/§10 require "Kimi K3 behind an OpenAI-compatible model gateway" with provider abstraction for Canada-hosted/self-hosted inference. No live model credentials exist in this environment. Spec §15 requires truthful status: "Never pretend a mocked integration is live."

### Decision

`api/gateway/` ships two providers behind one abstraction:

1. **`MockDeterministicProvider` (default).** Deterministic, seeded, reproducible responses. Every call is recorded in `model_calls` with `modelVersion: "mock-deterministic-1"` — honestly labeled everywhere, including the UI integration status (`integrations.status = "mock"` with `truthfulNote`).
2. **`OpenAICompatibleProvider` (configurable).** Any OpenAI-compatible endpoint — Kimi K3, a Canada-hosted provider, or self-hosted — via env (`MODEL_GATEWAY_BASE_URL`, `MODEL_GATEWAY_API_KEY`, `MODEL_GATEWAY_MODEL`; see `docs/deployment-guide.md`).

Crucially, **all gateway controls wrap both providers**: PII redaction and high-sensitivity tokenization before send; sensitivity routing; structured-output enforcement (zod); evidence-required flag; prompt-injection and exfiltration scanning; tool allowlists; per-call token and cost caps; model+prompt version recording to `model_calls`; provider training opt-out flag; a single deterministic fallback on provider failure. Stated honestly: call duration is measured and recorded but not capped, and there is no retry loop (one fallback, not bounded retries). The untrusted-content boundary (retrieved text/documents/messages are data, never instructions — delimiters + injection scan) is enforced in the gateway, not in prompts.

### Rationale

1. **Reproducible evals.** `evals/` golden scenarios and the seller-conversation simulator must be deterministic to produce meaningful pass rates in `evals/report.md`; a live model would make CI results nondeterministic.
2. **Truthful status.** Recording `mock-deterministic-1` makes it impossible to mistake demo behaviour for live-model capability (spec §15).
3. **Control realism.** Because the full control stack wraps the mock, swapping in a live provider changes capability, not compliance posture — the PII, injection, exfiltration, allowlist, and cap tests already exercise the real enforcement points.

### Consequences

- **Positive:** deterministic CI/evals; zero model cost by default (`docs/cost-model.md`); honest demo; provider swap is configuration, not code.
- **Negative (stated honestly):** demo language quality and extraction nuance are deterministic-fixture quality, not live-LLM quality. Eval pass rates measure the pipeline and controls, not frontier-model capability. Residual-risk report (`docs/residual-risk-template.md`) carries this as a known limitation.

---

## ADR-005 — Fail-closed commit-time policy gate as the ONLY side-effect path

**Status:** Accepted
**Deciders:** Architecture + Compliance workstreams
**Date:** 2026-08-02

### Context

Spec §5 demands that "every external side effect must pass a fresh commit-time policy check" and that the system "fail closed whenever authority or evidence is missing, stale, conflicting, or ambiguous." Autonomous agents that can send messages, book appointments, or publish content make a single enforcement point a hard architectural requirement — anything else leaves bypass paths.

### Decision

`api/policy/engine.ts` exposes `evaluateAction(ctx, action) → PolicyDecision` and is the **only** path through which any external side effect can occur:

1. **Structural enforcement.** Agents never perform I/O. An agent returns `proposedAction` in its `AgentResult<T>`; execution happens only when (a) a human approves in the Approval Inbox producing a payload-bound `approvals` row (`payloadHash` + `destination`), and/or (b) the workflow runner enqueues an outbox record. The outbox drainer calls `evaluateAction` **fresh at drain time** for every item — never at enqueue, never cached.
2. **Checks per evaluation:** tenant, actor, role/authorization, jurisdiction, brokerage policy, consent basis + expiry, suppression status, permitted purpose, approval freshness (≤ configured TTL), data freshness, exact payload+destination binding (hash match against the approved payload), budget/frequency limits, idempotency key, required audit fields.
3. **Fail closed.** Missing, stale, conflicting, or ambiguous authority or evidence ⇒ `verdict: "block"` (or `"escalate"` where the pack requires a human). An unreachable policy engine ⇒ no drain. There is no "warn and proceed" mode.
4. **Versioned packs.** Rules live in `api/policy/packs/on.ts` (Ontario production pack — versioned, each rule carrying source, dates, owner, control, test scenarios, escalation per spec §6) with `api/policy/packs/types.ts` as the province-policy schema. BC/AB/QC are schema-valid fixtures explicitly marked non-production.
5. **Audit.** Every decision writes a `policy_decisions` row and every executed action writes a hash-chained `audit_log` entry linking `policyDecisionId`, `payloadHash`, `modelVersion`, and `promptVersion`.

### Consequences

- **Positive:** one choke point to test, audit, and reason about; stale approvals and consent-expiry races are caught at commit time by construction; autonomy levels A0–A4 are enforced as data (`AgentResult.autonomyLevel` vs. tenant autonomy settings), not convention.
- **Negative:** the drainer is latency-bound by policy evaluation (acceptable: evaluations are indexed lookups, not model calls); any bug in `engine.ts` is high-blast-radius — mitigated by the policy test suite (executable decision tests covering ~13 rule IDs, plus pack scenario metadata validated for all 44 rules — see `docs/compliance-control-matrix.md`) and the fail-closed default, which biases bugs toward blocks, not leaks.
- **Operational posture:** if the policy gate itself is down, outbound side effects stop (fail closed) — see `docs/operations-runbooks.md` for the approved posture and `docs/incident-runbooks.md` for severity classification.
