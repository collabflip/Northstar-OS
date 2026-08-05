# Licensed-Data Onboarding Checklist — REALTOR.ca DDF / Board MLS

Onboarding a live listing feed into Northstar SellerOS. Today the adapter exists as an interface with contract tests and `status: "not_connected"` (truthful, per ASSUMPTIONS #4); `MockListingDataProvider` supplies RESO-aligned seed data with sync cursors, field-level provenance, and freshness indicators so every downstream control is already exercised. **Do not scrape sites, bypass access controls, or assume credentials (spec §9).** This checklist maps each onboarding requirement to the adapter interface it lands in.

## Phase 0 — Governance (before any credential request)

| # | Item | Owner | Adapter-interface mapping |
|---|---|---|---|
| 0.1 | Confirm brokerage membership in good standing with the target board/MLS (e.g., TRREB, OREA-member board, CREA member) | broker of record | `integrations.config.boardId` |
| 0.2 | Identify the correct feed product: CREA **DDF** (brokerage/member/technology variants) vs **board MLS data feed / RETS / RESO Web API** — terms differ materially | compliance + vendor mgmt | adapter `kind` field (`ddf` / `board_mls` / `reso_webapi`) |
| 0.3 | Add the data provider to the **subprocessor/vendor registry** with processing jurisdiction (PIPEDA-06) | privacy_admin | `integrations` row + subprocessor registry, `truthfulNote` |
| 0.4 | Confirm permitted-use scope against Northstar's features: dossier enrichment, comparable selection, seller-portal display, valuation support | counsel | permitted-use flags (Phase 2) |
| 0.5 | Record the review date; agreements and display rules change — treat like a policy pack (semi-annual + event-driven) | compliance | `integrations.config.reviewDate` |

## Phase 1 — Agreements & credentials

| # | Item | Owner | Mapping |
|---|---|---|---|
| 1.1 | Execute the DDF / board data agreement (correct variant for a technology provider acting for the brokerage) | broker of record + counsel | agreement reference stored in `integrations.config.agreementRef` |
| 1.2 | Obtain API credentials / RETS credentials / OAuth client (board-issued); store in secrets manager, never in repo or model context | engineering | adapter config via env/secrets; threat model C8 |
| 1.3 | Confirm credential scope: read-only listing data; no member-roster or sold-data beyond licensed scope | counsel | adapter request scopes; contract test asserts no out-of-scope endpoint use |
| 1.4 | Document rate limits, attribution requirements, and audit rights granted to the board/CREA | engineering + counsel | adapter rate-limit config; `audit_log` provides usage evidence |
| 1.5 | Verify insurance/liability clauses and indemnities in the agreement | counsel | legal-review checklist item (see `docs/legal-review-checklist.md`) |

## Phase 2 — Data alignment & compliance flags

| # | Item | Adapter-interface mapping (as implemented) |
|---|---|---|
| 2.1 | **RESO alignment.** Map feed fields to the internal RESO-aligned listing schema (`MockListingDataProvider` already emits this shape; the live adapter implements the same contract) | `ListingData` schema in `api/integrations/`; field-mapping table per board (boards deviate from RESO — record deviations in adapter config) |
| 2.2 | **Permitted-use flags.** Per-field/per-listing usage classes: internal analysis (dossier/comps), client display (seller portal), marketing reuse, valuation input | `permittedUse` flags on normalized fields; `engine` blocks use outside flag scope (e.g., display-only field reaching generated ad copy) |
| 2.3 | **Media rights.** Photo/virtual-tour rights metadata: display permission, attribution, expiry, no-derivative constraints | media-rights metadata on listing media records; MediaQA + ContentBrand refuse media without display rights; virtual-staging disclosure preserved (spec §4) |
| 2.4 | **Display rules.** Board attribution line, brokerage identification (interacts with TRESA-06 advertising identification), required disclaimers, update-frequency minimums | display-rule enforcement in the adapter contract; pre-publish linter checks attribution; truthfulness of status claims vs board data (TRESA-07) |
| 2.5 | **Withdrawal & deletion.** Off-market/withdrawn listings and takedown requests must propagate: removal from display, retention only where a legal basis exists | withdrawal/deletion handling in sync protocol (spec §9); `agents/PrivacyRetention` reconciles retention basis |
| 2.6 | **Provenance.** Every field carries source name, source ref, fetch timestamp | `evidence` rows (`sourceName`, `sourceRef`, `freshness`, `lineage`) — the dossier UI renders third-party-data chips from these |
| 2.7 | **Accuracy duties.** Stale or contradicted listing data must surface as such, not silently persist | freshness indicators; contradictions recorded in `dossiers.contradictions`; gate data-freshness check on actions relying on it |

## Phase 3 — Synchronization engineering

| # | Item | Adapter-interface mapping |
|---|---|---|
| 3.1 | **Sync cursors.** Incremental sync keyed on modification timestamps/sequence tokens per board semantics | sync cursor persisted per feed (`MockListingDataProvider` implements the same cursor contract) |
| 3.2 | **Incremental change processing.** Creates/updates/deletes applied idempotently; replays safe | idempotent upsert by feed-native key + cursor; duplicates no-op (same discipline as the outbox) |
| 3.3 | **Dead-letter handling.** Records failing validation quarantine with reason; never silently dropped, never partially applied | dead-letter queue per feed with replay tooling; alert on depth |
| 3.4 | **Reconciliation.** Periodic full-diff job: local store vs feed snapshot; report orphans, missed deletes, stale rows | reconciliation job (scheduled `workflows` kind) + report to compliance dashboard |
| 3.5 | **Backfill.** Historical window per agreement terms (sold data scope!) | batch backfill mode with the same validation path; counsel confirms sold-data licensing |
| 3.6 | **Outage behaviour.** Feed down → freshness indicators degrade honestly; actions depending on stale data block at the gate | `integrations.status: degraded` + `truthfulNote`; ADR-005 data-freshness check |

## Phase 4 — Go-live gate

1. **Contract tests pass against the board sandbox** (the same suite that runs against the mock adapter).
2. **Status flip discipline:** `integrations.status` moves `not_connected → sandbox → connected` only with the date, agreement ref, and `truthfulNote` updated; UI displays the truthful state.
3. **Compliance sign-off:** broker of record approves display-rule and advertising interaction (TRESA-06/07); privacy_admin confirms PIPEDA-06 registry entry; counsel confirms permitted-use scope.
4. **Eval refresh:** add live-feed golden scenarios (field mapping, freshness, withdrawal propagation) to `evals/`; re-run `npm run test && npm run evals`.
5. **Rollback plan:** credentials revoked + adapter disabled + mock re-enabled = one config change; reconciliation job verifies no orphan live-sourced fields remain displayed.

## Current truthful status

`MockListingDataProvider` (status `mock`) provides RESO-aligned seed listings with cursors, provenance, and freshness so dossiers, comps, and valuations are demonstrable today. The REALTOR.ca DDF / board MLS adapter is an **interface + contract tests with `status: "not_connected"`** — it is never presented as live (spec §15). This checklist is the path from interface to connection; external-party lead times (agreements, credentials) are typically weeks — see `docs/roadmap.md`.
