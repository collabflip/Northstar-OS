# Build vs. Buy — Northstar SellerOS

Evaluated against the three benchmark patterns from spec §1 (public product behaviours only — no proprietary implementations copied). Verdict first, framework second, buy-conditions last.

## 1. Capability comparison

| Capability | Structurely-pattern ISA | Ylopo/Raiya-pattern intent marketing | Lofty-pattern CRM | Northstar SellerOS |
|---|---|---|---|---|
| Immediate conversational response & qualification | ✅ core | partial (Raiya voice/ISA) | ✅ Smart Plans | ✅ `agents/ConversationalLead` — grounded answers only, evidence citations |
| Appointment booking / live transfer | ✅ | partial | ✅ | ✅ `agents/Scheduling` + human-transfer with AI disclosure |
| Behavioural intent signals / high-intent surfacing | partial | ✅ core | ✅ | ✅ lead score with **explainable reasons** (`contacts.leadScoreReasons`) |
| Agentic CRM, pipeline, transaction mgmt | ❌ | ❌ | ✅ core | ✅ pipeline kanban, offer room, `agents/TransactionCoordinator`, durable workflows |
| Multichannel campaigns | partial | ✅ ad tech | ✅ | ✅ bounded A3 campaigns with budget/frequency caps |
| **Seller-first journey** (dossier, valuation support, listing strategy) | ❌ | ❌ | partial | ✅ the core vertical slice (spec §4) |
| **Evidence grounding & explicit uncertainty** | ❌ | ❌ | ❌ | ✅ every material statement typed verified/third-party/estimate/generated/assumption with lineage |
| **Canadian compliance by construction** (CASL, DNCL, PIPEDA, FINTRAC, TRESA/RECO, human rights) | ❌ US-pattern (TCPA) | ❌ US-pattern | ❌ US-pattern | ✅ versioned policy packs + commit-time fail-closed gate (ADR-005) |
| **Auditability** (tamper-evident, payload-bound approvals) | ❌ | ❌ | partial | ✅ hash-chained `audit_log`, payload-hash-bound approvals |
| Bilingual EN/fr-CA | partial | ❌ | partial | ✅ UI parity-tested (`contracts/i18n/`) |
| Self-represented-party guardrails | ❌ | ❌ | ❌ | ✅ SRP role + restricted assistance (TRESA-04) |
| Data residency / Canada-hosted model routing | ❌ | ❌ | ❌ | ✅ gateway sensitivity routing, Canada-region deployment |

**Summary:** Northstar **replaces** the ISA layer (Structurely-pattern) for seller/inquiry conversations where grounded, compliant responses matter; **replaces** the CRM/transaction core (Lofty-pattern) for seller-side workflows; and **augments rather than replaces** intent-marketing ad tech (Ylopo/Raiya-pattern) — Northstar has bounded campaigns but is not a managed ad-buying platform. If paid-search/social acquisition is the priority, keep that vendor and feed its leads into Northstar's intake (consent evidence captured at intake is the integration contract).

## 2. TCO comparison framework (annual, per brokerage)

Fill with vendor quotes; structure is the deliverable.

| Cost line | Buy (benchmark-pattern stack) | Build/operate Northstar |
|---|---|---|
| Licenses / subscription | ISA $X/seat + CRM $Y/seat + intent marketing $Z/mo + ad spend | Platform infra ≈ $680–900/mo (brokerage tier, `docs/cost-model.md`) |
| Model usage | bundled (opaque) | ≈ $20–390 per 1k journeys depending on provider tier; $0 on mock |
| Compliance engineering | none provided (CASL/FINTRAC/TRESA gaps remain on you) | built-in; ongoing cost = policy-pack maintenance (semi-annual review cadence) + counsel review |
| Integration engineering | CRM↔ISA↔ad-platform glue, duplicate consent states | single consent ledger; adapters in `api/integrations/` |
| Compliance risk delta | unquantified exposure: ISA sends without CASL basis = up to $10M/violation org AMPs | gate blocks non-compliant sends by construction; residual risk documented |
| Data portability / exit | vendor lock-in, export friction | your MySQL, your audit chain, your consent ledger |
| Engineering carry (build path) | — | roadmap execution (`docs/roadmap.md`), ~1–2 engineers for hardening + pack maintenance |

**Decision rule of thumb:** below ~25 seats with no seller-side differentiation strategy, buying a benchmark CRM + being manually careful about CASL is cheaper. At brokerage scale — or wherever compliance evidence (consent ledger, policy decisions, audit chain) and seller-first dossiers are competitive assets — Northstar's single-system-of-record wins on risk-adjusted TCO.

## 3. What Northstar deliberately does NOT replace

1. **Paid acquisition / ad tech** (Ylopo/Raiya-pattern managed ads) — augment, don't rebuild.
2. **Appraisals / AVM-grade valuation** — ValuationSupport is decision support with confidence intervals, explicitly not an appraisal (spec §4).
3. **E-signature, trust accounting, conveyancing** — interfaces/handoff tasks only (`agents/TransactionCoordinator` creates lawyer handoff tasks; no funds handling — A4).
4. **Public portal search** — REALTOR.ca DDF display is an adapter with permitted-use/display-rule enforcement, not a consumer portal product.

## 4. When to buy instead

1. You need **US-market** operation (Northstar's policy kernel is Canadian; packs would need full replacement).
2. You need **buyer-acquisition ad management** more than seller-side operations — buy the intent-marketing platform, integrate via intake.
3. You cannot staff **counsel review + a compliance owner + one engineer** — Northstar's compliance controls require named human owners (escalation paths are roles, not software).
4. You need **live frontier-LLM conversational quality today at scale** — Northstar ships deterministic by default (ADR-004); the live-provider path is configuration-ready but must be re-evaluated (`npm run evals`) and counsel-reviewed before A2+ autonomy.
5. Timeline is **< 90 days to production with licensed listing data** — the DDF/MLS onboarding checklist (`docs/licensed-data-onboarding.md`) has external-party lead times no software choice can compress.

## 5. Interoperability position (if you both buy and build)

Northstar's intake contract for external ISA/ad platforms: leads arrive with source, identity, channel consents + evidence, and timestamps; `ConsentResolver` re-validates basis before any Northstar send (vendor consent claims are **not** trusted — the gate re-checks). External platforms consuming Northstar data receive suppression-list webhooks so unsubscribes propagate (CASL-06 honour-without-delay across systems).
