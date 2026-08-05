# 04 — COMPLIANCE (Canada) + AI-AGENTS Verification — Northstar SellerOS

Mode: brutal reality. Only executable code is trusted; docs are claims until code proves them.
Verifier branch: `redteam-compliance` (worktree `$HOME/app-redteam-compliance`). Repo tree `/mnt/agents/output/app` untouched.

## Baseline gate runs (executed, not doc claims)

| Check | Command | Result |
|---|---|---|
| Unit/integration suite | `npx vitest run` | **139/139 passed, 18 files** (30.4s) — matches README "139 tests" |
| Golden evals | `npx tsx evals/run.ts` | **131/131 golden scenarios passed** |
| Conversation simulator | (same run) | **85/85 checks across 8 conversations** — matches "131+85" claim |

Baseline claims verified TRUE.

## Method

1. Extracted all 44 rule IDs from `api/policy/packs/on.ts` (CASL×8, DNCL×7, PIPEDA×7, FIN×8, TRESA×9, HR×5 — count confirmed by `rules.test.ts:41-51`).
2. For each rule: grepped every reference outside `packs/` and docs; traced control → check function → decision path in `api/policy/engine.ts` / `api/policy/controls.ts` / routers / agents.
3. Cross-checked `docs/compliance-control-matrix.md` "Engineering control (as implemented)" column against code. NOTE: the matrix has **no explicit enforced/declared column** — every row implicitly claims an implemented control, so any row whose control does not exist in code is an honesty failure.
4. Ran the full test suite and evals; traced gate consumers (`workflows/drainer.ts`, routers).

## Key architectural facts (verified in code)

- **Commit-time gate exists and is consumed.** `evaluateAction` (`api/policy/engine.ts:211`) is called FRESH by the outbox drainer (`api/workflows/drainer.ts:58` — "the ONLY path from queued intent to external side effect") and inline by `api/routers/campaigns.ts:50`, `api/routers/conversations.ts:97`, `api/routers/pipeline.ts:54`. Every evaluation persists a `policy_decisions` row (`engine.ts:577-585`).
- **FIN-07 anti-tipping-off precedence is real.** `roleAllowed` (`engine.ts:138-146`) evaluates `fintrac.*` kinds FIRST: `if (kind.startsWith("fintrac.")) return role === "fintrac_officer"` — before the `broker_of_record` catch-all, so even BOR cannot file/view STRs. Corroborated by `api/lib/fintrac.ts` (`canSeeFintrac` = role equality only), `api/routers/compliance.ts:55-69` (audited `requireFintracOfficer`), and `engine.test.ts`/`rules.test.ts:202-211` executable tests (non-officer blocked, officer allowed — both pass).
- **Pack-test-scenario metadata is NOT executed.** `rules.test.ts:40-59` only zod-validates the pack and asserts each rule has ≥1 scenario *declared*. No runner iterates `testScenarios`. Executable decision tests exist for ~13 rule IDs (hand-written in `rules.test.ts`, `engine.test.ts`, `dncl.test.ts`, `autonomy.test.ts`) plus eval coverage in `evals/golden.ts`. The docs/README truth-table row "Policy gate … Every Ontario rule has scenario tests" is therefore **misleading**: every rule has scenario *metadata*; only a subset has executable tests.

(Findings continue below — file updated incrementally.)

---

## 1 · Rule executability matrix — Ontario pack (44 rules)

Legend — **ENFORCED**: executable decision path in the commit-time gate or a production router + at least one executable test/eval. **PARTIAL**: executable code exists (agent-level control, linter, schema artifact) but is not wired into a commit-time enforcement path, or a material sub-claim of the control is absent. **DECLARED**: metadata/documentation only — no executable control. "Test" = hand-written executable test or eval scenario (pack `testScenarios` are inert metadata, never executed — see COMP-1).

