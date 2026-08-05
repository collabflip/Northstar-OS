# Incident Runbooks — Northstar SellerOS

Regulatory and security incidents. For operational failures (drainer, seeds, evals) see `docs/operations-runbooks.md`. Rule references map to `docs/compliance-matrix.md` and `docs/compliance-control-matrix.md`. **These runbooks are operational aids, not legal advice — counsel directs all regulatory notifications.**

## IR-0 — Security incident severity ladder

| Severity | Definition | Examples in this system | Response |
|---|---|---|---|
| **Sev-1** | Confirmed or suspected exposure of tenant PI; cross-tenant leak; FINTRAC queue read by non-officer; active account takeover of a privileged role | Cross-tenant query returns another brokerage's contacts (C1); STR artifact visible to a registrant (A6); `fintrac_officer`/`broker_of_record` account compromised | Immediate containment; invoke IR-1 (PIPEDA RROSH assessment) and/or IR-3 (tipping-off) same hour; privacy officer + counsel + broker of record engaged |
| **Sev-2** | Control failure without confirmed exposure; compliance-affecting outage | Policy-gate outage (fail closed — RB-3); audit-chain gap detected; failed quarterly restore test; malware-scan hook bypassed | Contain + repair; document in incident register (PIPEDA-05 — **every** breach is recorded ≥24 months, even non-RROSH); assess whether Sev-1 criteria met |
| **Sev-3** | Near-misses and policy-blocked attempts | Blocked prompt-injection eval in production traffic; stale-approval replay attempt blocked; unauthorized export attempt quarantined (CASL-08 DLP) | Log via `audit_log`; trend review monthly; feed new scenarios into `evals/` |

All severities: preserve evidence (do not restart-and-forget), record timeline in the incident register, and never discuss a FINTRAC-linked incident outside the officer channel (IR-3).

## IR-1 — PIPEDA breach: RROSH workflow (PIPEDA-04 / PIPEDA-05)

Trigger: any breach of security safeguards — loss, theft, unauthorized access, disclosure, copying, use, or modification — involving personal information. Examples: exfiltrated offer documents, cross-tenant leak, lost device, model-provider misrouting of unredacted PII.

### Step 1 — Contain and assess (internal SLA: assessment started ≤ 72h)

1. Contain: revoke sessions/keys, disable the affected route or provider (unset `MODEL_GATEWAY_BASE_URL` to force the deterministic mock fallback), isolate affected tenant data.
2. Assess **real risk of significant harm (RROSH)**:
   - **Sensitivity of the information** (identity documents, financial/mortgage context, FINTRAC artifacts = high; business contact data = lower), and
   - **Probability of misuse** (encrypted lost laptop vs. confirmed exfiltration).
   - Significant harm includes humiliation, reputational damage, financial loss, identity theft (PIPEDA s.10.1).
3. Record the assessment **either way** — including a documented negative (no RROSH) with rationale. "No assessment performed" is itself a policy failure (PIPEDA-04 test).

### Step 2 — Notify (only if RROSH) — "as soon as feasible"

1. **Report to the OPC** (Office of the Privacy Commissioner of Canada) using the RROSH report template: circumstances, timing, PI involved, individuals affected (count), steps taken, contact point.
2. **Notify affected individuals** directly (or indirectly where permitted): what happened, what information, what we're doing, what they can do (credit monitoring, etc.), how to reach us.
3. **Notify organizations that can reduce risk** (e.g., card issuers, government agencies) where applicable.
4. **Alberta/Quebec overlays:** AB-resident data → AB OIPC mandatory RROSH notice; Quebec-resident data → CAI + individuals under Law 25 (5-year incident register, AMPs up to greater of $10M/2% worldwide turnover) — see PIPEDA-07 and route to counsel.

### Step 3 — Record and remediate

1. Enter the breach in the **permanent incident register**: date, nature, data involved, RROSH assessment, notifications made (or documented negative), remediation. Retain ≥ **24 months**, sufficient for OPC verification (PIPEDA-05); knowing contravention is an offence up to $100,000.
2. Complete remediation; feed root cause into `evals/` and the threat model.
3. Exportable-on-demand check: the register must produce the OPC spot-check bundle same day (PIPEDA-05 test).

**Roles.** `privacy_admin` owns the workflow; counsel approves all notifications; `broker_of_record` informed; engineering owns containment. The platform provides templates and the register — the **decision and notifications are human acts** (A4).

## IR-2 — CASL complaint response (CASL-06/07/08)

Trigger: CRTC complaint or warning letter; spam-report spike; individual alleges CEM without consent; unsubscribe failure discovered.

