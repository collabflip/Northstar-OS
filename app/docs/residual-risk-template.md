# Residual-Risk & Limitations Report — Northstar SellerOS

> **Delivery report — filled from the final gate runs (spec §16 steps 4–8).** Known limitations from `ASSUMPTIONS.md` are true today. Nothing in this report has been softened: per spec §16, it is the honest statement of what remains risky or unfinished at delivery.

**Report date:** 2026-08-03 · **Build/commit:** `hygiene` branch, quality gates verified at `d39756f` · **Test run:** local Vitest, 18 files / 139 tests · **Eval report:** `evals/report.md` (commit `d39756f`)

## 1. Test & evaluation results (final run)

| Suite | Total | Pass | Fail | Pass rate | Notes |
|---|---|---|---|---|---|
| Unit tests | 42 | 42 | 0 | 100% | agents (21+7), audit (4), workflow runner (7), outbox (3) |
| Policy tests (Ontario pack — every rule's scenarios) | 43 | 43 | 0 | 100% | `engine` (16), `rules` (15), `dncl` (6), `autonomy` (6); any fail = release blocker |
| Security tests | 41 | 41 | 0 | 100% | cross-tenant (tenancy 7, valuations 4), OAuth state CSRF (auth 9), injection/exfiltration (gateway 11), FINTRAC redaction (6), stale approval / duplicate send (campaigns 4) |
| API integration tests | 13 | 13 | 0 | 100% | integrations (5), offers artifact e2e (4), first-login provisioning (4) — live DB |
| i18n parity | — | — | — | — | asserted in evals (`bilingual_parity` 4/4); no Vitest suite exists for it |
| **Vitest total** | **139** | **139** | **0** | **100%** | 18 test files |
| **Golden scenarios (evals, ≥100 per spec §13)** | **131** | **131** | **0** | **100%** | per-category breakdown below |
| Seller-conversation simulator | 85 | 85 | 0 | 100% | 8 conversations |

**Per-category eval pass rates (spec §13):** document extraction 8/8 · source citations 4/4 · unsupported property claims 5/5 · comparable relevance 6/6 · valuation uncertainty 6/6 · seller-intent classification 8/8 · conversation quality 6/6 · bilingual parity 4/4 · safe escalation 8/8 · CASL 13/13 · DNCL 10/10 · privacy/retention 6/6 · FINTRAC routing 5/5 · fairness/steering 6/6 · prompt injection 6/6 · exfiltration 7/7 · stale approvals 6/6 · duplicate webhooks 3/3 · outage recovery 3/3 · cross-tenant leakage 4/4 · latency 2/2 · token usage 3/3 · monetary cost 2/2 — **all 100%**.

**Representative failures observed & corrections made:** the ten Wave-D findings in §2 — each was fixed in code and carries a regression test; a failing eval was always treated as a bug in the code, never in the expectation.

## 2. Independent review — top-10 findings (Wave D)

| Rank | Finding | Severity (impact × exploitability) | Status (fixed / mitigated / accepted) | Evidence (test, commit, doc) |
|---|---|---|---|---|
| 1 | Cross-tenant IDOR in valuations router | Critical | fixed | tenant predicates + live-DB two-tenant tests (`api/routers/valuations.test.ts`, `api/store/tenancy.test.ts`) |
| 2 | First-login provisioning broken | High | fixed | auto-provisioned demo membership + `auth.chooseDemoRole` (`api/queries/users.test.ts`) |
| 3 | FINTRAC data leaks (3 paths) | High | fixed | central anti-tipping-off redaction, officer-only visibility (`api/routers/fintrac.test.ts`) |
| 4 | OAuth state CSRF (forgeable `btoa` state) | High | fixed | nanoid nonce + httpOnly SameSite=Lax cookie binding (`api/kimi/auth.test.ts`) |
| 5 | Campaign approve→launch broken (no approval row + payload-hash mismatch) | High | fixed | canonical `actionHash` + persisted approval + e2e (`api/routers/campaigns.test.ts`) |
| 6 | DNCL calling hours in tenant TZ + voice fail-open | High | fixed | per-contact IANA timezone, fail-closed (`api/policy/dncl.test.ts`) |
| 7 | Home dashboard fabricated "14/14 gates" + no-op Approve | Medium | fixed | Home rewired to real tRPC data; verified in production build |
| 8 | TRESA-08 caller-asserted `writtenSellerDirection:true` bypass | High | fixed | persisted artifact table + verification (`api/routers/offers.test.ts`) |
| 9 | Autonomy ceiling unenforced | High | fixed | engine check, fails closed to human approval (`api/policy/autonomy.test.ts`) |
| 10 | Outbox global idempotency squatting | Medium | fixed | unique `(tenantId, idempotencyKey)` (`api/store/outbox.test.ts`) |

**Findings corrected:** 10 of 10 · **Re-run after corrections:** Vitest 139/139, golden scenarios recorded as 131/131, simulator 85/85 on the post-fix tree (spec §16 step 7) — the 131/131 figure was measured pre-`8dacca0` (2026-08-02) and was later found to be a misread (actual 130/131: the appr-01 fixture used a non-canonical payload hash); the fixture was corrected and a truthful **131/131 was verified at commit `8dacca0` on 2026-08-03** — see `evals/report.md` errata.

## 3. Known limitations (pre-filled from ASSUMPTIONS.md — true at delivery)

| # | Limitation | Risk it leaves | Mitigation / path | Source |
|---|---|---|---|---|
| L1 | **Tenant isolation is application-enforced** on MySQL — no DB-level RLS backstop | A future code path bypassing repository helpers could leak across tenants (threat C1, residual: medium) | Mandatory leakage tests; ADR-002 hardening path (Postgres RLS or schema-per-tenant + CI static checks) before multi-tenant production scale | ASSUMPTIONS #2 |
| L2 | **Model gateway defaults to deterministic mock**; demo AI quality is fixture quality | Eval pass rates measure pipeline/controls, not live-model capability; all agent-safety mitigations must be re-validated on provider swap (threat A1/A3/A7/A8 residuals) | OpenAI-compatible provider env-configurable; mandatory eval re-run + counsel review before A2+ autonomy on live provider | ASSUMPTIONS #5, ADR-004 |
| L3 | **All external integrations are mocks or interfaces** (comms, calendar, listing data) | Real provider behaviour (bounce handling, webhook semantics, feed quirks) unproven; deliverability and CASL footer rendering must be re-verified live | Production-shaped adapters + contract tests; truthful `status` everywhere; onboarding checklist per integration | ASSUMPTIONS #4 |
| L4 | **Ontario pack is engineering-grade, not legal advice**; VERIFY items outstanding | Encoded thresholds (FINTRAC windows, O. Reg. 567/05 subsections, 2025-10-01 changes) may need correction after counsel review | `docs/legal-review-checklist.md` §1 routes every VERIFY to counsel; pack versioning supports correction + regression tests | ASSUMPTIONS #6 |
| L5 | **BC/AB/QC packs are schema-valid fixtures** — explicitly non-production | Onboarding non-Ontario contacts without a production pack is unsupported; QC data requires Law 25 profile before any expansion | Contact province tagging + fail-closed non-ON escalation is **implemented** (2026-08-03, commit `516bb81`): `contacts.province` + the `contact_jurisdiction` gate check escalate any contact tagged outside the production scope (ON); untagged contacts keep tenant-pack evaluation (documented); explicit non-production jurisdictions fail closed at the gate; roadmap 60.2 | ASSUMPTIONS #6, #7 |
| L6 | **Retrieval (pgvector/OpenSearch) is interface-only, not connected** | Brokerage-knowledge grounding is limited to seeded/structured evidence | Roadmap 60.3 | ARCHITECTURE_CONTRACT ADR-001 |
| L7 | **Demo tenancy & impersonation**: first OAuth login joins "Harbourline Realty Inc., Brokerage" with a selectable demo role | Must never ship to production (privilege bypass if deployed). The red-team SEC-2 bypass (role switcher abusable in ANY tenant) is **fixed** (2026-08-03, commit `548db82`): `chooseDemoRole` is now confined to the seeded demo tenant and returns FORBIDDEN elsewhere (regression: `api/redteam/privEscalation.test.ts`) — but the demo-impersonation capability itself remains a demo-only feature | Remove the demo role procedure entirely before any non-demo deployment (deployment guide gate); treat as a release blocker | ASSUMPTIONS #3, red-team SEC-2 |
| L8 | **Bilingual scope**: UI strings parity-tested EN/fr-CA; seeded long-form content is EN-primary; docs set is EN | fr-CA content quality unverified for Quebec marketing use | Roadmap 90.2 content pass | ASSUMPTIONS #10 |
| L9 | **MFA is "MFA-ready" via platform OAuth** — no native TOTP yet | Privileged-role account takeover risk (threat C9) until roadmap 30.3 | Enforce provider-side MFA policy in the interim | ASSUMPTIONS #11 |
| L10 | **No file-upload validation shipped** — offers arrive as pasted text via tRPC; there is no binary upload path, so no size caps, MIME/magic-byte sniffing, or per-tenant quota code exists (threat C6, reclassified declared) | Malicious-file risk is currently latent (no binary ingest) but the moment a file upload ships it lands without preventive validation | Only a global 50MB Hono body limit (`api/boot.ts:13`) exists; malware scanner is a deployment-provided hook; validated upload (magic bytes, quota, caps) is roadmap 30.5 | Spec §11, threat C6, GAP-3 |
| L11 | **Golden scenarios are programmatically generated** with deterministic expectations | Generator bias: scenarios may under-cover failure modes the generator author didn't imagine; counts reported exactly, not as quality proof | Independent review (Wave D) + incident-derived scenarios added over time (IR-5) | ASSUMPTIONS #8 |
| L12 | **Time-window evaluations default to America/Toronto** unless tenant overrides | Multi-province calling-hours errors if tenant timezone/contact location data is wrong | DNCL-04 resolves per called-party timezone; ambiguous → most restrictive/manual review | ASSUMPTIONS #12 |
| L13 | **Cost model is estimate-based** until live `model_calls` data exists | Budget surprises on provider swap | `docs/cost-model.md` §5 recalibration procedure | cost-model |
| L14 | **`policy_decisions` audit rows lack a payload snapshot** — a blocked decision persists verdict, ruleIds, actor, idempotency key, and all per-check results, but not the message payload/text or the referenced consent-record ID | Regulator-grade reconstruction of a blocked send requires joining other tables; evidence is thinner than the audit story implies (COMP-9) | Persist canonical payload hash + payload snapshot + referenced consent ID (roadmap); audit chain itself is tamper-evident and verified | red-team COMP-9 |

## 4. Residual-risk statement

- Highest residual risks by (impact × likelihood) after corrections: **C1 tenant escape** (application-enforced isolation on MySQL, no DB-level RLS backstop — L1); **live-provider behaviour unvalidated** (mock-deterministic default — every AI-safety mitigation must be re-evaluated on provider swap — L2, threats A1/A3/A7/A8); **counsel VERIFY items outstanding** in the Ontario pack (L4); **upload abuse pre-scanner** (structural validation only, malware-scan hook unwired — L10/C6).
- Risks accepted with rationale: application-enforced tenant isolation for the pilot (mandatory two-tenant leakage tests, ADR-002 hardening path before multi-tenant scale); deterministic mock model provider for the demo (truthful `modelVersion: mock-deterministic-1`, mandatory eval re-run on swap); EN-primary seeded long-form content (UI strings parity-tested, fr-CA content pass on roadmap).
- Risks transferred (contracts/DPAs/insurance): none at delivery — counsel engagement (roadmap 30.2) and a provider agreement + DPA (roadmap 30.4) are pre-production gates.

## 5. Mandatory closing statement

> Software controls reduce risk but **do not guarantee legal compliance**. This system ships with an engineering-grade Ontario policy pack requiring brokerage counsel and broker-of-record approval before production use; VERIFY items in `docs/legal-review-checklist.md` §1 are outstanding until counsel confirms them. All integrations report truthful status; mock components are never represented as live.