| # | Rule | Verdict | Executable control (file:line) | Executable test/eval | Commit-time consumption |
|---|---|---|---|---|---|
| 1 | CASL-01 | ENFORCED | `engine.ts:678-696` (classifyCEM → consent gate) | `engine.test.ts:116`; evals `casl_decisions` 13/13 | drainer + conversations/campaigns routers |
| 2 | CASL-02 | ENFORCED (core) | `engine.ts:723-727` express path; `consents.ts` record requires evidenceText+source; schema `consent_records` | rules/engine tests; evals | same gate path. "pre-checked box invalid" = UI claim, not executable |
| 3 | CASL-03 | ENFORCED | `engine.ts:703-722` implied window | `rules.test.ts:61-86`; **live seed proof**: decision #2161915 BLOCKED (15 checks persisted) | gate at commit |
| 4 | CASL-04 | **DECLARED — false doc claim** | none. No referral counter, no referral consent basis (`db/schema.ts:154` enum = express/implied/none) | **PoC committed** (`99e7c71`): 2nd referral send ALLOWED | none |
| 5 | CASL-05 | **DECLARED — false doc claim** | none. `mockComms.ts` has no sender footer, no liveness check; only a string in `CampaignPlanner.ts:33` | none | none |
| 6 | CASL-06 | ENFORCED (core) | `engine.ts:347-355` suppression hard-block | `rules.test.ts:88-101`, `engine.test.ts:123` | gate. "list-unsubscribe header in MockCommsProvider" claim FALSE (no such format in `mockComms.ts`) |
| 7 | CASL-07 | ENFORCED (core) | `engine.ts:697-701` evidence-onus escalate; `consent_records` + `consents.byContact` export | evals golden | gate |
| 8 | CASL-08 | PARTIAL | `engine.ts:451-476` budget/frequency caps emit CASL-08 | `engine.test.ts:182` | gate. "Quarterly consent-hygiene report workflow" absent (only 2 workflow defs exist); AMPs mapping rhetorical |
| 9 | DNCL-01 | ENFORCED (core) | `engine.ts:609-617, 666-671` + tenant `dnclPosture` (`schema.ts:60`) | `dncl.test.ts:69-89` (incl. omitted-flag fail-closed) | gate. "registration configured in settings router; renewal alerts 30d" absent — settings router has no DNCL config (`settings.ts` = 37 lines, autonomy only) |
| 10 | DNCL-02 | ENFORCED | `engine.ts:644-648`, `controls.ts:257-264` scrub staleness | `rules.test.ts:135-145` | gate. "Nightly scrub job" absent (no scheduler) — scrub date is data, gate enforces staleness |
| 11 | DNCL-03 | ENFORCED (core) | `engine.ts:356-359` internal DNC block | `rules.test.ts:126-133` | gate. "retention timer 3y+14d auto-calculated" absent |
| 12 | DNCL-04 | ENFORCED | `engine.ts:623-642`, `controls.ts:75-115` calling-hours incl. called-party TZ + ambiguous-TZ escalate | `rules.test.ts:103-124`, `dncl.test.ts:45-67` | gate |
| 13 | DNCL-05 | **DECLARED — false doc claim** | none. No dialer, no call-start script, no caller-ID check exists in the codebase | none | none |
| 14 | DNCL-06 | ENFORCED | `engine.ts:649-662` EBR exemption via active consent | `rules.test.ts:135-145`; evals `dncl_decisions` 10/10 | gate |
| 15 | DNCL-07 | PARTIAL | `engine.ts:619-622` AI-voice presumptive block | `rules.test.ts:213-220` | gate. "Abandon-rate telemetry + auto-pause at 5%" absent |
| 16 | PIPEDA-01 | **DECLARED — false doc claim** | none. No purpose registry in `contracts/` (only constants/errors/types); `privacy_admin` role exists in enum; no access/challenge 30-day workflow | none | none |
| 17 | PIPEDA-02 | ENFORCED | `engine.ts:366-383` purpose-vs-consent check | `engine.test.ts:131` | gate |
| 18 | PIPEDA-03 | PARTIAL | `PrivacyRetention.ts` retention/anonymize logic (agent, unwired) | `agents.test.ts:251`; evals `privacy_retention` 6/6 | none at runtime |
| 19 | PIPEDA-04 | DECLARED | doc artifact only: `docs/incident-runbooks.md` (85 lines, exists). No code, no incident register table | none | none |
| 20 | PIPEDA-05 | PARTIAL | `PrivacyRetention.ts:32-35` 24-month breach-record retention (agent, unwired) | agents test + evals | none. "Permanent incident register in schema" FALSE — no incidents table in `db/schema.ts` |
| 21 | PIPEDA-06 | PARTIAL | `gateway/index.ts:80-90` sensitivity routing + PII redaction; `integrations` table + `truthfulNote`; `gateway.test.ts` | gateway/integrations tests | gateway path. "unregistered offshore API blocked" — no vendor-block code |
| 22 | PIPEDA-07 | **DECLARED — false doc claim** | no contact province field (`schema.ts:112-153`); jurisdiction check is tenant/action-level only | **PoC committed** (`63ea446`): QC contact in ON tenant silently ALLOWED under ON rules, zero flag | fail-closed on explicit non-production jurisdiction works (positive control in same PoC) |
| 23 | FIN-01 | DECLARED | scoping fact; `transactionTaskKindValues` includes fintrac_* kinds (`schema.ts:599-611`) | none | n/a (harmless) |
| 24 | FIN-02 | **DECLARED — false doc claim** | none. No 2-year review scheduler, no training log, no artifact repository (`workflows/definitions.ts` has only seller_journey + transaction_coordination) | none | none |
| 25 | FIN-03 | PARTIAL → gap proven | `fintrac_idv` task kind; `TransactionCoordinator` display-only health | **PoC committed** (`909cc9c`): fintrac_str task completed by non-officer with zero verification | "milestones blocked until verified" FALSE |
| 26 | FIN-04 | DECLARED | `fintrac_receipt_of_funds` task kind only; no field-set-enforcing intake form | none | none |
| 27 | FIN-05 | DECLARED | `fintrac_third_party` task kind only; no determination step/measures log | none | none |
| 28 | FIN-06 | DECLARED | `fintrac_pep` task kind only; no screening/approval workflow | none | none |
| 29 | FIN-07 | ENFORCED | `engine.ts:141` fintrac-first role precedence; `lib/fintrac.ts` redaction chokepoint; `compliance.ts:55-69` audited officer-only queue | `engine.test.ts:93` (BOR bypass attempt blocked), `rules.test.ts:202-211`, `fintrac.test.ts` 6 tests | gate + routers |
| 30 | FIN-08 | PARTIAL | `PrivacyRetention.ts:28-31` FINTRAC 5y retention (agent, unwired) | agents test + evals | none. LCTR/LVCTR triggers + 24h aggregation absent |
| 31 | TRESA-01 | **DECLARED — false doc claim** | no RECO number/category/brokerage fields on `users`/`memberships` (`schema.ts:22-97`); no RECO register check | none | none |
| 32 | TRESA-02 | PARTIAL | `broker_of_record` role; `compliance.overview` dashboard | compliance tests | "commission flows via brokerage accounts only" — no payment code at all |
| 33 | TRESA-03 | **DECLARED — false doc claim** | none. No RECO Information Guide trigger/gate anywhere (grep: zero hits outside packs) | none | none |
| 34 | TRESA-04 | ENFORCED | `engine.ts:520-531` SRP advice block; `controls.ts:196-204`; `ConversationalLead.ts:45-57` | `rules.test.ts:167-178`; simulator 85/85 | gate + conversations router |
| 35 | TRESA-05 | **DECLARED — false doc claim** | none. No representation graph, no MR consent records, no info barriers | none | none |
| 36 | TRESA-06 | PARTIAL | `controls.ts:208-221` adIdentificationLint; `ContentBrand.ts:34` (agent unwired) | `agents.test.ts:148` | none at commit time |
| 37 | TRESA-07 | PARTIAL | `controls.ts:235-253` claimCrossCheck; `ContentBrand.ts:32` | evals `unsupported_property_claims` 5/5 | none at commit time |
| 38 | TRESA-08 | ENFORCED | `engine.ts:537-554` persisted-artifact lock; `offers.ts:136-163`; `sellerDirectionArtifacts` table | `offers.test.ts` 4 tests; `rules.test.ts:180-200` (asserted flag ignored; cross-tenant artifact rejected) | gate + offers router |
| 39 | TRESA-09 | DECLARED | no open-house module (QR sign-in/kiosk) — only an AI-disclosure eval tagged TRESA-09 (`golden.ts:662-670`), tangential to the rule | (tangential) | none |
| 40 | HR-01 | PARTIAL | taxonomy exists as `HR_LEXICON` (`controls.ts:126-157`) feeding the linter; matrix honestly labels it "configuration … feeds HR-02–05" | linter tests | honest |
| 41 | HR-02 | ENFORCED | `engine.ts:509-519` gate linter (escalate); `BuyerMatch.ts` demographic refusal | `rules.test.ts:147-165`; `agents.test.ts:209`; evals `fairness_steering` 6/6 | gate. Trigger input = `action.text` / criteria.demographic |
| 42 | HR-03 | ENFORCED | `controls.ts:160-174` + gate + `ContentBrand` | `rules.test.ts:147-165` | gate |
| 43 | HR-04 | PARTIAL | `BuyerMatch.ts:20-26` demographic-criteria refusal (agent unwired); evals steering scenarios | evals `fairness_steering` | "service-quality telemetry for differential patterns" absent |
| 44 | HR-05 | **DECLARED — false doc claim** | none. No accommodation tracker, no anti-reprisal flag (grep: zero hits) | none | none |

