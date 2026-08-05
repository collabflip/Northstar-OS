# Compliance Control Matrix — Northstar SellerOS (Ontario production pack)

Maps every rule from `docs/compliance-matrix.md` (43 sourced rules; see count note below) to its **verified** engineering status. Every row carries an explicit **Enforcement** verdict — this matrix never presents a declared intent as an implemented control. Rules are versioned in `api/policy/packs/on.ts` against the province-policy schema in `api/policy/packs/types.ts` (source, jurisdiction, effective/review dates, owner, version, control, test scenarios, escalation — per spec §6). BC/AB/QC packs are schema-valid fixtures, explicitly **non-production**.

**Count note.** The research brief states "43 rules" but enumerates 44 rule IDs (CASL×8, DNCL×7, PIPEDA×7, FIN×8, TRESA×9, HR×5). HR-01 is tracked as a shared prohibited-grounds **taxonomy/configuration** artifact feeding HR-02–HR-05 rather than a standalone control; counsel should confirm the canonical count during legal review (see `docs/legal-review-checklist.md`).

## Enforcement legend (read this first)

| Verdict | Meaning |
|---|---|
| **enforced** | Executable decision path in the commit-time gate (`api/policy/engine.ts`, consumed by the outbox drainer and the campaigns/conversations/offers routers) **and** at least one executable test or eval. |
| **partial** | Executable code exists (an agent core, a linter, a schema artifact) but it is **not wired into a commit-time enforcement path**, or a material sub-claim of the control is absent. The gap is stated in the row. |
| **declared** | Pack metadata / documentation only — **no executable control exists in code today**. These rows are regulatory intent and roadmap, not shipped behavior. |

"Test" means a hand-written executable test or eval scenario. Pack `testScenarios` are **inert metadata**: `api/policy/rules.test.ts` zod-validates the pack and asserts each rule *declares* ≥1 scenario, but no runner executes them. Executable decision tests exist for ~13 rule IDs (`rules.test.ts`, `engine.test.ts`, `dncl.test.ts`, `autonomy.test.ts`) plus eval coverage in `evals/golden.ts`.

## Honest totals (computed from the per-row verdicts below)

| Enforcement | Count | Rules |
|---|---|---|
| **enforced** | 17 | CASL-01, CASL-02, CASL-03, CASL-06, CASL-07 · DNCL-01, DNCL-02, DNCL-03, DNCL-04, DNCL-06 · PIPEDA-02, PIPEDA-07 · FIN-07 · TRESA-04, TRESA-08 · HR-02, HR-03 |
| **partial** | 12 | CASL-08 · DNCL-07 · PIPEDA-03, PIPEDA-05, PIPEDA-06 · FIN-03, FIN-08 · TRESA-02, TRESA-06, TRESA-07 · HR-01, HR-04 |
| **declared** | 15 | CASL-04, CASL-05 · DNCL-05 · PIPEDA-01, PIPEDA-04 · FIN-01, FIN-02, FIN-04, FIN-05, FIN-06 · TRESA-01, TRESA-03, TRESA-05, TRESA-09 · HR-05 |

Counts computed from the per-row table; corrects the summary line in `redteam/04_COMPLIANCE.md` (the 18/14/12 stated there is an arithmetic error — its own per-row verdicts sum to 16/12/16).

> PIPEDA-07 update (fixed 2026-08-03, commit `516bb81`): contact province-of-residence tagging + fail-closed non-ON-contact escalation is **implemented and merged** — `contacts.province` (`db/schema.ts`) + the `contact_jurisdiction` check (`api/policy/engine.ts`, `api/policy/controls.ts` `contactOutsideProductionScope`). PIPEDA-07 has moved declared → enforced (17/12/15).

**Module key.** `engine` = `api/policy/engine.ts` · `on.ts` = `api/policy/packs/on.ts` · `schema` = `db/schema.ts` (named tables) · `agents/` = `api/agents/` · `gateway` = `api/gateway/` · `router` = named tRPC router under `api/routers/` · `workflows` = `api/workflows/` · `integrations` = `api/integrations/` · `evals` = `evals/` golden scenarios.

## AREA 1 — CASL (S.C. 2010, c. 23) — federal

