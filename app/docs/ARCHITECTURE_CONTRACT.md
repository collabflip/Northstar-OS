# Northstar SellerOS — Architecture Contract (v1.0, binding)

One architecture contract, one domain model, one coordinated backlog. No workstream may invent a conflicting schema or interface. This document owns contracts.

## ADR-001 — Stack (justified deviation from spec §7 suggestion)

Spec suggests Next.js + FastAPI + Temporal + Postgres/LangGraph. Delivery platform mandates its proven full-stack composition; per spec §7 ("unless rigorous research supports a better alternative") we adopt:

| Spec suggestion | Delivered | Why |
|---|---|---|
| Next.js | React 19 + Vite + TS (`src/`) | Platform-proven SPA, Hono serves SPA fallback |
| FastAPI | Hono + tRPC 11 (`api/`) | End-to-end type safety, single-language contracts |
| PostgreSQL + RLS | MySQL + Drizzle (`db/`) | Platform-managed DB. **Tenant isolation enforced in the data-access layer** (every query scoped by `tenantId` via a repository helper + cross-tenant leakage tests) — documented honestly as app-level isolation, not DB RLS |
| Temporal | `api/workflows/` durable runner | Outbox + idempotency keys + event-sourced resume; Temporal-shaped interface, swap documented |
| LangGraph | `api/agents/` typed agent framework | All 20 spec agents implemented to one contract; deterministic cores + model-gateway LLM interface. **Runtime wiring: 3 of 20** (ConversationalLead, OfferExtraction, TransactionCoordinator); the rest are contract-tested cores pending workflow wiring (roadmap) |
| pgvector/OpenSearch | interface only, not connected | truthful status |

Monorepo mapping: `apps/web→src/`, `apps/api→api/`, `packages/domain→contracts/`, `packages/policy→api/policy/`, `packages/agents→api/agents/`, `packages/integrations→api/integrations/`, `packages/evals→evals/`, docs→`docs/`.

## Tenancy & roles

- Every business table carries `tenantId`. All reads/writes go through scoped repository helpers; a `withTenant(ctx)` guard rejects cross-tenant access. Cross-tenant leakage tests are mandatory.
- Roles (RBAC + object-level checks): `solo_registrant`, `team_member`, `brokerage_admin`, `broker_of_record`, `marketing_coordinator`, `transaction_coordinator`, `privacy_admin`, `fintrac_officer`, plus external `seller`, `buyer_lead`, `srp` (self-represented, restricted assistance).
- Auth: Kimi OAuth (platform). First login auto-provisions into the seeded demo tenant **Harbourline Realty Inc., Brokerage** with a chosen demo role (honest demo impersonation, labeled in UI). MFA-ready note documented.

## Domain model (Drizzle tables — `db/schema.ts`)