**Totals: ENFORCED 18 · PARTIAL 14 · DECLARED 12.** Of the 12 DECLARED, **8 carry matrix rows that assert a specific implemented control that does not exist** (CASL-04, CASL-05, DNCL-05, PIPEDA-01, PIPEDA-07, FIN-02, TRESA-01, TRESA-03, TRESA-05, HR-05 — 10 rows; see COMP-2).

## 2 · Enforced-vs-declared discrepancies (docs dishonesty)

The matrix has no enforced/declared column; its "Engineering control (as implemented)" column claims implementation for all 44 rows. Rows whose claimed control is absent or materially false:

| Matrix row | Claimed control | Reality (evidence) | Severity |
|---|---|---|---|
| CASL-04 | "hard-cap 1 send per address on referral basis (idempotent counter in `engine`)" | No counter; referral not a consent basis; 2nd send allowed (PoC `99e7c71`) | HIGH |
| CASL-05 | "`engine` send fails if footer vars empty or liveness check fails" | Engine has no footer check; `mockComms.ts` has no footer/unsubscribe format | HIGH |
| CASL-06 | "one-click unsubscribe + list-unsubscribe header in MockCommsProvider message format" | `mockComms.ts:8-12` message shape = channel/to/body/key only | MEDIUM |
| DNCL-01 | "registration account ID + subscription configured in tenant settings (`router: settings`); renewal alerts at 30 days" | `settings.ts` (37 lines) = autonomy ceiling only; no alerts | MEDIUM |
| DNCL-05 | "Mandatory call-start script enforced in any dial/AI flow; caller ID = monitored number" | No dialer/script/caller-ID code exists | HIGH |
| PIPEDA-01 | "Purpose registry mapping every data field (`contracts/` + `on.ts`); access/challenge workflows with 30-day SLA" | `contracts/` has no purpose registry; no access workflow | HIGH |
| PIPEDA-04/05 | "incident register in `schema`" | No incidents table; runbook doc exists (PIPEDA-04 partially true as documentation) | MEDIUM |
| PIPEDA-07 | "Province-of-residence tagging on contacts" | `contacts` table has no province column (PoC `63ea446`) | HIGH |
| FIN-02 | "2-year review scheduler with 90/60/30 alerts (`workflows`)" | No such workflow definition | HIGH |
| FIN-03/04/05/06 | "milestones blocked until verified"; "incomplete cannot finalize"; "skipped determination blocks" | `completeTask` finalizes any task with zero verification, any role (PoC `909cc9c`) | HIGH |
| TRESA-01 | "Directory stores RECO number/category/brokerage (`users`/`memberships`); periodic check vs RECO public register" | No such columns; no check | HIGH |
| TRESA-03 | "First-substantive-contact trigger delivers RECO Guide … before service workflows unlock" | Zero code | HIGH |
| TRESA-05 | "Deal graph detects same-brokerage opposing clients … consent-deficient MR blocks engagement" | Zero code | HIGH |
| HR-05 | "Accommodation intake tracked to completion; anti-reprisal flag blocks complaint-linked termination" | Zero code | MEDIUM |
| README truth table | "Policy gate … Working — **Every Ontario rule has scenario tests**" | Every rule has scenario *metadata*; only ~13 rule IDs have executable decision tests | MEDIUM |