1. **Immediate suppression.** Confirm the complainant is on the `suppression_list` across all channels pending review (honour-without-delay; 10-business-day maximum is an outer bound, not a target — CASL-06).
2. **Assemble the consent evidence bundle.** Per CASL-07 the sender bears the onus: export the per-contact bundle (`consents` router) — exact consent text/version, timestamp (UTC), capture location (form/page/version), channel, source, implied-consent window linkage if relied upon. Target: bundle in <5 minutes. **If no source evidence exists, treat consent as absent** — this is the designed rule, not a judgment call.
3. **Trace the send.** Locate the `policy_decisions` row and `audit_log` entry for every message to the complainant (`idempotencyKey` → provider log). Determine whether the gate allowed it (valid basis at send time) or a defect/side-path exists (side-tool send → quarantine per CASL-08 control; defect → Sev-2).
4. **Fix the class, not the instance.** If a template/footer/expiry defect allowed the send, fix and add a policy test reproducing the complaint before re-enabling the affected campaign.
5. **Respond via counsel.** CRTC engagement, undertakings, and any AMP exposure (up to $1M individuals / $10M organizations per violation, CASL-08) are counsel-led. Quarterly consent-hygiene report to the broker of record must reference the complaint and corrective actions.

## IR-3 — FINTRAC STR handling with anti-tipping-off (FIN-07, PCMLTFA ss.7–8)

Trigger: `ComplianceSentinel` or a human flags reasonable grounds to suspect money laundering / terrorist financing — completed **or attempted** (e.g., third-party cash deposit, PEP/HIO risk-positive deal, structured receipts).

### Handling (fintrac_officer only — TB-3)

1. The flag lands in the **restricted FINTRAC queue**, visible only to role `fintrac_officer`. All other roles' UI, API responses, model contexts, and logs show nothing.
2. The compliance officer is the **sole decision-maker**. If the threshold is met: file the STR with FINTRAC **as soon as practicable** (regulations carry a prescribed 30-day outer bound — VERIFY current wording, flagged for counsel in the matrix). The platform drafts; the human files (A4 human-only commit).
3. LCTR ($10,000+ cash, 24h aggregation — VERIFY window) and LVCTR ($10,000+ virtual currency, 5 working days) duties are independent of STR judgment and run on their own clocks (FIN-08).
4. Continue normal business with the client unless directed otherwise — an unexplained withdrawal of service can itself tip off.

### Anti-tipping-off rules (s.8 — absolute)

- **Never disclose** the existence or contents of an STR, or that a suspicion evaluation occurred, in any way that could prejudice an investigation — including to the client, other agents, or in shared notes, campaigns, conversations, or model contexts.
- Any UI/log/model-context pathway that could surface queue content to a non-officer is a **Sev-1** incident (IR-0).
- If a registrant inadvertently learns of a suspicion: brief them privately on s.8 obligations (officer + counsel), record the event ("agent tells client → violation event" is a tested policy scenario), and assess whether the deal can proceed.
- Queue access is audited (`audit_log`); review the access log weekly and on any incident.

## IR-4 — Regulatory inquiry (RECO / CRTC / OPC / FINTRAC examination)

1. Route to the named owner in the relevant `policy_packs` row and to counsel immediately; acknowledge within the regulator's stated window.
2. Produce evidence from system-of-record sources only: `policy_decisions`, hash-chained `audit_log`, consent ledger bundles (CASL-07), incident register (PIPEDA-05), FINTRAC program artifacts (FIN-02: policies, risk assessment, training log, 2-year review).
3. Verify audit-chain integrity before submission; a broken chain is disclosed, not concealed.
4. Post-inquiry: update the affected policy pack version (`policy_packs.version`, new `reviewDate`), add regression tests, and record in `docs/residual-risk-template.md` if systemic.

## IR-5 — AI-safety incident (agent misbehaviour in production)

Trigger: production instance of threat-model Part 2 — injection-driven proposed action, discriminatory output reaching a human, hallucinated property claim published, autonomy exceeding tenant setting.

1. Contain: lower the affected tenant's autonomy level in `/settings` (data-level, immediate); suspend the affected agent or campaign; the fail-closed gate holds all pending effects.
2. Preserve the exact `model_calls` rows, `policy_decisions`, and `audit_log` entries; because the default provider is deterministic, reproduce under the mock provider (no `MODEL_GATEWAY_*` set) where possible.
3. Human-rights outputs (HR-02–05) or published false claims (TRESA-07): broker of record + counsel review the consumer-facing remediation (correction, retraction, apology) — software logs support, humans decide.
4. Add the incident as a golden scenario in `evals/` before re-enabling the affected capability; re-run `npm run evals`.
