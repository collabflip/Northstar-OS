# Legal-Review Checklist — Northstar SellerOS (pre-launch, counsel-owned)

Everything brokerage counsel (and where noted, the broker of record) must review **before production launch**. Northstar's engineering controls reduce risk but **do not guarantee legal compliance**; this checklist is the human-approval layer for the whole compliance architecture. Rule references: `docs/compliance-matrix.md` (full sources) and `docs/compliance-control-matrix.md` (control mapping with per-rule enforcement status). Ontario-first scope; BC/AB/QC packs are non-production fixtures (ASSUMPTIONS #6).

## 1. The 43 sourced rules — VERIFY items (highest priority)

The research brief flags these for counsel confirmation. Review each against current consolidated law before relying on the encoded thresholds:

| # | Rule(s) | What counsel must verify |
|---|---|---|
| 1.1 | FIN-03 | In-force text of the PCMLTFR amendments extending client-identification duties to **unrepresented parties from 2025-10-01** |
| 1.2 | FIN-07 | Current prescribed STR timing wording (regulations have carried a **30-day outer bound**; "as soon as practicable" statutory standard) |
| 1.3 | FIN-08 | Current **LCTR submission window** (15 days as encoded) and LVCTR (5 working days); thresholds ($10,000 cash / virtual currency, 24h aggregation) |
| 1.4 | FIN-06 | PEP/HIO determination **timing nuances** and the $100,000 threshold application to PEDP/HIO risk-positive cases |
| 1.5 | TRESA-02 | Exact **O. Reg. 567/05 subsection** for broker-of-record designation/duties |
| 1.6 | TRESA-03 | O. Reg. 567/05 **s.13(3)–(4) numbering** and current RECO Information Guide version/content; trigger scope (all services incl. leases, commercial) |
| 1.7 | TRESA-04 | Current regulation text + RECO SRP guidance defining **permitted incidental assistance** to self-represented parties |
| 1.8 | TRESA-05 | Designated/multiple representation **mechanics vs RECO Bulletin 3.4**; consent form requirements |
| 1.9 | TRESA-06 | Advertising identification/prominence: exact **O. Reg. 567/05 s.36-area** provisions + Bulletin 5.1 (incl. team-name rules, social media) |
| 1.10 | TRESA-07 | False/misleading advertising: **TRESA s.32-area** + O. Reg. 365/22 Code of Ethics provisions as applied to AI-generated remarks |
| 1.11 | TRESA-08 | Offer-handling: exact provisions; Phase-2 **open-offer process consent mechanics** (number vs content disclosure; written direction) |
| 1.12 | Rule count | Brief states "43 rules"; 44 IDs are enumerated (HR-01 tracked as taxonomy config). Confirm canonical count and that nothing was dropped |
| 1.13 | All rules | Confirm **live e-Laws/Justice URLs**, effective dates, and any amendments since the research date; set `policy_packs.reviewDate` accordingly |

## 2. Consent language (CASL + PIPEDA)

- [ ] Express-consent request text: purposes + prescribed identification (name, on-behalf-of, mailing address + phone/email/web) — CASL-02
- [ ] Unchecked-by-default opt-in implementation across all capture surfaces (incl. open-house QR sign-in — TRESA-09)
- [ ] Implied-consent window logic (2-year EBR / 6-month inquiry; 18-month DNCL EBR) as encoded — CASL-03, DNCL-06
- [ ] Referral and published-address basis templates (one-send cap; referrer named) — CASL-04
- [ ] Unsubscribe mechanism wording + 10-business-day honouring process — CASL-06
- [ ] Verbal-consent written-verification flow — CASL-02
- [ ] Privacy-purpose statements at each collection point; new-purpose (AI enrichment/training) consent gate — PIPEDA-02

## 3. AI disclosure & consumer-facing text