## 3 · Province honesty (BC / AB / QC)

- **Documentation claim is TRUTHFUL.** `packs/bc.ts, ab.ts, qc.ts` all carry `status: "fixture_not_production"`; `rules.test.ts:53-58` proves schema-validity + status for all three; README truth table labels them "Fixtures … explicitly non-production"; the matrix header repeats it. No hidden stub — the limitation is disclosed.
- **Fail-closed works.** `engine.ts:287-304` blocks any action whose jurisdiction pack is missing OR non-production. PoC positive control: explicit `jurisdiction: "QC"` → **block** ("QC pack status is fixture_not_production (not production) — fail closed").
- **Residual risk (real, recorded plainly):** province resolution is `action.jurisdiction ?? tenant.province ?? "ON"` (`engine.ts:288`). Contacts carry **no province-of-residence field**, so a Quebec resident in an Ontario tenant is evaluated under Ontario rules with no flag — PoC: `fr-CA` Quebec contact → `allow`, no PIPEDA-07/Quebec marker in any check. The pack's own scenario "QC contact treated as PIPEDA-only → escalate" is not executable. Mitigation in place: PIPEDA-07 carries `verifyNote: "Verify details before expanding beyond Ontario"` and `params.scope: "ontario-first"` — an honest limitation in the pack, contradicted by the matrix row that claims the tagging exists.