| ruleId | Source | Enforcement | Control status (verified in code) | Executable test/eval | Escalation |
|---|---|---|---|---|---|
| CASL-01 | CASL ss.1,6 | **enforced** | Pre-send CEM classifier + consent gate in `engine` (`engine.ts:678-696`, pack rule CASL-01); outbound email/SMS/DM promoting listings/services/agent treated as CEM; sends only via `outbox` → commit-time gate (drainer `workflows/drainer.ts:58`) or inline gate (`routers/campaigns.ts:50`, `routers/conversations.ts:97`) | `engine.test.ts:116`; evals `casl_decisions` 13/13 | compliance officer |
| CASL-02 | CASL s.10(1)–(8) | **enforced** (core) | Express-consent path in `engine` (`engine.ts:723-727`); `consent_records` requires basis + `evidenceText` + `source` (`schema`); verbal consent queues written verification. Honest limit: "pre-checked box invalid" is a UI convention, not executable | rules/engine tests; evals | compliance officer + counsel |
| CASL-03 | CASL s.10(9),(10),(13) | **enforced** | Implied-consent basis + `expiresAt` per record; `engine` blocks CEM at/after expiry absent express consent (`engine.ts:703-722`). Live-seed proof: a BLOCKED decision with all 15 check results is persisted by `db/seed.ts`. Re-confirmation campaign is a manual flow, not an automated workflow | `rules.test.ts:61-86`; seed self-check | compliance officer |
| CASL-04 | CASL s.10(9)(b)–(d),(11)–(12) | **declared** | Pack metadata only (`on.ts`). No referral consent basis exists (`consentBasisValues` = express/implied/none, `schema.ts:154`); there is **no per-address referral send counter** — a second referral-sourced CEM to the same address is allowed today (red-team PoC). No published-address evidence check | none | compliance officer (roadmap: referral basis + one-send counter in the gate) |
| CASL-05 | CASL s.10(1); SOR/2013-221 s.2 | **declared** | No footer injection or mailbox-liveness check exists. `integrations/mockComms.ts` message shape is channel/to/body/key only; sender-identification text appears only as a template string in `agents/CampaignPlanner.ts:33` (agent unwired) | none | compliance officer (roadmap: template footer gate) |
| CASL-06 | CASL s.11 | **enforced** (core) | `suppression_list` global + permanent until re-consent; `engine` hard-blocks suppressed contacts (`engine.ts:347-355`). Honest limit: the mock comms adapter is a send recorder — there is **no list-unsubscribe header or one-click unsubscribe link format** in `MockCommsProvider` (that capability belongs to the live-provider swap) | `rules.test.ts:88-101`, `engine.test.ts:123`; evals | auto-alert at 5 business days |
| CASL-07 | CASL s.13; CRTC 2012-548/549 | **enforced** (core) | Evidence-onus escalation (`engine.ts:697-701`): consent asserted without evidence escalates; consent ledger (`consent_records`) + hash-chained `audit_log`; per-contact evidence export via `router: consents`. Known limitation (COMP-9): `policy_decisions` rows persist verdict/ruleIds/actor/idempotencyKey and per-check results but **not the message-payload snapshot or referenced consent-record ID** — reconstruction requires joining other tables; thin for regulator-grade evidence | evals golden | CRTC complaint → counsel + broker of record |
| CASL-08 | CASL ss.20–22 | **partial** | Tenant-wide budget/frequency caps enforced at the gate (`engine.ts:451-476`, emits CASL-08); named owner in `policy_packs.owner`. Absent: quarterly consent-hygiene report workflow (only two workflow definitions exist — `workflows/definitions.ts`) | `engine.test.ts:182` | broker of record + counsel |

## AREA 2 — National DNCL & CRTC UTR — federal

