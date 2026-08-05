# Roadmap — Northstar SellerOS (prioritized 30 / 60 / 90 days)

Sequenced from ASSUMPTIONS.md (known gaps) and the honest-status items in `ARCHITECTURE_CONTRACT.md`. Ordering principle: **compliance-critical and revenue-blocking first, platform scale second, breadth last.** Each item lists its dependency and its "done" test. Docs localization to fr-CA is tracked at day 90 (per the docs-set language note).

## Days 0–30 — Production-critical foundations

| # | Item | Why first | Depends on | Done when |
|---|---|---|---|---|
| 30.1 | **Licensed listing data onboarding** (REALTOR.ca DDF / one board MLS) per `docs/licensed-data-onboarding.md` | Blocks real dossiers/comps; external-party lead times are the long pole — start agreements day 1 | Executed DDF/board agreement (counsel) | Adapter passes contract tests vs sandbox; `integrations.status: sandbox → connected` with truthfulNote; withdrawal + reconciliation jobs verified on live feed |
| 30.2 | **Counsel review of the 43 rules** — all VERIFY items in `docs/legal-review-checklist.md` §1 | Unverified thresholds (FINTRAC windows, O. Reg. 567/05 subsections) are in the production pack | Research brief + counsel engagement | Every VERIFY resolved; Ontario pack re-versioned (`policy_packs.version`, new reviewDate); regression tests added for any corrected threshold |
| 30.3 | **Native MFA (TOTP)** for privileged roles (`broker_of_record`, `privacy_admin`, `fintrac_officer`) | Threat model C9; regulator-facing roles must not ride demo-grade auth | Platform OAuth hooks | TOTP enroll/verify flows; role-based MFA enforcement; recovery-code path; security tests updated |
| 30.4 | **Live model provider certification** (Kimi K3 or Canada-hosted OpenAI-compatible) | Demo determinism is honest but not production capability | Provider agreement + DPA (PIPEDA-06), `MODEL_*` env | `npm run evals` green against live provider with results re-approved; cost caps verified; residual-risk report updated with live-provider findings |
| 30.5 | **Malware scanning wired** to the upload hook | Threat model C6 — hook exists, scanner doesn't | Vendor selection (Canada-region processing) | Infected-sample test file quarantined; clean uploads unaffected; scan latency within upload SLA |
| 30.6 | Audit-chain **continuous verification job** + alerting | Threat model C10 — tamper evidence must be checked, not just present | — | Scheduled verification; injected-gap test triggers alert |

## Days 31–60 — Scale & provincial breadth

| # | Item | Why now | Depends on | Done when |
|---|---|---|---|---|
| 60.1 | **PostgreSQL migration + RLS** (or schema-per-tenant hardening path) | ADR-002 production-hardening obligation before multi-tenant scale | 30.1–30.4 stable | RLS policies keyed to per-request tenant GUC; `withTenant(ctx)` retained as defence-in-depth; cross-tenant leakage suite green against RLS-off app errors |
| 60.2 | **BC / AB / QC production policy packs** | Fixtures → production for multi-province brokerages; QC triggers Law 25 profile | 30.2 counsel workflow; provincial counsel per pack | Each pack: versioned rules with sources/dates/owner/tests/escalation; Law 25 controls (privacy officer, PIA gating out-of-Quebec processing, manifest consent, CAI reporting) verified by QC counsel; pack-specific eval scenarios green |
| 60.3 | **pgvector retrieval connected** (interface exists, not connected) | Brokerage knowledge + document retrieval quality; unblocks richer grounding | 60.1 (Postgres) | Embedding pipeline with PIPEDA-06 review (embedding provider jurisdiction); evidence citations from retrieval; retrieval evals added |
| 60.4 | **Terraform IaC** for the full-spec topology | Reproducible Canada-region prod; spec §7 | 60.1 | App, DB, storage, network egress allowlist, secrets, OTel — `terraform apply` to a clean account reproduces the environment; DR restore runbook re-validated against it |
| 60.5 | Live comms provider (email/SMS) swap | MockCommsProvider → real sends; CASL controls already enforced at the gate | Provider contract; sender-domain warmup; list-unsubscribe + one-click unsub verified | Sandbox contract tests green; first live send passes gate with real suppression list; delivery webhooks signed + deduped (C7) |
| 60.6 | Temporal swap (optional, if durability scale demands) | ADR-003 documented path | 60.4 | Mapping per ADR-003 executed; gate remains inside activities; restart-resume test suite green against Temporal |

## Days 61–90 — Assurance, breadth, polish

| # | Item | Why then | Depends on | Done when |
|---|---|---|---|---|
| 90.1 | **SOC 2 Type I readiness** (then observation period toward Type II) | Brokerage procurement gate | 60.4 IaC, 30.6 audit verification | Control inventory mapped to existing evidence (audit chain, access logs, incident register, restore tests); gap remediation plan; auditor engaged |
| 90.2 | **fr-CA complete content pass** (docs + seeded long-form content; UI already parity-tested) | Quebec credibility; Law 25 market entry | 60.2 QC pack | All user-facing long-form content bilingual; docs set translated (this file set is EN-primary today); fr-CA eval scenarios for conversation quality |
| 90.3 | Autonomy-drift report + approval-fatigue sampling | Threat model A5/A10 — human-factor controls mature last because they need production data | 60 days of usage telemetry | Scheduled report: autonomy setting changes, approval velocity/rejection rates per approver; quarterly QA sample workflow |
| 90.4 | Buyer-side journey depth (BuyerMatch expansion, showing automation) | Breadth after seller-first core is production-proven | 30.1 live data | Buyer journeys pass the same gate/pack discipline; steering/fairness evals extended (HR-04) |
| 90.5 | OpenSearch adapter (optional) + advanced search | Spec §7 optional component | 60.3 | Truthful status updated; no regression to pgvector path |
| 90.6 | Continuous compliance monitoring feed (regulatory-change watch) | Packs must track amendments (semi-annual + event-driven cadence) | 30.2 | Watch sources wired (CREA/RECO/FINTRAC/CRTC/OPC bulletins); change → pack issue → counsel triage workflow |

## Explicitly out of scope (next quarter+)

- US-market policy packs (kernel is Canadian by design — see `docs/build-vs-buy.md` §4).
- Voice/ADAD outreach — presumptively prohibited (DNCL-07); revisit only with counsel sign-off and express-consent evidence flows.
- Consumer public portal — Northstar is an operations platform; DDF display serves the seller portal, not a public search product.