## 4 · FINTRAC anti-tipping-off, audit evidence, HR triggers

- **Role precedence: VERIFIED.** `engine.ts:141` evaluates `fintrac.*` before the BOR catch-all; `lib/fintrac.ts:21` `canSeeFintrac` = strict equality; queue view attempts are audit-logged BEFORE authorization (`compliance.ts:58-63`); `redactFintracTasks`/`redactFintracAudit` applied in transactions + audit routers; 6 live-DB tests pass (`fintrac.test.ts`). Executable proof: `engine.test.ts:93` — broker_of_record blocked from `fintrac.str_file` with ruleId FIN-07.
- **Audit evidence for a blocked CASL decision: VERIFIED with one gap.** Live seed (`npx tsx db/seed.ts`) produced `policy_decisions` #2161915 (BLOCKED, CASL-03, `user:5123098@tenant:3244402`, idempotency key) with **all 15 check results persisted as JSON** including the failing check message. Gap: the row does **not** persist the message payload/text snapshot or the offending consent record ID — reconstruction requires joining other tables. Sufficient for demo, thin for regulator-grade evidence.
- **HR trigger inputs: VERIFIED.** Gate linter fires on `action.text` for any gated send (`engine.ts:509-519`) → verdict escalate, ruleIds HR-02/HR-03. BuyerMatch fires on `criteria.demographic` (agent-level). Lexicon covers family-status, public-assistance (ON-specific), creed, ethnicity, citizenship, disability proxies (`controls.ts:126-157`).

---

## 5 · Agent proof table (20 agents)

Method: exhaustive grep for every agent identifier across `api/`, `src/`, `db/`, `evals/` excluding `api/agents/` itself. Only three production import sites exist anywhere: `api/routers/conversations.ts:11`, `api/routers/offers.ts:10`, `api/routers/transactions.ts:13`. `db/seed.ts` invokes only `parseOfferDocument`; `PropertyDossier`/`SellerDiscovery`/`MarketIntelligence` appear in seed + UI purely as **string lineage labels** (`db/seed.ts:253-257`, `src/pages/PropertyDossier.tsx`), never invoked. Contract column: all 20 validated by `assertContract` (`agents.test.ts:29-43` — zod parse of result, confidence ∈ [0,1], array fields, riskClass/autonomy enums, rationale <600 chars, `modelVersion: mock-deterministic-1`, `promptVersion: *@1.0`) and all pass. Error handling: agents are pure synchronous functions with no I/O — no throw paths, but inputs are TS interfaces with **no runtime zod validation of inputs** (malformed input throws uncaught). Timeout/retry: **absent for all 20 — and not claimed for agents** (honest); the gateway behind any future LLM use has token/cost caps + one deterministic fallback, but no duration cap and no retry loop despite `ARCHITECTURE_CONTRACT.md:85` claiming "token/cost/retry/duration caps".