| ruleId | Source | Enforcement | Control status (verified in code) | Executable test/eval | Escalation |
|---|---|---|---|---|---|
| DNCL-01 | CRTC UTR Part I | **enforced** (core) | Outbound calling blocked unless the tenant DNCL posture is registered/active (`schema.ts:60` `dnclPosture`; `engine.ts:609-617, 666-671`); omitted flag fails closed. Absent: no registration-account config in `router: settings` (that router covers autonomy only) and no 30-day renewal alerts | `dncl.test.ts:69-89` (incl. omitted-flag fail-closed) | compliance officer |
| DNCL-02 | UTR Part I | **enforced** | Scrub-staleness enforced at the gate: dialing blocked when the scrub list is >31 days old (`engine.ts:644-648`, `controls.ts:257-264`). Absent: no nightly scrub job/scheduler — the scrub date is data; the gate enforces its staleness | `rules.test.ts:135-145` | compliance officer |
| DNCL-03 | UTR Part II | **enforced** (core) | Internal do-not-call flag hard-blocks calls (`engine.ts:356-359`); suppression is permanent until re-consent. Absent: 3-year+14-day retention timer auto-calculation | `rules.test.ts:126-133` | compliance officer → broker of record on repeats |
| DNCL-04 | UTR Part II | **enforced** | Calling-hours window check in `engine` resolved per **called party's** timezone, ambiguous timezone → escalate, omitted flags fail closed (`engine.ts:623-642`, `controls.ts:75-115`); default TZ America/Toronto (ASSUMPTIONS #12) | `rules.test.ts:103-124`, `dncl.test.ts:45-67` | deterministic; anomalies → compliance officer |
| DNCL-05 | UTR Part II | **declared** | Pack metadata only. **No dialer, call-start script enforcement, or caller-ID check exists anywhere in the codebase** | none | QA → compliance officer (roadmap: dialer integration) |
| DNCL-06 | UTR Part I | **enforced** | Existing-business-relationship exemption honored via active consent record (`engine.ts:649-662`); expiry reverts to DNCL scrub behavior | `rules.test.ts:135-145`; evals `dncl_decisions` 10/10 | compliance officer |
| DNCL-07 | UTR Part II | **partial** | AI/prerecorded-voice solicitation presumptively blocked at the gate (`engine.ts:619-622`); consent-based robocall requires express-consent evidence. Absent: abandon-rate telemetry + auto-pause at 5% (no dialing telemetry exists) | `rules.test.ts:213-220` | compliance officer + counsel before any voice automation |

## AREA 3 — PIPEDA — federal (QC/AB/BC notes per PIPEDA-07)

| ruleId | Source | Enforcement | Control status (verified in code) | Executable test/eval | Escalation |
|---|---|---|---|---|---|
| PIPEDA-01 | PIPEDA s.4 + Sch.1 | **declared** | Pack metadata only. No purpose registry exists in `contracts/` (constants/errors/types only); `privacy_admin` exists as a role enum value; there is no access/challenge workflow or 30-day SLA tracking | none | privacy officer → OPC (roadmap: purpose registry + access-request workflow) |
| PIPEDA-02 | s.6.1, s.5(3), Sch.1 4.2–4.3 | **enforced** | Purpose-vs-consent check at the gate (`engine.ts:366-383`): using data for an undisclosed purpose (e.g. third-party AI enrichment) blocks | `engine.test.ts:131` | privacy officer + counsel |
| PIPEDA-03 | Sch.1 4.4, 4.5, 4.7 | **partial** | Retention/anonymization logic exists in `agents/PrivacyRetention.ts` (contract-tested core) but is **not wired into any runtime path** — no scheduled retention job runs. RBAC + tenant-scoped queries are enforced (ADR-002); encryption is platform-provided | `agents.test.ts:251`; evals `privacy_retention` 6/6 | privacy officer |
| PIPEDA-04 | ss.10.1–10.3 | **declared** | Documentation artifact only: the RROSH incident runbook exists (`docs/incident-runbooks.md`) with assessment template and decision log. No executable control and no incident register | none | privacy officer → counsel → OPC |
| PIPEDA-05 | s.10.3; SOR/2018-64 s.6; s.28 | **partial** | 24-month breach-record retention logic in `agents/PrivacyRetention.ts:32-35` (agent, unwired). Honest correction: **there is no incidents table in `db/schema.ts`** — the "incident register in schema" claim is withdrawn; breach records would live in the audit/runbook process today | agents test + evals | privacy officer |
| PIPEDA-06 | Sch.1 4.1.3; OPC 2009 | **partial** | `integrations` registry with processing jurisdiction + `truthfulNote`; gateway sensitivity routing + PII redaction (`gateway/index.ts:80-90`). Absent: no vendor-block code — an unregistered offshore endpoint is not technically blocked | gateway/integrations tests | privacy officer + counsel |
| PIPEDA-07 | s.26(2)(b); QC Law 25; AB/BC PIPAs | **enforced** (fixed 2026-08-03, commit `516bb81`) | Contacts carry a nullable `province` tag (`schema.ts` contacts table); the gate's `contact_jurisdiction` check (`engine.ts`, `controls.ts:contactOutsideProductionScope`) **fails closed to manual review (escalate, ruleId PIPEDA-07)** when a tagged contact's province is outside the production pack scope (ON only — BC/AB/QC packs are fixtures). Documented behavior: untagged (null) contacts are evaluated under the tenant pack. Also: fail-closed block on explicit non-production jurisdiction (e.g. `jurisdiction:"QC"` → block). The pack itself is honestly scoped (`params.scope: "ontario-first"`, verify note) | `api/redteam/poc-province-tagging.test.ts` (post-fix regression: QC-tagged contact → escalate; untagged → allow; explicit-QC → block) | privacy officer + QC counsel |