`tenants`, `users`, `memberships(userId, tenantId, role)`,
`contacts(identity, preferredName, language, leadSource, relationshipToProperty, motivation, timing, occupancy, renovations, commPrefs, mortgageContextNote, leadScore, leadScoreReasons json, stage)`,
`consent_records(contactId, channel, basis[express|implied|none], evidenceText, source, capturedAt, expiresAt, status)`,
`suppression_list(contactId, channel, reason, createdAt)`,
`properties(address fields, city, province, postal, type, beds, baths, sqft, lot, yearBuilt, ownershipConfirmed, ownerContactId)`,
`evidence(id, subjectType, subjectId, kind[verified|third_party|estimate|generated|assumption], statement, sourceName, sourceRef, pageRef, freshness, confidence, lineage json)`,
`dossiers(propertyId, profile json, timeline json, marketContext json, contradictions json, missingInfo json, agentQuestions json, status)`,
`comparables(dossierId, address, soldPrice, soldDate, beds, baths, sqft, distanceKm, relevanceScore, selectionReasoning, adjustments json)`,
`valuations(dossierId, low, mid, high, confidenceInterval, assumptions json, rationale, disclaimer)`,
`strategies(propertyId, positioning json, prepWork json, mediaPlan json, launchSequence json, commsPlan json, showingStrategy json, timeline json, status)`,
`approvals(id, tenantId, kind, payload json, payloadHash, destination, policyDecisionId, requestedBy, status[pending|approved|rejected], decidedBy, decidedAt, reason, expiresAt)`,
`campaigns(name, audience json, contentFamily, budgetCap, frequencyCap, schedule json, channels json, autonomyLevel, status)`, `campaign_messages(campaignId, contactId, channel, body, status, idempotencyKey)`,
`conversations(contactId, channel, status, assignedTo)`, `messages(conversationId, direction, body, groundedEvidenceIds json, aiDisclosed, escalation json, status)`,
`offers(propertyId, fileName, status)`, `offer_terms(offerId, field, value, sourcePage, sourceSection, confidence, flag)`, `offer_comparisons`,
`transactions(propertyId, acceptedOfferId, status)`, `transaction_tasks(transactionId, kind, title, dueAt, ownerRole, status, completedAt)`,
`workflows(kind, subjectId, status, currentStep, state json, version)`, `workflow_events(workflowId, seq, type, payload json, createdAt)`, `outbox(id, idempotencyKey unique, action, payload json, status[pending|sent|failed], attempts, lastError)`,
`audit_log(seq, tenantId, actorId, actorRole, action, subjectType, subjectId, payloadHash, policyDecisionId, modelVersion, promptVersion, prevHash, hash, createdAt)` — append-only hash chain,
`policy_packs(jurisdiction, version, effectiveDate, reviewDate, owner, status)`, `policy_rules(packId, ruleId, sourceName, sourceUrl, requirement, control json, testScenarios json, escalationPath)`,
`policy_decisions(ruleIds json, action, actor, verdict[allow|block|escalate], reasons json, createdAt)`,
`integrations(name, kind, status[mock|sandbox|connected|degraded], truthfulNote, config json)`,
`model_calls(provider, model, promptVersion, tokensIn, tokensOut, costCents, sensitivity, piiRedacted, createdAt)`,
`i18n handled in code (contracts/i18n)`, `seeded demo data via db/seed.ts`.

## Agent contract (`api/agents/types.ts` — binding)

```ts
export type AutonomyLevel = "A0"|"A1"|"A2"|"A3"|"A4";
export type RiskClass = "low"|"medium"|"high"|"regulated";
export interface AgentResult<T> {
  result: T;                      // typed per agent (zod schema)
  confidence: number;             // 0..1
  evidenceIds: string[];
  assumptions: string[];
  unresolvedConflicts: string[];
  proposedAction: { kind: string; payload: unknown; destination?: string } | null;
  riskClass: RiskClass;
  autonomyLevel: AutonomyLevel;   // minimum level required for proposedAction
  requiresHumanApproval: boolean; // true ⇒ routed to Approval Inbox, never executed inline
  rationale: string;              // concise decision rationale — NO chain-of-thought
  modelVersion: string; promptVersion: string;
}
```
The 20 spec agents (IntakeRouter, ConsentResolver, ContactIdentityResolver, SellerDiscovery, PropertyDossier, MarketIntelligence, ComparableSelection, ValuationSupport, ListingStrategist, ContentBrand, MediaQA, CampaignPlanner, ConversationalLead, Scheduling, BuyerMatch, OfferExtraction, TransactionCoordinator, ComplianceSentinel, PrivacyRetention, QualityJudge) each live in `api/agents/<name>.ts` with a zod-typed result. Deterministic/heuristic cores; LLM via model gateway only. **Wiring status:** 3 have production call sites (ConversationalLead → conversations router, OfferExtraction → offers router + seed, TransactionCoordinator → transactions router, read-only); 17 are contract-tested cores exercised by tests/evals only, with workflow wiring on the roadmap; `AgentResult.proposedAction` has no central consumer yet.

## Policy kernel (`api/policy/`)

- `engine.ts`: `evaluateAction(ctx, action) → PolicyDecision` — commit-time gate run **fresh before every external side effect**, validating: tenant, actor, role/authorization, jurisdiction, brokerage policy, consent, suppression, purpose, approval freshness (≤ configured TTL), data freshness, exact payload+destination binding (hash match), budget/frequency limits, idempotency key, audit fields. **Fail closed** on missing/stale/conflicting/ambiguous authority or evidence.
- `packs/on.ts`: Ontario production pack (versioned rules from compliance research, each with source, dates, owner, control, tests, escalation). `packs/types.ts` = province-policy schema; BC/AB/QC as fixture stubs with truthful "not production" status.
- Controls implemented: CASL CEM classification + consent basis + unsubscribe + expiry + suppression + evidence retention; DNCL flag + calling-hours window check; PIPEDA purpose limitation/minimization/retention/breach flags; FINTRAC routing (IDV task, receipt-of-funds record, third-party determination, PEP/HIO review, STR escalation queue, anti-tipping-off: FINTRAC queue visible only to `fintrac_officer`); TRESA/RECO (SRP restricted assistance, advertising identification, offer presentation duties, AI disclosure + human escalation); human-rights guardrail (block targeting/scoring on prohibited grounds; steering detector in evals).
- Disclaimer surfaces in UI + docs: software does not guarantee legal compliance; brokerage counsel review required.