| # | Agent | Reachable (production call site) | Actually used | Contract ✓ | Tested |
|---|---|---|---|---|---|
| 1 | IntakeRouter | none | eval-only | ✓ | agents.test + evals |
| 2 | ConsentResolver | none | eval-only | ✓ | agents.test + evals |
| 3 | ContactIdentityResolver | none | **test-only** | ✓ | agents.test only |
| 4 | SellerDiscovery | none (string labels in seed/UI) | **test-only** | ✓ | agents.test only |
| 5 | PropertyDossier | none (string labels) | **test-only** | ✓ | agents.test only |
| 6 | MarketIntelligence | none (string labels) | **test-only** | ✓ | agents.test only |
| 7 | ComparableSelection | none | eval-only | ✓ | agents.test + evals |
| 8 | ValuationSupport | none (valuations router is read-only queries) | eval-only | ✓ | agents.test + evals |
| 9 | ListingStrategist | none | **test-only** | ✓ | agents.test only |
| 10 | ContentBrand | none | **test-only** (enforces TRESA-06/07/HR-03 linters — but never invoked at runtime) | ✓ | agents.test only |
| 11 | MediaQA | none | **test-only** | ✓ | agents.test only |
| 12 | CampaignPlanner | none (campaigns router implements launch inline) | **test-only** | ✓ | agents.test only |
| 13 | ConversationalLead | `routers/conversations.ts:11` — draft path; send path runs commit-time gate (`conversations.ts:97`) | **YES — production** | ✓ | agents.test + evals + simulator 85/85 |
| 14 | Scheduling | none | **test-only** | ✓ | agents.test only |
| 15 | BuyerMatch | none | eval-only (HR-02/04 refusal real but unwired) | ✓ | agents.test + evals |
| 16 | OfferExtraction | `routers/offers.ts:10` + `db/seed.ts:11` | **YES — production** | ✓ | agents.test + offerExtraction.test (7) + evals |
| 17 | TransactionCoordinator | `routers/transactions.ts:13` — display-only health summary | YES (read-only; no gating — see COMP-5) | ✓ | agents.test |
| 18 | ComplianceSentinel | none | eval-only | ✓ | agents.test + evals |
| 19 | PrivacyRetention | none | eval-only (PIPEDA-03/05, FIN-08 logic real but unwired) | ✓ | agents.test + evals |
| 20 | QualityJudge | none | eval-only (rubric for eval harness) | ✓ | agents.test + evals |

**Score: reachable 3/20 · used 3/20 · contract 20/20 · tested 20/20.** `AgentResult.proposedAction` has **zero consumers outside `api/agents/`** — no runtime path turns an agent proposal into a gated action; the "requiresHumanApproval ⇒ routed to Approval Inbox" contract field is honored only by convention in the 3 wired routers, not by a central dispatcher.

## 6 · Findings

### COMP-1 — Pack `testScenarios` are inert metadata; "every Ontario rule has scenario tests" is misleading
- **Evidence:** `rules.test.ts:40-59` only zod-parses the pack and asserts `testScenarios.length > 0` per rule. No runner executes scenarios. Executable decision tests cover ~13 rule IDs (`rules.test.ts`, `engine.test.ts`, `dncl.test.ts`, `autonomy.test.ts`) + evals.
- **File/Line:** `api/policy/rules.test.ts:47`; claim at `docs/README.md` truth table row "Policy gate".
- **Severity:** MEDIUM. **Fix:** generate engine-level tests from pack scenarios or reword the doc to "every rule declares scenarios; N have executable tests".
- **Proof:** grep for any iterator over `testScenarios` — zero hits outside the schema check.