- [ ] AI-assistant disclosure wording in conversations (clear, immediate, with human-transfer offer) — spec §4, TRESA/RECO expectations
- [ ] Valuation disclaimer: "agent decision support — not an appraisal, guaranteed sale price, or final pricing opinion" (`valuations.disclaimer`)
- [ ] Offer-room banner: never submit/accept/reject/disclose/counter without exact human authorization
- [ ] Virtual-staging disclosure template — spec §4 listing launch
- [ ] Seller-portal plain-language review (EN + fr-CA)
- [ ] RECO Information Guide delivery + acknowledgment flow — TRESA-03
- [ ] SRP disclosure auto-insert text ("not your representative; seek independent representation") — TRESA-04

## 4. SRP & representation guardrails

- [ ] Encoded SRP permitted/prohibited assistance lists (logistics/facts OK; advice/opinions/pricing/negotiation/form-drafting blocked) — TRESA-04
- [ ] Designated-representation information barriers and multiple-representation consent flow — TRESA-05
- [ ] Offer-handling logic: all written offers conveyed; count disclosure per written instruction; content sharing only with signed written direction — TRESA-08
- [ ] Confidential-strategy field scoping; cross-side AI query refusals — TRESA-08

## 5. Advertising & content templates

- [ ] Identification block on all templates: registered name, category ("salesperson"/"broker" — never "sales representative"/"agent"), brokerage name prominence — TRESA-06, TRESA-01
- [ ] Claim-substantiation policy (superlatives/statistics require source field; status claims verified vs board data) — TRESA-07
- [ ] Human-rights linter lexicon (grounds + proxies) and the "flag → human rewrite" workflow — HR-01/03
- [ ] Neighbourhood-description policy (objective amenities only, never demographics) — HR-04
- [ ] DNCL calling script (identification in first 15s, monitored caller ID) and the **AI-voice-outreach-prohibited default** — DNCL-05, DNCL-07

## 6. Privacy program

- [ ] Privacy policy: purposes, cross-border processing transparency (incl. possibility of US processing / foreign-court access), retention schedule, access/challenge process (30-day SLA) — PIPEDA-01/02/06
- [ ] Data-field-to-purpose mapping (field-necessity review; no SIN/DOB unless FINTRAC/TRESA requires) — PIPEDA-03
- [ ] Breach-response runbook + RROSH templates + 24-month incident register design — PIPEDA-04/05 (`docs/incident-runbooks.md`)
- [ ] Retention schedule: FINTRAC 5-year, DNCL internal DNC 3y+14d, consent ledger indefinite, legal-hold override — PIPEDA-03, FIN-08, DNCL-03, CASL-07
- [ ] Quebec expansion readiness (Law 25: privacy officer, PIAs incl. before out-of-Quebec communication, manifest consent, CAI reporting) — PIPEDA-07 — required only if QC residents in scope

## 7. Subprocessors & contracts

- [ ] Vendor/subprocessor registry completeness: every processor (platform hosting, MySQL, model provider, comms provider, calendar) with processing jurisdiction — PIPEDA-06
- [ ] DPAs with comparable-protection clauses for each; risk assessment before any US-subject processor (CLOUD Act)
- [ ] Model-provider terms: training opt-out, data-use restrictions, retention by provider — spec §10
- [ ] Listing-data agreements (when connecting): DDF/board MLS terms, permitted use, display rules, media rights, audit rights — `docs/licensed-data-onboarding.md`
- [ ] Client-facing service agreement + brokerage addendum reflecting AI use, human-review commitments, and the compliance disclaimer
- [ ] Demo-environment honesty: demo impersonation labeling acceptable; no real PII in seeds — ASSUMPTIONS #3, #9

## 8. Sign-off record

| Item | Reviewer | Date | Outcome | Conditions |
|---|---|---|---|---|
| VERIFY items (§1) | counsel | | | |
| Consent language (§2) | counsel | | | |
| AI disclosure text (§3) | counsel + broker of record | | | |
| SRP/representation (§4) | broker of record + counsel | | | |
| Advertising templates (§5) | broker of record | | | |
| Privacy program (§6) | privacy_admin + counsel | | | |
| Subprocessors/contracts (§7) | counsel | | | |
| **Overall go/no-go** | **broker of record + counsel** | | | |

Record the approved policy-pack version in `policy_packs` (version, effectiveDate, reviewDate, owner). Any post-launch amendment restarts review for the affected rules only — the pack versioning in `api/policy/packs/on.ts` exists precisely for this.