## Durable execution (`api/workflows/`)

Event-sourced runner: `workflows` + `workflow_events` (append-only) + `outbox` (unique `idempotencyKey`). Steps are pure transition functions; side effects only via outbox; a drainer sends through the commit-time policy gate. Restart = replay events → rebuild state → resume; outbox dedupe guarantees no duplicate sends. Test: kill mid-workflow, restart, assert resume with zero duplicate actions; duplicate webhook test.

## Model gateway (`api/gateway/`)

Provider abstraction: `MockDeterministicProvider` (default, truthful), `OpenAICompatibleProvider` (config: base URL/model/key — Kimi K3 or Canada-hosted/self-hosted). Controls: PII redaction + high-sensitivity tokenization before send; sensitivity routing; structured output enforcement (zod); evidence-required flag; prompt-injection & exfiltration scan; tool allowlist; **per-call token and cost caps** (`CAPS.maxTokens` / `CAPS.maxCostCentsPerCall`, overridable per request downward); model+prompt version recording to `model_calls`; provider training opt-out flag; a single deterministic fallback on provider failure. Honest limits: call duration is measured and recorded (`durationMs`) but **not capped**, and there is **no retry loop** — the failure path is one fallback, not bounded retries. Untrusted-content boundary: retrieved text/documents/messages are data, never instructions (delimiter + injection scan).
**Never in model context:** lockbox/alarm codes, personal schedules, identity documents, security instructions (exclusion enforced + tested).

**Gateway status (honest, red-team ARCH-4):** the gateway is a **pre-integration scaffold** — its controls are implemented and test-covered, but no production code path calls it yet (agents are deterministic cores; no router imports `api/gateway/`). It activates when a live provider is wired through it.

## API surface (`api/router.ts`)

Routers: `dashboard`, `pipeline`, `contacts`, `consents`, `properties`, `dossiers`, `valuations`, `strategies`, `approvals`, `campaigns`, `conversations`, `offers`, `transactions`, `workflows`, `compliance`, `audit`, `policy`, `settings`, `portal`, `integrations`, `evals`. Zod-validated inputs; tenant-scoped; object-level authorization middleware; every mutation writes `audit_log`.

## i18n

`contracts/i18n/en.ts` + `fr.ts` string catalogs; `useT()` hook; language in top bar (EN / fr-CA); parity test (every key exists in both).

## Integrations (truthful status always)

- `MockCommsProvider` (email/SMS send → outbox, logged, labeled MOCK), `MockListingDataProvider` (RESO-aligned seed listings, sync cursor, field-level provenance, freshness indicator), `MockCalendarProvider`. REALTOR.ca DDF/MLS: adapter interface + contract tests + `status: "not_connected"` with onboarding checklist. Never pretend mock = live.

## Tests (`npm run test` + `evals/`)

Unit (policy engine, agents, workflow runner, gateway controls), policy tests (executable decision tests for ~13 rule IDs; every Ontario rule declares scenario metadata validated by the pack schema test — per-rule enforcement status in `docs/compliance-control-matrix.md`), security tests (cross-tenant, injection, exfiltration, stale approval, duplicate webhook, restart-resume), i18n parity, API integration. `evals/`: golden scenarios (≥100 generated across spec §13 categories) + seller-conversation simulator + report generator (`evals/report.md` with pass rates, failures, corrections, limitations).

## Definition of done (from spec §15) — the reviewer can:
start with one command, log in, run seller→appointment journey, view grounded dossier with uncertainty/evidence, approve a campaign, observe compliant mock-provider message, upload sample offers, compare extracted terms, restart worker → resume without duplicates, inspect policy decisions + audit trail, run full test suite green.