### COMP-2 — 10 compliance-matrix rows assert implemented controls that do not exist (systemic docs dishonesty)
- **Evidence:** discrepancy table §2. Worst: CASL-04 "idempotent counter in engine", DNCL-05 "enforced in any dial/AI flow" (no dialer), PIPEDA-01 "purpose registry (contracts/)", TRESA-01 "RECO number/category (users/memberships)", TRESA-03 "RECO Guide gate", TRESA-05 "representation graph", FIN-02 "2-year review scheduler (workflows)", PIPEDA-07 "province tagging on contacts", HR-05 "anti-reprisal flag", FIN-03–06 "milestones blocked until verified".
- **File/Line:** `docs/compliance-control-matrix.md` rows vs. code cited in §1/§2.
- **Severity:** **CRITICAL** per mandate (rows presented as implemented = enforced claims that are declared-only). The pack itself (`on.ts`) is honest (VERIFY notes, disclaimers); the dishonesty is concentrated in the matrix's "as implemented" column.
- **Fix:** add an explicit `enforced | partial | declared` column and downgrade the 10 rows; or implement the controls.
- **Proof:** per-rule grep + PoCs COMP-3/4/5.

### COMP-3 — PIPEDA-07: no contact province tagging; Quebec contact silently under Ontario rules
- **Evidence:** `db/schema.ts:112-153` (contacts: no province); `engine.ts:288` (jurisdiction = action ?? tenant ?? ON). PoC committed `63ea446` (`api/redteam/poc-province-tagging.test.ts`, 3/3 pass): explicit QC → block (positive control); QC-resident contact in ON tenant → `allow`, zero QC/Law-25 flag.
- **Severity:** HIGH (regulatory exposure; honestly scoped "ontario-first" in the pack but contradicted by the matrix). **Fix:** add `provinceOfResidence` to contacts + escalate on non-ON contact when pack is fixture, or drop the matrix claim.
- **Post-remediation status: FIXED 2026-08-03, commit `516bb81` (master ≥ `8dacca0`).** `contacts.province` column added (`db/schema.ts`); the gate's `contact_jurisdiction` check (`api/policy/engine.ts` + `api/policy/controls.ts:contactOutsideProductionScope`) fails closed to manual review (escalate, ruleId PIPEDA-07) when a tagged contact's province is outside the production pack scope; untagged contacts keep tenant-pack evaluation (documented). PoC flipped to post-fix regression assertions at `66c5d2b` (QC-tagged contact in ON tenant → escalate). Matrix row updated to **enforced** (17/12/15).

### COMP-4 — CASL-04 referral one-send hard-cap absent
- **Evidence:** PoC committed `99e7c71` (2/2 pass): referral basis not representable (`consentBasisValues` = express/implied/none); second referral-sourced CEM to same contact → `allow`, no CASL-04 ruleId. **Severity:** HIGH (CASL s.10(11) one-message limit unenforced). **Fix:** referral basis + per-address send counter in the gate, or downgrade the matrix row.

### COMP-5 — FINTRAC "milestones blocked until verified" false; non-officer can finalize STR tasks
- **Evidence:** PoC committed `909cc9c` (1/1 pass): `transactions.completeTask` (`api/routers/transactions.ts:47-62`) has no verification gating, no role/kind check — a `team_member` who cannot even *see* `fintrac_str` tasks (F3 read-redaction) marked one `done`. FIN-03/04/05/06 gating claims false.
- **Severity:** HIGH (integrity of FINTRAC queue; anti-tipping-off protects read but not write). **Fix:** require `fintrac_officer` for fintrac_* task mutations + verification artifacts before completion.

### COMP-6 — 17/20 agents unreachable from production; "backed by 20 typed agents" misleading
- **Evidence:** §5 table. Only ConversationalLead, OfferExtraction, TransactionCoordinator have production call sites; 7 agents exist only in `agents.test.ts`; `proposedAction` has no consumer; the "working" valuation/strategy/dossier journey stages are seeded data + read-only routers (`valuations.ts` = 40 lines of SELECTs).
- **Severity:** HIGH (architecture honesty). Docs never state per-agent wiring status; `docs/agent-flow-diagram.md` presents a 20-agent pipeline.
- **Fix:** truth-table row listing wiring status per agent ("runtime-wired: 3; contract-tested: 20"), or wire the agents.

