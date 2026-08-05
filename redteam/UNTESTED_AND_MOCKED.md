# Untested or Mocked — the honest list (2026-08-03, commit 66c5d2b)

Per the engagement rule: **nothing mocked is represented as live, anywhere.** This file is the single source of truth for what is NOT battle-proven.

## Mocked / interface-only (never claimed as live)

| Component | Reality | Where the truth is stated |
|---|---|---|
| Email/SMS comms | `MockCommsProvider` — records sends, delivers nothing | code naming, docs, this file |
| Calendar | mock adapter | docs/licensed-data-onboarding.md |
| Listing data / CREA DDF | interface + fixture data only; no live feed | docs/licensed-data-onboarding.md |
| Model gateway | **MockDeterministicProvider is the default**; agents are deterministic regex/rule cores, NOT an LLM. OpenAI-compatible provider exists but is unconfigured/untested live (`model_calls` = 0 in prod paths) | README, ADR-004, docs (corrected COMP-8) |
| List-unsubscribe / CASL footer rendering | declared, not implemented in the mock footer | matrix (CASL-05 declared) |
| Retrieval (pgvector/OpenSearch) | interface only, not connected | ARCHITECTURE_CONTRACT ADR-001 |
| Malware scanning (uploads) | hook only; threat-model C6 marked **declared (no implementing code)** | docs/threat-model.md |
| SSRF egress allowlist | threat-model C5 marked **declared**; no outbound calls exist today | docs/threat-model.md |

## Evaluated but not live-proven

| Area | What IS proven | What is NOT |
|---|---|---|
| Policy engine / 20 agent cores | 131 golden scenarios + 248 tests on deterministic cores | Behavior with a real LLM provider — **all agent-safety mitigations must be re-validated on provider swap** (residual L2) |
| 17 of 20 agents | AgentResult contract validation + unit tests | Production wiring — they have **no call sites** (3 wired: ConversationalLead, OfferExtraction, TransactionCoordinator; `proposedAction` has no consumers) — docs now state this (COMP-6) |
| Tenant isolation | 22 live attacks + tenancy suites at the application layer | No DB-level RLS backstop (MySQL) — a future code path bypassing repository helpers could leak (residual L1) |
| Audit chain | Row-tamper detection verified live per tenant | **Tail truncation is NOT detected** (SEC-8, accepted residual) |
| JWT sessions | Forgery classes rejected, 7-day TTL | No revocation store (SEC-9, accepted residual) |
| Ontario policy pack (43 rules) | 16 enforced / 12 partial / 16 declared — engine-tested | **Legal correctness — pack is engineering-grade, NOT legal advice**; counsel VERIFY items outstanding (docs/legal-review-checklist.md) |
| BC/AB/QC packs | schema-valid fixtures; gate fails closed | Anything non-Ontario in production |
| Coverage | api/** ~68% lines; workflows router now e2e-covered | **13/21 routers still have ~0% direct coverage** (GAP-6 partially addressed) |
| Load/concurrency | single-tenant functional concurrency tests (DB-7) | No multi-tenant load test; one known parallel-test flake (C-5 residual) |
| CI | config added | **No CI run has executed yet** |
| i18n | EN/fr-CA parity via eval category (4/4) | No dedicated Vitest i18n suite; fr-CA content quality unreviewed by a human |
| Real document extraction (PDFs) | pipeline + fixtures | Sample PDFs are NOT shipped; extraction quality is fixture-quality |
| Deployment | platform preview (version b9c9858) + server-boot smoke test | No external production deploy; db:push non-idempotent (documented); no migration tooling (db:push-only, declared) |

## Data provenance (consent compliance)

All seed/test/demo data is fictional (Harbourline Realty universe: `@harbourline.example`, `@example.ca`). **No real consumer, property, identity, document, contact, or transaction data exists anywhere in this system.** A prior strategic reference to a real property sale was removed from all documentation on 2026-08-03 after the property owner declined consent; a full-tree scan confirmed no other occurrences.