## AREA 4 — FINTRAC / PCMLTFA — federal (TB-3: restricted queue, `fintrac_officer` only)

| ruleId | Source | Enforcement | Control status (verified in code) | Executable test/eval | Escalation |
|---|---|---|---|---|---|
| FIN-01 | PCMLTFA s.5(i),(i.1); PCMLTFR s.1(2) | **declared** | Scoping assumption (platform assumes the brokerage is the reporting entity) + `fintrac_*` transaction-task kinds in the schema enum (`schema.ts:599-611`). No executable control needed/shipped | none | compliance officer |
| FIN-02 | PCMLTFA s.9.6; PCMLTFR s.156 | **declared** | Pack metadata only. **No 2-year review scheduler, no 90/60/30 alerts, no training log, no artifact repository** — `workflows/definitions.ts` defines only `seller_journey` and `transaction_coordination` | none | compliance officer → broker of record (roadmap: compliance-program workflow) |
| FIN-03 | PCMLTFR ss.102–112 | **partial** | `fintrac_idv` task kind exists; TransactionCoordinator surfaces a display-only health summary. Honest gap: **milestones are not blocked until verified** — `transactions.completeTask` finalizes any task with zero verification, by any role (red-team PoC: non-officer completed a `fintrac_str` task) | none | compliance officer (VERIFY in-force text — legal review) |
| FIN-04 | PCMLTFR s.1(2), s.104 | **declared** | `fintrac_receipt_of_funds` task kind only; no field-set-enforcing intake form — "incomplete cannot finalize" is not implemented | none | compliance officer |
| FIN-05 | PCMLTFR ss.105, 109 | **declared** | `fintrac_third_party` task kind only; no mandatory determination step or measures-taken log | none | compliance officer; suspicious patterns → STR evaluation |
| FIN-06 | PCMLTFA s.9.3; PCMLTFR ss.2(1),105–106 | **declared** | `fintrac_pep` task kind only; no screening logic, determination record, or senior-management approval workflow | none | compliance officer + senior management (VERIFY timing nuances) |
| FIN-07 | PCMLTFA ss.7,8; SOR/2001-317 | **enforced** | Anti-tipping-off precedence: `fintrac.*` actions require `fintrac_officer`, evaluated **before** the broker-of-record catch-all (`engine.ts:138-146`); read redaction chokepoint `api/lib/fintrac.ts`; officer-only queue with pre-authorization audit (`routers/compliance.ts:55-69`); redaction applied in transactions/audit routers | `engine.test.ts:93` (BOR bypass blocked), `rules.test.ts:202-211`, `fintrac.test.ts` (6 live-DB tests) | compliance officer sole decision-maker (VERIFY 30-day wording) |
| FIN-08 | PCMLTFA s.6; PCMLTFR | **partial** | FINTRAC 5-year retention clock + legal-hold logic in `agents/PrivacyRetention.ts:28-31` (agent, unwired). Absent: cash/VC triggers, 24h aggregation, LCTR/LVCTR auto-drafts | agents test + evals | compliance officer |

## AREA 5 — Ontario TRESA 2002 & RECO — Ontario (production pack)