### COMP-7 — CASL-05 sender-identification footer + DNCL-05 call-start script: no code
- **Evidence:** `mockComms.ts` message shape has no footer/unsubscribe/header fields; no dialer/script/caller-ID code exists (grep zero). Matrix claims both as implemented. **Severity:** HIGH (both are statutory content requirements presented as enforced). **Fix:** implement template footer gate + script check, or downgrade rows.

### COMP-8 — Gateway "retry/duration caps" overstated; agents have no timeout/retry (unclaimed)
- **Evidence:** `gateway/index.ts:76-132` enforces token + cost caps; duration is measured/logged but never capped; failure path is a single deterministic fallback, not a retry cap. `ARCHITECTURE_CONTRACT.md:85` claims "token/cost/retry/duration caps". Agents themselves make no timeout/retry claim — honestly absent. **Severity:** LOW. **Fix:** reword contract or add caps.

### COMP-9 — policy_decisions audit record lacks payload snapshot
- **Evidence:** `db/schema.ts:765-781` persists ruleIds/action/actor/verdict/reasons/idempotencyKey but not the payload/text or consent-record reference; verified live on decision #2161915. **Severity:** LOW (regulator-grade evidence gap). **Fix:** store canonical payload hash + payload snapshot + referenced consent id.

## 7 · Verified-true claims (for balance)

- 139/139 unit tests, 131/131 golden evals, 85/85 simulator — all reproduced locally.
- Commit-time gate real and consumed (drainer re-gates FRESH; campaigns/conversations routers gate inline; blocked decisions persisted; seed self-checks a BLOCKED CASL-03 decision and throws otherwise).
- FIN-07 anti-tipping-off precedence incl. BOR-bypass test; audited officer-only queue; read-redaction across transactions/audit/compliance routers.
- TRESA-08 offer-content lock: persisted-artifact requirement, caller-asserted flags ignored, cross-tenant artifact rejected (4 live tests).
- DNCL-04 called-party timezone resolution incl. ambiguous-TZ escalate + fail-closed omitted flags (6 tests).
- BC/AB/QC packs: schema-valid, explicitly non-production, fail-closed at the gate — documentation truthful.
- Agent contract: all 20 agents produce valid `AgentResult<T>` per binding contract, verified by executable tests.

## 8 · Summary

| Area | Result |
|---|---|
| Baseline gates (139 tests / 131+85 evals) | **PASS — reproduced** |
| Ontario rules ENFORCED / PARTIAL / DECLARED | 18 / 14 / 12 |
| Matrix rows with false "implemented" claims | **10 — CRITICAL (COMP-2)** |
| Province-pack honesty | truthful docs; contact-level tagging absent at review time (COMP-3, HIGH) → **FIXED `516bb81`** (contacts.province + fail-closed contact_jurisdiction) |
| FINTRAC anti-tipping-off | read-path **VERIFIED**; write-path gap (COMP-5, HIGH) |
| Blocked-CASL audit evidence | persisted (15 checks) minus payload snapshot (COMP-9, LOW) |
| Agents: reachable / used / contract / tested | **3 / 3 / 20 / 20** — 17 unreachable (COMP-6, HIGH) |
| PoC commits on `redteam-compliance` | `63ea446` (PIPEDA-07), `99e7c71` (CASL-04), `909cc9c` (FINTRAC gating) — all pass |

**Overall: PARTIAL-FAIL.** The enforcement core (gate, CASL/DNCL/HR/TRESA-08/FIN-07) is real, tested, and fail-closed — unusually solid. But the compliance *surface area* claimed in docs roughly doubles the enforced reality: 12 of 44 Ontario rules are declared-only, 10 matrix rows assert controls that do not exist, and 17 of 20 agents are test/eval artifacts with no production call site. Docs honesty — the project's own stated standard ("truthful status, never fake functionality") — fails on the compliance matrix and the 20-agent framing.
