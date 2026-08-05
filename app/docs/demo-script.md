# Demo Script — Northstar SellerOS (15-minute reviewer walkthrough)

Hits every spec §15 Definition-of-Done item in order. Seeded cast (from `db/seed.ts`, tenant **Harbourline Realty Inc., Brokerage**, Ontario): **Maya Chen** — listing salesperson; **Nadia & Marc Pelletier** — sellers of **DEMO-ON-PROPERTY-001** (their property dossier is the demo anchor); **Jonah Whitfield** — buyer lead (one conversation seeded with an implied-consent-expiry trap for the blocked-CASL moment). **Data provenance: all seed, test, and demo data is fictional (Harbourline Realty universe). No real consumer, property, identity, document, contact, or transaction data is used or referenced anywhere in this system** (ASSUMPTIONS #9). Reset state anytime with `npm run db:seed:reset`.

**DoD checklist:** ☐ clone ☐ env ☐ one command ☐ open app ☐ seeded login ☐ seller→appointment ☐ grounded dossier ☐ uncertainty/evidence ☐ approve campaign ☐ compliant mock message ☐ upload offers ☐ compare terms ☐ worker restart ☐ resume w/o duplicates ☐ policy decisions ☐ audit trail ☐ full test suite.

## 0 — Setup (2 min)

```bash
git clone <repo> && cd <repo>
cp .env.example .env        # only DATABASE_URL/OAuth are portal-provided; defaults work
npm install && npm run db:push && npm run db:seed && npm run dev
```
(`db:push` is one-shot on a fresh database — it is NOT idempotent on TiDB and must never be re-run against data you care about; see `docs/deployment-guide.md` §1.)
One command sequence — no Docker, no Temporal, no Python (`docs/deployment-guide.md` §1). Open the app. **✔ DoD: clone, env, one command, open app.**

## 1 — Seeded login (1 min)

Sign in via the platform OAuth. First login auto-provisions into **Harbourline Realty Inc., Brokerage** — choose the **Maya Chen (salesperson)** demo role. Note the in-UI label: demo impersonation, not production identity (ASSUMPTIONS #3). Switch the top-bar language EN → fr-CA and back to show bilingual chrome (parity-tested). **✔ DoD: seeded login.**

## 2 — Seller lead → appointment (3 min)

1. Open the **Seller Pipeline** (`/pipeline`): the Pelletiers sit at *New lead*. Open their **Seller 360** (`/sellers/:id`).
2. Show what intake captured: lead source, preferred name, language, relationship to property, motivation ("downsizing"), timing, occupancy, renovations, communication preferences — and the **per-channel consent evidence** (email: express; SMS: implied from inquiry with an expiry date rendered honestly).
3. Point at the **lead score with explanation** (`leadScoreReasons` — every point attributable), the recommended next action, and the concise agent briefing.
4. Show the AI disclosure on the conversation timeline and the one-click **transfer to human**.
5. Book the listing consultation (Scheduling agent action): note the action card shows its required autonomy level (A2) and the policy checks that passed. Maya's calendar (MockCalendarProvider, labeled MOCK) shows the appointment. **✔ DoD: seller→appointment journey.**

## 3 — Grounded dossier, uncertainty, evidence (3 min)

1. Open **DEMO-ON-PROPERTY-001 → Property Dossier** (`/properties/:id`).
2. Walk the evidence-visual-language: verified facts (solid chips), third-party mock-feed data (slate, with freshness indicator from MockListingDataProvider), estimates (amber), one **assumption** (dashed), one **missing-information** chip, and one seeded **contradiction** (e.g., sqft mismatch between sources).
3. Expand a "Why this?" evidence drawer on a material statement: source name, source ref, freshness, confidence, lineage.
4. Comparable set: selection reasoning + adjustments per comp. Valuation: low/mid/high with **confidence interval, assumptions, and the disclaimer** — "agent decision support, not an appraisal."
5. Missing-info list → the agent questions the dossier proposes Maya ask at consultation. **✔ DoD: grounded dossier, uncertainty & evidence.**

## 4 — Strategy → approval → compliant mock send (2.5 min)

1. Open the proposed **listing strategy** for DEMO-ON-PROPERTY-001 (positioning, prep work, media plan, launch sequence, comms plan).
2. Go to the **Approval Inbox** (`/approvals`): the campaign approval item shows the **exact payload diff, destination, policy checks passed, and freshness TTL**. Approve with a reason.
3. The workflow enqueues the first campaign message; the drainer re-evaluates at send time (commit-time gate). Open the mock send log: the message went via **MockCommsProvider — labeled MOCK** — a send recorder proving the gate allowed it (consent, suppression, payload-binding checks all passed). Say honestly: what the gate enforced here is consent basis, suppression state, and payload binding; the sender-identification footer and one-click unsubscribe are **not yet rendered message features** — they land with the live provider swap (CASL-05 is `declared` in `docs/compliance-control-matrix.md`); the mock records sends, it does not format email. **✔ DoD: approve campaign, compliant mock-provider message.**
4. **The blocked CASL send (30 seconds, the compliance punchline):** open **Jonah Whitfield's** Seller 360 — his implied SMS consent (6-month inquiry window, CASL-03) expired. Attempt the campaign send to Jonah (or show the pre-seeded attempt): the gate **blocks** it, the policy decision renders "implied consent expired — no express basis," and Jonah is routed to a re-confirmation flow instead. Nothing sent. This is fail-closed, commit-time enforcement — not a UI warning.

## 5 — Offer room (2 min)

1. Go to the **Offer Comparison Room** (`/offers`). Upload the two seeded sample offer PDFs for DEMO-ON-PROPERTY-001 (sample files in the repo seed assets).
2. OfferExtraction fills the side-by-side term grid: price, deposit, completion/possession dates, irrevocability, conditions (financing, inspection), inclusions — **every cell cites source page and section**, with confidence and flags (one offer has a seeded missing-signature flag and an unusual clause).
3. Show the "questions for your licensed agent" panel and the banner: the system never submits/accepts/rejects/counters — those are A4 human-only acts. **✔ DoD: upload offers, compare extracted terms.**

## 6 — Worker restart → resume without duplicates (2 min) — *the moment*

1. An accepted offer exists → the **Transaction Timeline** (`/transactions/:id`) shows a running coordination workflow (conditions, deadline calendar, lawyer handoff tasks).
2. In the terminal: **kill the dev process mid-workflow** (`Ctrl+C`). Note the workflow's `currentStep` (visible in the UI before, or `SELECT currentStep FROM workflows`).
3. Restart: `npm run dev`. The runner replays `workflow_events`, rebuilds state, and resumes.
4. Show: the workflow advances; the outbox contains no duplicate sends (`idempotencyKey` unique); provider/mock log confirms each effect happened exactly once. Narrate: "duplicate webhooks get the same treatment — dedupe by idempotency key." **✔ DoD: stop/restart worker, resume without duplicate actions.**

## 7 — Policy decisions & audit trail (1 min)

1. **Compliance Dashboard** (`/compliance`): the `policy_decisions` log — the approved campaign send, Jonah's blocked send (verdict `block`, rule CASL-03, reasons), each with actor, ruleIds, and timestamps. FINTRAC queue is visibly restricted (Maya's role sees the door, not the contents — anti-tipping-off).
2. **Audit Explorer** (`/audit`): filter to DEMO-ON-PROPERTY-001 — every mutation shows actor, role, action, `payloadHash`, `policyDecisionId`, `modelVersion: mock-deterministic-1` (honest), `promptVersion`, and the hash chain. **✔ DoD: inspect policy decisions, audit trail.**

## 8 — Test suite (30 seconds to launch; runs in background)

```bash
npm run test     # unit + policy (executable decision tests, ~13 rule IDs) + security + i18n parity + API
npm run evals    # ≥100 golden scenarios + seller-conversation simulator → evals/report.md
```
Show the green run (pre-recorded CI output acceptable if time-constrained) and `evals/report.md`: exact counts, pass rates, representative failures, limitations. **✔ DoD: full test suite.**

## Truthful-status reminders for the reviewer (say these out loud)

- Model provider is **mock-deterministic** by default (ADR-004); a live OpenAI-compatible endpoint (Kimi K3 / Canada-hosted) is env-configured, and evals must be re-run after swap.
- Listing data is **mock** (RESO-aligned, cursors, provenance); REALTOR.ca DDF/MLS adapter is interface + contract tests, status `not_connected` — onboarding path: `docs/licensed-data-onboarding.md`.
- Tenant isolation is **application-enforced** on MySQL with mandatory leakage tests (ADR-002); Postgres RLS is the documented production hardening.
- The software **does not guarantee legal compliance**; counsel review is required (`docs/legal-review-checklist.md`).