| ruleId | Source | Enforcement | Control status (verified in code) | Executable test/eval | Escalation |
|---|---|---|---|---|---|
| TRESA-01 | TRESA ss.1,4 | **declared** | Pack metadata only. **No RECO registration number/category/brokerage columns exist** on `users`/`memberships` (`schema.ts:22-97`) and there is no RECO public-register check | none | broker of record (roadmap: registrant directory fields + register check) |
| TRESA-02 | O. Reg. 567/05 (VERIFY subsection) | **partial** | `broker_of_record` role + `router: compliance` overview dashboard showing gate-blocked sends. Absent: no commission/payment code exists at all, so "commission flows via brokerage accounts only" is untestable scope, not a control | compliance tests | broker of record (statutory point) |
| TRESA-03 | O. Reg. 567/05 s.13(3)–(4) (VERIFY) | **declared** | Pack metadata only. **No RECO Information Guide trigger, delivery record, or service-unlock gate exists anywhere in the code** (zero references outside the pack) | none | broker of record (roadmap: Guide-delivery gate before service workflows) |
| TRESA-04 | TRESA + O. Reg. 567/05 + RECO SRP guidance | **enforced** | SRP restricted assistance: advice/opinions/pricing/negotiation blocked at the gate (`engine.ts:520-531`, `controls.ts:196-204`) and in the wired conversation path (`agents/ConversationalLead.ts:45-57`, consumed by `routers/conversations.ts`) | `rules.test.ts:167-178`; conversation simulator 85/85 | broker of record |
| TRESA-05 | TRESA DR provisions; RECO Bulletin 3.4 | **declared** | Pack metadata only. **No representation/deal graph, no multiple-representation consent records, no information barriers** — none exist in code | none | broker of record (roadmap: representation graph + MR consent gate) |
| TRESA-06 | O. Reg. 567/05 s.36 area (VERIFY); Bulletin 5.1 | **partial** | Advertising-identification linter exists (`controls.ts:208-221`; `agents/ContentBrand.ts:34`) but is **not invoked at commit time** — no publish path calls it at runtime | `agents.test.ts:148` | broker of record |
| TRESA-07 | TRESA s.32 area (VERIFY); O. Reg. 365/22 | **partial** | Claim cross-check against structured listing data exists (`controls.ts:235-253`; `agents/ContentBrand.ts:32`); superlatives/statistics require a source field. Not invoked at commit time | evals `unsupported_property_claims` 5/5 | broker of record |
| TRESA-08 | O. Reg. 567/05 (VERIFY); Bulletin 4.1 | **enforced** | Competing-offer content lock: sharing disabled absent a persisted, tenant-scoped signed-direction artifact (`engine.ts:537-554`, `routers/offers.ts:136-163`, `sellerDirectionArtifacts` table); caller-asserted flags ignored; cross-tenant artifact rejected | `offers.test.ts` (4 live-DB tests); `rules.test.ts:180-200` | broker of record immediately |
| TRESA-09 | RECO guidance + O. Reg. 365/22 (composite) | **declared** | No open-house module (QR sign-in/kiosk, attendee log) exists. Only a tangential AI-disclosure eval is tagged TRESA-09 (`evals/golden.ts:662-670`) | (tangential eval only) | broker of record (roadmap: open-house module) |

## AREA 6 — Human rights / fair housing — federal CHRA + Ontario Code

| ruleId | Source | Enforcement | Control status (verified in code) | Executable test/eval | Escalation |
|---|---|---|---|---|---|
| HR-01 | CHRA ss.3,5,6,12 | **partial** | Shared prohibited-grounds taxonomy as configuration (`HR_LEXICON`, `controls.ts:126-157`) feeding the HR-02/HR-03 gate linter and eval detectors — honestly a config artifact, not a standalone control | linter tests | — (feeds HR-02–05) |
| HR-02 | HRC ss.1,2(1),3 | **enforced** | Gate linter escalates any gated send whose text hits protected grounds/proxies (`engine.ts:509-519`); BuyerMatch refuses demographic ranking criteria (agent core); discriminatory instructions refused + logged | `rules.test.ts:147-165`; `agents.test.ts:209`; evals `fairness_steering` 6/6 | broker of record + counsel |
| HR-03 | HRC s.13; CHRA s.12 | **enforced** | NLG linter (grounds + proxy lexicon) executed at the gate on outbound content (`controls.ts:160-174`); flagged text needs human rewrite | `rules.test.ts:147-165` | broker of record |
| HR-04 | HRC s.1, s.11; OHRC policy; CHRA s.5 | **partial** | BuyerMatch demographic-criteria refusal exists (`agents/BuyerMatch.ts:20-26`, agent core not wired to a runtime ranking path); steering detector covered by evals. Absent: service-quality telemetry for differential patterns | evals `fairness_steering` | broker of record + counsel |
| HR-05 | HRC ss.8,11(2),17; CHRA ss.14.1,15(2),59 | **declared** | Pack metadata only. **No accommodation intake tracker and no anti-reprisal flag exist in code** (zero references outside the pack) | none | broker of record; disputes → counsel (roadmap: accommodation workflow) |

---

## Mandatory statement

> **Software controls reduce risk but do not guarantee legal compliance.** Northstar SellerOS implements engineering controls derived from public sources; it is not legal advice and no automated decision logic substitutes for professional judgment. Rows marked **declared** or **partial** above are regulatory intent, not shipped enforcement — do not represent them to a regulator, client, or reviewer as implemented. Items marked **VERIFY** in `docs/compliance-matrix.md` (exact O. Reg. 567/05 subsections, current FINTRAC reporting windows, the October 1 2025 PCMLTFR changes, live e-Laws URLs) require counsel confirmation before reliance. **Brokerage counsel and the broker of record must review and approve this rule set and all automated decision logic before deployment** (route via `docs/legal-review-checklist.md`), and regulatory-change monitoring must be maintained per the review cadences recorded in `policy_packs.reviewDate` (default: semi-annual + event-driven on amendments).
