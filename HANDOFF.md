# Northstar SellerOS — Public Handoff

**Release line:** `rel-2` · **Commit:** see `release/MANIFEST.md` for the exact final SHA · **Date:** 2026-08-03

---

## What this is

Northstar SellerOS is a **bilingual (EN / fr-CA) demo pilot** of a Canada-native real-estate operating system. It is suitable **ONLY for supervised Ontario testing with unmistakably fictional data**: the fictional Harbourline Realty seed universe (`DEMO-ON-*` identifiers, `M0M 0M0` postal codes, `555-01XX` phone numbers, `.example` domains; fictional people such as Maya Chen, Daniel Okafor, Sofia Tremblay, Amir Haddad).

**It is not production-ready. It is not for real consumers, real properties, or real transactions.**

## Integrations — all truthful mocks, none live

- Communications (email/SMS), listing data, and the model gateway are **truthful mocks**, labelled as such in the seed data, the UI, and the docs.
- The system is **not connected** to real MLS/CREA feeds, real email/SMS providers, or any payment system. No mock is represented as live anywhere.

## Agents — honest wiring status

- **3 of 20 agent cores are wired end-to-end:** ConversationalLead, OfferExtraction, TransactionCoordinator.
- The other **17 are declared, unwired cores** behind the `AgentResult` contract (confidence, evidence, assumptions, risk class, autonomy level, rationale). They are **not faked as functional** — the UI and docs state this plainly.

## Human approval gate

Every external action passes a **human approval gate**: single-use approvals, canonical payload-hash binding between what was approved and what executes, and a full tamper-evident audit hash chain. There is no unattended autonomy over external actions.

## Where things live

- `release/` — source ZIP (`northstar-selleros-source.zip`), `MANIFEST.md` (final SHA + SHA-256), gate table, zero-secret scan, fictional-data scan, dependency audit, CI status, smoke results, residual-risk report, rotation status.
- `redteam/` — 12 independent red-team reports + errata + final score. Internal-only items are withheld and noted in place (e.g. `FINAL_GIT_DIFF.WITHHELD.md`); withheld material is retained in the internal archive, not in this delivery.
- `docs/` (inside the source ZIP) — ADRs, threat model, compliance-control matrix, deployment guide, ops runbooks, legal-review checklist, demo script, residual-risk report.
- `design/` — withheld (pre-decontamination drafts); see `design/WITHHELD.md`.

## How to run (supervised demo)

Requires **Node ≥ 22.22.0** and a MySQL-compatible database.

```bash
npm ci
npm run db:migrate
npm run db:seed    # idempotent fictional Harbourline Realty universe
npm run dev
```

Useful gates: `npm run check` · `npm run lint` · `npm run test` · `npm run evals` · `npm run build`.

## Credential status: WAITING_FOR_OWNER_ROTATION

`DATABASE_URL` and `APP_SECRET` were involved in a contained exposure incident (see `release/ROTATION_STATUS.md` — no values printed). **They must be rotated in the platform console before any supervised session.** The agent cannot perform this rotation; it is the owner's manual action. Do not run any session, demo or otherwise, until rotation is confirmed.

## Ground rules carried forward

- Never claim a mock is live. Never soften the residual-risk report.
- The Ontario policy pack is engineering-grade, **not legal advice**; counsel review items are listed in `docs/legal-review-checklist.md`.
- Tenant isolation is application-enforced; see `release/RESIDUAL_RISK.md` for the full honest list.
