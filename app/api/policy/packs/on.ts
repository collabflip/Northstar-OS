import type { PolicyPack } from "../types";
import { POLICY_DISCLAIMER } from "../types";

/**
 * Ontario production policy pack v2026.1 — every rule sourced from
 * research/compliance-matrix.md (43-item brief; all 44 listed rules encoded).
 * Owner routing: compliance officer / broker of record / privacy officer /
 * fintrac officer per rule. Items marked VERIFY carry verifyNote.
 */
export const ON_PACK: PolicyPack = {
  jurisdiction: "ON",
  version: "2026.1",
  effectiveDate: "2026-01-15",
  reviewDate: "2026-07-15",
  owner: "Harbourline compliance officer (review: brokerage counsel + broker of record)",
  status: "production",
  disclaimer: POLICY_DISCLAIMER,
  rules: [
    // ── AREA 1 — CASL ────────────────────────────────────────────────────
    {
      ruleId: "CASL-01",
      sourceName: "CASL ss.1,6 (S.C. 2010, c. 23)",
      sourceUrl: "https://laws-lois.justice.gc.ca/eng/acts/E-1.6/",
      jurisdiction: "CA",
      effectiveDate: "2014-07-01",
      owner: "compliance officer",
      requirement:
        "No commercial electronic message (CEM) without consent plus form/content compliance; any message encouraging participation in commercial activity (incl. real property) is a CEM.",
      control: {
        id: "cem-classifier-gate",
        description:
          "Pre-send classifier: outbound email/SMS/DM promoting listings/services/agent treated as CEM; must pass consent + form checklist. Transactional replies logged with justification.",
        kind: "classifier",
        params: { gate: "pre_send", transactionalJustificationLogged: true },
      },
      testScenarios: [
        { name: "opted-in listing alert", given: "listing alert to opted-in lead", expect: "allow" },
        { name: "promo to scraped address", given: "'checking in' promo to scraped address", expect: "block" },
        { name: "expired implied SMS promo", given: "SMS promo with expired implied consent", expect: "block" },
      ],
      escalationPath: "compliance officer",
      confidence: "high",
    },
    {
      ruleId: "CASL-02",
      sourceName: "CASL s.10(1)-(8)",
      sourceUrl: "https://laws-lois.justice.gc.ca/eng/acts/E-1.6/",
      jurisdiction: "CA",
      effectiveDate: "2014-07-01",
      owner: "compliance officer",
      requirement:
        "Express consent request must set out purposes + prescribed identification; consent valid until withdrawn; pre-checked boxes invalid per CRTC.",
      control: {
        id: "consent-capture",
        description:
          "Consent capture stores consent text, purpose, ID block, timestamp, channel, source; unchecked-by-default opt-in only.",
        kind: "registry",
        params: { preCheckedInvalid: true },
      },
      testScenarios: [
        { name: "full ID block opt-in", given: "opt-in with full ID block", expect: "allow" },
        { name: "pre-checked box", given: "pre-checked consent box", expect: "block" },
        { name: "verbal consent", given: "verbal consent without written verification", expect: "escalate" },
      ],
      escalationPath: "compliance officer + counsel",
      confidence: "high",
    },
    {
      ruleId: "CASL-03",
      sourceName: "CASL s.10(9),(10),(13)",
      sourceUrl: "https://laws-lois.justice.gc.ca/eng/acts/E-1.6/",
      jurisdiction: "CA",
      effectiveDate: "2014-07-01",
      owner: "compliance officer",
      requirement:
        "Implied consent via existing business relationship: purchase/lease/contract within 2 years, or inquiry/application within 6 months; lapses at window close; recipient can end anytime.",
      control: {
        id: "implied-consent-expiry",
        description:
          "implied_consent_basis + window_expiry per contact; scheduler blocks CEMs at/after expiry absent express consent; expiry triggers re-confirmation campaign.",
        kind: "scheduler",
        params: { ebrMonths: 24, inquiryMonths: 6 },
      },
      testScenarios: [
        { name: "EBR 14 months", given: "closed 14 months ago", expect: "allow" },
        { name: "inquiry 7 months", given: "inquiry 7 months ago", expect: "block" },
        { name: "purchase 25 months", given: "purchase 25 months ago", expect: "block" },
      ],
      escalationPath: "compliance officer",
      confidence: "high",
    },
    {
      ruleId: "CASL-04",
      sourceName: "CASL s.10(9)(b)-(d),(11)-(12)",
      sourceUrl: "https://laws-lois.justice.gc.ca/eng/acts/E-1.6/",
      jurisdiction: "CA",
      effectiveDate: "2014-07-01",
      owner: "compliance officer",
      requirement:
        "Implied consent via conspicuously published address (no no-CEM statement, relevant to role) or referral (one message only, must name referrer).",
      control: {
        id: "referral-cap",
        description:
          "Referral template requires referrer name rendered; hard-cap 1 send per address on referral basis; published-address claims need stored URL/screenshot + relevance note.",
        kind: "pre_send_gate",
        params: { referralSendCap: 1 },
      },
      testScenarios: [
        { name: "one referral email", given: "one referral email naming referrer", expect: "allow" },
        { name: "second referral email", given: "second message on referral basis", expect: "block" },
        { name: "no-solicitations page", given: "address scraped from 'no solicitations' page", expect: "block" },
      ],
      escalationPath: "compliance officer",
      confidence: "high",
    },
    {
      ruleId: "CASL-05",
      sourceName: "CASL s.10(1) + ECP Regulations SOR/2013-221 s.2",
      sourceUrl: "https://laws-lois.justice.gc.ca/eng/acts/E-1.6/",
      jurisdiction: "CA",
      effectiveDate: "2014-07-01",
      owner: "compliance officer",
      requirement:
        "Every CEM identifies sender (+ on-behalf-of), mailing address, phone-with-voicemail/email/web; contact info valid ≥60 days post-send; SMS may link to a page.",
      control: {
        id: "sender-id-footer",
        description:
          "Template footer auto-injects sender + brokerage legal name, address, monitored phone/email; send fails if footer vars empty or liveness check fails.",
        kind: "template",
        params: { contactInfoValidityDays: 60 },
      },
      testScenarios: [
        { name: "complete footer", given: "complete sender footer", expect: "allow" },
        { name: "unresolved placeholder", given: "unresolved footer placeholder", expect: "block" },
        { name: "decommissioned mailbox", given: "decommissioned sender mailbox", expect: "escalate" },
      ],
      escalationPath: "compliance officer",
      confidence: "high",
    },
    {
      ruleId: "CASL-06",
      sourceName: "CASL s.11",
      sourceUrl: "https://laws-lois.justice.gc.ca/eng/acts/E-1.6/",
      jurisdiction: "CA",
      effectiveDate: "2014-07-01",
      owner: "compliance officer",
      requirement:
        "Clear/prominent unsubscribe, readily performed, no cost; honour without delay, max 10 business days.",
      control: {
        id: "suppression-list",
        description:
          "One-click unsubscribe + list-unsubscribe header; real-time central suppression list (global, permanent until re-consent); hard-block sends to suppressed.",
        kind: "registry",
        params: { honourBusinessDays: 10, latencyTargetHours: 24 },
      },
      testScenarios: [
        { name: "unsubscribed excluded", given: "unsubscribed contact in next-day send", expect: "block" },
        { name: "manual re-add", given: "manual re-add of suppressed contact", expect: "block" },
        { name: "broken unsubscribe link", given: "broken unsubscribe link at pre-send", expect: "block" },
      ],
      escalationPath: "auto-alert at 5 business days",
      confidence: "high",
    },
    {
      ruleId: "CASL-07",
      sourceName: "CASL s.13 + CRTC 2012-548/2012-549 guidance",
      sourceUrl: "https://laws-lois.justice.gc.ca/eng/acts/E-1.6/",
      jurisdiction: "CA",
      effectiveDate: "2014-07-01",
      owner: "compliance officer",
      requirement:
        "Sender bears onus of proving consent; documented policies + records of how/when consent obtained required.",
      control: {
        id: "consent-ledger",
        description:
          "Immutable consent ledger (who, exact text/version, when UTC, where form/page/version, how); retained indefinitely; per-contact evidence bundle exportable.",
        kind: "record_keeping",
        params: { exportTargetMinutes: 5 },
      },
      testScenarios: [
        { name: "evidence bundle", given: "evidence bundle request", expect: "allow" },
        { name: "consent without source", given: "'consent: yes' without source", expect: "block" },
        { name: "implied links transaction", given: "implied consent linked to underlying transaction", expect: "allow" },
      ],
      escalationPath: "CRTC complaint → counsel + broker of record",
      confidence: "high",
    },
    {
      ruleId: "CASL-08",
      sourceName: "CASL ss.20-22",
      sourceUrl: "https://laws-lois.justice.gc.ca/eng/acts/E-1.6/",
      jurisdiction: "CA",
      effectiveDate: "2014-07-01",
      owner: "compliance officer",
      requirement:
        "AMPs up to $1M/violation individuals, $10M/violation organizations; vicarious + officer/director liability.",
      control: {
        id: "tenant-send-limits",
        description:
          "Tenant-wide send limits, mandatory pre-checks, quarterly consent-hygiene report to broker of record, named CASL owner.",
        kind: "telemetry",
        params: { amperViolationOrgCad: 10000000 },
      },
      testScenarios: [
        { name: "side-tool send", given: "send via unregistered side tool", expect: "block" },
        { name: "list export to personal email", given: "list export to personal email", expect: "escalate" },
        { name: "suppression coverage", given: "suppression coverage audit 100%", expect: "allow" },
      ],
      escalationPath: "broker of record + counsel",
      confidence: "high",
    },
    // ── AREA 2 — DNCL / CRTC UTR ─────────────────────────────────────────
    {
      ruleId: "DNCL-01",
      sourceName: "CRTC Unsolicited Telecommunications Rules Part I",
      sourceUrl: "https://lnnte-dncl.gc.ca/en",
      jurisdiction: "CA",
      effectiveDate: "2008-09-30",
      owner: "compliance officer",
      requirement:
        "Telemarketers must register and subscribe to the DNCL for called area codes before telemarketing.",
      control: {
        id: "dncl-registration",
        description:
          "Outbound calling disabled until registration account ID + subscription configured; renewal alerts at 30 days.",
        kind: "pre_send_gate",
        params: { renewalAlertDays: 30 },
      },
      testScenarios: [
        { name: "unregistered", given: "calling without DNCL registration", expect: "block" },
        { name: "expired subscription", given: "expired DNCL subscription", expect: "block" },
        { name: "registered", given: "valid registration + subscription", expect: "allow" },
      ],
      escalationPath: "compliance officer",
      confidence: "high",
    },
    {
      ruleId: "DNCL-02",
      sourceName: "CRTC UTR Part I — DNCL scrub",
      sourceUrl: "https://lnnte-dncl.gc.ca/en",
      jurisdiction: "CA",
      effectiveDate: "2008-09-30",
      owner: "compliance officer",
      requirement:
        "No telemarketing calls to DNCL-registered numbers; scrub list ≤31 days old; DNCL registrations never expire.",
      control: {
        id: "dncl-scrub",
        description:
          "Nightly scrub; dialer refuses if list age >31d; matches suppressed permanently + logged.",
        kind: "scheduler",
        params: { maxScrubAgeDays: 31 },
      },
      testScenarios: [
        { name: "registered 40d ago", given: "number registered 40 days ago", expect: "block" },
        { name: "stale 45d list", given: "scrub list 45 days old", expect: "block" },
        { name: "grace within 31d", given: "registered yesterday, grace flagged", expect: "escalate" },
      ],
      escalationPath: "compliance officer",
      confidence: "high",
    },
    {
      ruleId: "DNCL-03",
      sourceName: "CRTC UTR Part II — internal do-not-call",
      sourceUrl: "https://crtc.gc.ca/eng/telemarketing/",
      jurisdiction: "CA",
      effectiveDate: "2008-09-30",
      owner: "compliance officer",
      requirement:
        "Internal do-not-call list mandatory; honour requests within 14 days (immediate recommended); retain number 3 years and 14 days.",
      control: {
        id: "internal-dnc",
        description:
          "One-click DNC flag propagating everywhere; retention timer auto-calculated (3y+14d); permanent option encouraged; send/call blocked while flagged.",
        kind: "registry",
        params: { honourDays: 14, retentionDays: 1109 },
      },
      testScenarios: [
        { name: "mid-call stop", given: "mid-call 'stop calling' excluded next day", expect: "allow" },
        { name: "flagged in campaign", given: "flagged number in later campaign", expect: "block" },
        { name: "early purge", given: "auto-purge before 3y+14d", expect: "block" },
      ],
      escalationPath: "compliance officer → broker of record on repeats",
      confidence: "high",
    },
    {
      ruleId: "DNCL-04",
      sourceName: "CRTC UTR Part II — calling hours",
      sourceUrl: "https://crtc.gc.ca/eng/telemarketing/",
      jurisdiction: "CA",
      effectiveDate: "2008-09-30",
      owner: "compliance officer",
      requirement:
        "Telemarketing only 9:00-21:30 weekdays, 10:00-18:00 Sat/Sun, in the called consumer's local timezone.",
      control: {
        id: "calling-hours",
        description:
          "Per-timezone window enforcement resolved from number/address; hard block outside; ambiguous timezone → most restrictive or manual review.",
        kind: "pre_send_gate",
        params: {
          weekdayStart: "09:00",
          weekdayEnd: "21:30",
          weekendStart: "10:00",
          weekendEnd: "18:00",
          defaultTimezone: "America/Toronto",
        },
      },
      testScenarios: [
        { name: "9:45am Toronto to BC", given: "9:45am Toronto calling BC (6:45am local)", expect: "block" },
        { name: "5:30pm Sunday ON", given: "5:30pm Sunday in Ontario", expect: "allow" },
        { name: "9:45pm weekday", given: "9:45pm weekday", expect: "block" },
      ],
      escalationPath: "deterministic; anomalies → compliance officer",
      confidence: "high",
    },
    {
      ruleId: "DNCL-05",
      sourceName: "CRTC UTR Part II — call-start identification",
      sourceUrl: "https://crtc.gc.ca/eng/telemarketing/",
      jurisdiction: "CA",
      effectiveDate: "2008-09-30",
      owner: "compliance officer",
      requirement:
        "At call start identify on-whose-behalf, telemarketer if different, purpose; on request provide reachable number; caller ID must display a reachable number.",
      control: {
        id: "call-start-script",
        description:
          "Mandatory call-start script enforced in auto-dial/AI flows; caller ID = monitored number; script-adherence spot checks.",
        kind: "template",
        params: { identificationWindowSec: 15 },
      },
      testScenarios: [
        { name: "ID in first 15s", given: "identification in first 15s", expect: "allow" },
        { name: "AI skips purpose", given: "AI voice skipping purpose", expect: "block" },
        { name: "unreachable caller ID", given: "unreachable caller ID", expect: "block" },
      ],
      escalationPath: "QA → compliance officer",
      confidence: "high",
    },
    {
      ruleId: "DNCL-06",
      sourceName: "CRTC UTR Part I — exemptions incl. EBR",
      sourceUrl: "https://lnnte-dncl.gc.ca/en",
      jurisdiction: "CA",
      effectiveDate: "2008-09-30",
      owner: "compliance officer",
      requirement:
        "DNCL doesn't apply to EBR: purchase/lease within 18 months or inquiry within 6 months; exempt calls still follow Telemarketing Rules (hours/ID/internal DNC).",
      control: {
        id: "dncl-exemption-registry",
        description:
          "Per-contact exemption registry (basis+expiry); dialer checks DNCL + exemption validity; expiry reverts to DNCL.",
        kind: "registry",
        params: { ebrPurchaseMonths: 18, ebrInquiryMonths: 6 },
      },
      testScenarios: [
        { name: "EBR 12mo on DNCL", given: "closed 12 months ago, on DNCL", expect: "allow" },
        { name: "inquiry 8mo on DNCL", given: "inquiry 8 months ago, on DNCL", expect: "block" },
        { name: "EBR at 9:45pm", given: "valid EBR at 9:45pm", expect: "block" },
      ],
      escalationPath: "compliance officer",
      confidence: "high",
    },
    {
      ruleId: "DNCL-07",
      sourceName: "CRTC UTR Part II — abandoned calls / ADAD",
      sourceUrl: "https://crtc.gc.ca/eng/telemarketing/",
      jurisdiction: "CA",
      effectiveDate: "2008-09-30",
      owner: "compliance officer",
      requirement:
        "Abandonment ≤5%/month/campaign; abandoned call connects within 2s to recorded ID; ADAD prerecorded solicitation generally prohibited absent express consent. Treat AI-voice outreach as presumptively prohibited.",
      control: {
        id: "adad-guard",
        description:
          "Abandon-rate telemetry + auto-pause at 5%; AI/prerecorded voice solicitation disabled by default; consent-based robocall requires express-consent evidence.",
        kind: "telemetry",
        params: { maxAbandonPercent: 5, aiVoiceDefault: "prohibited" },
      },
      testScenarios: [
        { name: "5.1% abandonment", given: "abandonment at 5.1%", expect: "escalate" },
        { name: "AI cold-call pitch", given: "AI cold-call pitch", expect: "block" },
        { name: "compliant 2s message", given: "compliant 2s recorded message", expect: "allow" },
      ],
      escalationPath: "compliance officer + counsel before any voice automation",
      confidence: "high",
    },
    // ── AREA 3 — PIPEDA ──────────────────────────────────────────────────
    {
      ruleId: "PIPEDA-01",
      sourceName: "PIPEDA s.4 + Schedule 1 (10 principles)",
      sourceUrl: "https://laws-lois.justice.gc.ca/eng/acts/P-8.6/",
      jurisdiction: "CA",
      effectiveDate: "2001-01-01",
      owner: "privacy officer",
      requirement:
        "Accountability, identifying purposes, consent, limiting collection/use/retention, accuracy, safeguards, openness, individual access, challenging compliance.",
      control: {
        id: "purpose-mapping",
        description:
          "Every data field mapped to declared purpose; named privacy officer; plain-language policy; access/challenge workflows with 30-day SLA.",
        kind: "registry",
        params: { accessSlaDays: 30 },
      },
      testScenarios: [
        { name: "unmapped field", given: "deploy with unmapped data field", expect: "block" },
        { name: "access export in SLA", given: "access export within 30 days", expect: "allow" },
        { name: "indefinite retention", given: "indefinite retention flag", expect: "escalate" },
      ],
      escalationPath: "privacy officer → OPC",
      confidence: "high",
    },
    {
      ruleId: "PIPEDA-02",
      sourceName: "PIPEDA s.6.1, s.5(3), Sch.1 cl.4.2-4.3",
      sourceUrl: "https://laws-lois.justice.gc.ca/eng/acts/P-8.6/",
      jurisdiction: "CA",
      effectiveDate: "2001-01-01",
      owner: "privacy officer",
      requirement:
        "Valid consent requires reasonable understanding; purposes identified at/before collection; new purposes need fresh consent.",
      control: {
        id: "purpose-registry",
        description:
          "Purpose registry bound to consent records; using CRM data for AI training/enrichment = new-purpose gate; consent language versioning.",
        kind: "registry",
        params: { newPurposeRequiresFreshConsent: true },
      },
      testScenarios: [
        { name: "consented transaction use", given: "consented transaction use", expect: "allow" },
        { name: "undisclosed AI training", given: "undisclosed third-party AI use", expect: "block" },
        { name: "granular consent", given: "granular marketing vs transaction consent", expect: "allow" },
      ],
      escalationPath: "privacy officer + counsel",
      confidence: "high",
    },
    {
      ruleId: "PIPEDA-03",
      sourceName: "PIPEDA Sch.1 cl.4.4, 4.5, 4.7",
      sourceUrl: "https://laws-lois.justice.gc.ca/eng/acts/P-8.6/",
      jurisdiction: "CA",
      effectiveDate: "2001-01-01",
      owner: "privacy officer",
      requirement:
        "Collect only what's necessary by fair/lawful means; retain only as long as necessary then securely destroy/anonymize; safeguards proportional to sensitivity.",
      control: {
        id: "minimization-retention",
        description:
          "Field-necessity review (no SIN/DOB unless FINTRAC/TRESA requires); RBAC, encryption, audit logs; retention schedule + legal-hold aligned to FINTRAC 5y/RECO.",
        kind: "record_keeping",
        params: { fintracRetentionYears: 5 },
      },
      testScenarios: [
        { name: "ID doc destroyed after 5y", given: "ID doc destroyed after 5y", expect: "allow" },
        { name: "unencrypted export", given: "unencrypted export", expect: "block" },
        { name: "inactive lead anonymized", given: "inactive lead anonymized", expect: "allow" },
      ],
      escalationPath: "privacy officer",
      confidence: "high",
    },
    {
      ruleId: "PIPEDA-04",
      sourceName: "PIPEDA ss.10.1-10.3 (breach RROSH)",
      sourceUrl: "https://laws-lois.justice.gc.ca/eng/acts/P-8.6/",
      jurisdiction: "CA",
      effectiveDate: "2018-11-01",
      owner: "privacy officer",
      requirement:
        "Breach posing real risk of significant harm: report to OPC as soon as feasible, notify individuals, notify organizations that can reduce risk.",
      control: {
        id: "breach-rrosh-runbook",
        description:
          "IR runbook with RROSH template, decision log either way, OPC + individual notification templates, 72h internal SLA, incident register.",
        kind: "record_keeping",
        params: { internalSlaHours: 72 },
      },
      testScenarios: [
        { name: "financial docs exfiltrated", given: "financial docs exfiltrated", expect: "escalate" },
        { name: "lost encrypted laptop", given: "lost encrypted laptop, documented negative", expect: "allow" },
        { name: "no-assessment decision", given: "breach without RROSH assessment", expect: "block" },
      ],
      escalationPath: "privacy officer → counsel → OPC",
      confidence: "high",
    },
    {
      ruleId: "PIPEDA-05",
      sourceName: "PIPEDA s.10.3 + SOR/2018-64 s.6; offence s.28",
      sourceUrl: "https://laws-lois.justice.gc.ca/eng/acts/P-8.6/",
      jurisdiction: "CA",
      effectiveDate: "2018-11-01",
      owner: "privacy officer",
      requirement:
        "Keep records of EVERY breach ≥24 months; knowing contravention = offence up to $100,000.",
      control: {
        id: "breach-register",
        description:
          "Permanent incident register (date, nature, data, assessment, notifications, remediation); exportable on demand; 24-month minimum enforced.",
        kind: "record_keeping",
        params: { breachRecordMonths: 24, offenceMaxCad: 100000 },
      },
      testScenarios: [
        { name: "minor breach logged", given: "minor breach logged", expect: "allow" },
        { name: "record deleted at 12mo", given: "breach record deleted at 12 months", expect: "block" },
        { name: "OPC spot-check", given: "OPC spot-check produced same day", expect: "allow" },
      ],
      escalationPath: "privacy officer",
      confidence: "high",
    },
    {
      ruleId: "PIPEDA-06",
      sourceName: "PIPEDA Sch.1 cl.4.1.3 + OPC cross-border guidelines",
      sourceUrl: "https://www.priv.gc.ca/en/privacy-topics/",
      jurisdiction: "CA",
      effectiveDate: "2001-01-01",
      owner: "privacy officer",
      requirement:
        "Accountability follows data to foreign processors (contractual comparable protection); transparency: individuals informed data may be processed abroad.",
      control: {
        id: "vendor-registry",
        description:
          "Vendor registry with processing jurisdiction; DPAs with comparable-protection clauses; policy discloses cross-border; risk assessment before US-subject processor.",
        kind: "registry",
        params: { usProcessorRiskAssessment: true },
      },
      testScenarios: [
        { name: "new AI vendor with DPA", given: "new AI vendor with DPA + policy update", expect: "allow" },
        { name: "unregistered offshore API", given: "unregistered offshore API", expect: "block" },
        { name: "cross-border disclosure", given: "disclosure states US processing possibility", expect: "allow" },
      ],
      escalationPath: "privacy officer + counsel",
      confidence: "high",
      verifyNote: "Guidance-based transparency duty — note as such.",
    },
    {
      ruleId: "PIPEDA-07",
      sourceName: "PIPEDA s.26(2)(b); QC Law 25; AB/BC PIPAs",
      sourceUrl: "https://laws-lois.justice.gc.ca/eng/acts/P-8.6/",
      jurisdiction: "CA",
      effectiveDate: "2022-09-22",
      owner: "privacy officer",
      requirement:
        "Substantially similar provincial laws: Quebec Law 25 (privacy officer, PIAs, manifest consent, CAI reporting, AMPs to greater of $10M/2%), Alberta mandatory RROSH notification, BC guidance-based.",
      control: {
        id: "province-tagging",
        description:
          "Province-of-residence tagging; Quebec data triggers Law 25 profile; Ontario-first scope.",
        kind: "routing",
        params: { qcProfile: "law25", scope: "ontario-first" },
      },
      testScenarios: [
        { name: "QC to US LLM", given: "QC data to US LLM pending PIA", expect: "block" },
        { name: "AB breach notice", given: "AB breach → AB OIPC notice", expect: "allow" },
        { name: "QC under PIPEDA only", given: "QC contact treated as PIPEDA-only", expect: "escalate" },
      ],
      escalationPath: "privacy officer + QC counsel",
      confidence: "high",
      verifyNote: "Verify details before expanding beyond Ontario.",
    },

    // ── AREA 4 — FINTRAC / PCMLTFA ───────────────────────────────────────
    {
      ruleId: "FIN-01",
      sourceName: "PCMLTFA s.5(i),(i.1); PCMLTFR SOR/2002-184 s.1(2)",
      sourceUrl: "https://fintrac-canafe.canada.ca/re-ed/real-eng",
      jurisdiction: "CA",
      effectiveDate: "2002-06-01",
      owner: "fintrac officer",
      requirement:
        "Real estate brokers/sales representatives and developers are reporting entities under the PCMLTFA.",
      control: {
        id: "reporting-entity-scope",
        description:
          "Platform assumes brokerage is reporting entity; FINTRAC artifacts first-class per deal.",
        kind: "registry",
        params: {},
      },
      testScenarios: [
        { name: "resale obligations", given: "resale deal", expect: "allow" },
        { name: "developer 6 units", given: "developer with 6 new units", expect: "allow" },
        { name: "software vendor", given: "software vendor itself", expect: "escalate" },
      ],
      escalationPath: "compliance officer",
      confidence: "high",
    },
    {
      ruleId: "FIN-02",
      sourceName: "PCMLTFA s.9.6; PCMLTFR s.156",
      sourceUrl: "https://fintrac-canafe.canada.ca/re-ed/real-eng",
      jurisdiction: "CA",
      effectiveDate: "2002-06-01",
      owner: "fintrac officer",
      requirement:
        "Compliance program: appointed compliance officer, written policies, documented risk assessment, ongoing training, effectiveness review every 2 years.",
      control: {
        id: "compliance-program",
        description:
          "Artifact repository, training log, 2-year review scheduler (90/60/30 alerts), versioned policies.",
        kind: "record_keeping",
        params: { reviewMonths: 24, alertDays: [90, 60, 30] },
      },
      testScenarios: [
        { name: "review alerts", given: "2-year review alerts fire", expect: "allow" },
        { name: "untrained agent", given: "untrained agent on deal", expect: "escalate" },
        { name: "stale policy", given: "policy not updated post-amendment", expect: "escalate" },
      ],
      escalationPath: "compliance officer → broker of record",
      confidence: "high",
    },
    {
      ruleId: "FIN-03",
      sourceName: "PCMLTFR ss.102-112; FINTRAC methods guidance",
      sourceUrl: "https://fintrac-canafe.canada.ca/re-ed/real-eng",
      jurisdiction: "CA",
      effectiveDate: "2025-10-01",
      owner: "fintrac officer",
      requirement:
        "Verify identity of individuals / confirm existence of entities for receipt-of-funds or client-info records using prescribed methods; from 2025-10-01 extends to unrepresented parties; at time of triggering transaction.",
      control: {
        id: "idv-workflow",
        description:
          "IDV workflow at offer/deposit + any unrepresented-party interaction; method/document/date captured; milestones blocked until verified.",
        kind: "routing",
        params: { extendsToUnrepresentedFrom: "2025-10-01" },
      },
      testScenarios: [
        { name: "deposit same-day IDV", given: "deposit received → same-day IDV task", expect: "allow" },
        { name: "expired passport", given: "expired passport", expect: "block" },
        { name: "unrepresented buyer post-Oct-2025", given: "unrepresented buyer after 2025-10-01", expect: "escalate" },
      ],
      escalationPath: "compliance officer",
      confidence: "high",
      verifyNote: "VERIFY in-force text of Oct 1 2025 PCMLTFR changes.",
    },
    {
      ruleId: "FIN-04",
      sourceName: "PCMLTFR s.1(2), s.104",
      sourceUrl: "https://fintrac-canafe.canada.ca/re-ed/real-eng",
      jurisdiction: "CA",
      effectiveDate: "2002-06-01",
      owner: "fintrac officer",
      requirement:
        "Receipt-of-funds record per amount received: date, provider name/address/DOB/occupation (or entity details), amount, cash portion, method, currencies, exchange rates, account numbers, other parties, reference numbers, purpose.",
      control: {
        id: "receipt-of-funds-form",
        description:
          "Deposit intake form enforces full field set; incomplete cannot finalize; immutable on deal file.",
        kind: "record_keeping",
        params: {
          requiredFields: [
            "date", "providerName", "providerAddress", "providerDob",
            "providerOccupation", "amount", "cashPortion", "method",
            "currency", "accountNumber", "referenceNumber", "purpose",
          ],
        },
      },
      testScenarios: [
        { name: "full capture", given: "full capture incl. occupation", expect: "allow" },
        { name: "missing purpose", given: "missing purpose field", expect: "block" },
        { name: "one record per receipt", given: "one record per receipt", expect: "allow" },
      ],
      escalationPath: "compliance officer",
      confidence: "high",
    },
    {
      ruleId: "FIN-05",
      sourceName: "PCMLTFR ss.105, 109",
      sourceUrl: "https://fintrac-canafe.canada.ca/re-ed/real-eng",
      jurisdiction: "CA",
      effectiveDate: "2002-06-01",
      owner: "fintrac officer",
      requirement:
        "Reasonable measures to determine if funds provider acts for a third party; if so record prescribed third-party info.",
      control: {
        id: "third-party-determination",
        description:
          "Mandatory 'acting for third party? Y/N/unknown' step; 'unknown' requires measures-taken log.",
        kind: "routing",
        params: { unknownRequiresMeasuresLog: true },
      },
      testScenarios: [
        { name: "gifting parent", given: "gifting parent → determination completed", expect: "allow" },
        { name: "skipped checkbox", given: "skipped determination", expect: "block" },
        { name: "unknown needs note", given: "'unknown' without measures-taken note", expect: "block" },
      ],
      escalationPath: "compliance officer; suspicious patterns → STR evaluation",
      confidence: "high",
    },
    {
      ruleId: "FIN-06",
      sourceName: "PCMLTFA s.9.3; PCMLTFR ss.2(1),105-106",
      sourceUrl: "https://fintrac-canafe.canada.ca/re-ed/real-eng",
      jurisdiction: "CA",
      effectiveDate: "2002-06-01",
      owner: "fintrac officer",
      requirement:
        "Reasonable measures to determine PEP/HIO status; if PEFP (or risk-positive) in transactions ≥$100,000: senior management approval + source-of-funds measures + enhanced monitoring.",
      control: {
        id: "pep-screening",
        description:
          "Screening at intake, determination record, senior-management-approval workflow ≥$100k with source-of-funds docs.",
        kind: "routing",
        params: { seniorApprovalThresholdCad: 100000 },
      },
      testScenarios: [
        { name: "ambassador buyer", given: "ambassador buyer flagged", expect: "escalate" },
        { name: "missing SM approval", given: "missing senior approval blocks deposit", expect: "block" },
        { name: "negative determination", given: "negative determination recorded", expect: "allow" },
      ],
      escalationPath: "compliance officer + senior management",
      confidence: "high",
      verifyNote: "VERIFY timing nuances.",
    },
    {
      ruleId: "FIN-07",
      sourceName: "PCMLTFA ss.7,8; SOR/2001-317",
      sourceUrl: "https://fintrac-canafe.canada.ca/re-ed/real-eng",
      jurisdiction: "CA",
      effectiveDate: "2002-06-01",
      owner: "fintrac officer",
      requirement:
        "Reasonable grounds to suspect ML/TF (completed OR attempted) → STR to FINTRAC as soon as practicable; s.8 anti-tipping-off: no disclosing STR existence/contents in a way that could prejudice an investigation.",
      control: {
        id: "str-queue",
        description:
          "STR workflow visible ONLY to fintrac_officer role; client-facing UI shows nothing; access audited; ML/TF indicator checklist in deal review.",
        kind: "access_control",
        params: { queueRole: "fintrac_officer", antiTippingOff: true },
      },
      testScenarios: [
        { name: "third-party cash deposit", given: "third-party cash deposit → flag → STR; agent UI unchanged", expect: "escalate" },
        { name: "agent tells client", given: "agent discloses STR to client", expect: "block" },
        { name: "attempted transaction", given: "attempted transaction evaluated", expect: "allow" },
      ],
      escalationPath: "compliance officer sole decision-maker",
      confidence: "high",
      verifyNote: "VERIFY current wording of 30-day outer bound.",
    },
    {
      ruleId: "FIN-08",
      sourceName: "PCMLTFA s.6; PCMLTFR (retention, LCTR/LVCTR)",
      sourceUrl: "https://fintrac-canafe.canada.ca/re-ed/real-eng",
      jurisdiction: "CA",
      effectiveDate: "2002-06-01",
      owner: "fintrac officer",
      requirement:
        "Prescribed records retained ≥5 years. LCTR for $10,000+ cash (24h aggregation) within 15 days; LVCTR $10,000+ virtual currency within 5 working days.",
      control: {
        id: "lctr-lvctr-triggers",
        description:
          "Cash/VC triggers with 24h aggregation; auto-draft reports; retention clock + legal hold; destruction log.",
        kind: "record_keeping",
        params: { lctrThresholdCad: 10000, lctrWindowDays: 15, lvctrWindowWorkingDays: 5, retentionYears: 5 },
      },
      testScenarios: [
        { name: "$12k cash", given: "$12k cash received", expect: "escalate" },
        { name: "two $6k in 24h", given: "two $6k cash within 24h aggregated", expect: "escalate" },
        { name: "purge at 4y", given: "purge at 4 years", expect: "block" },
      ],
      escalationPath: "compliance officer",
      confidence: "high",
      verifyNote: "VERIFY current LCTR window.",
    },
    // ── AREA 5 — TRESA / RECO ────────────────────────────────────────────
    {
      ruleId: "TRESA-01",
      sourceName: "TRESA 2002 ss.1,4; RECO",
      sourceUrl: "https://www.ontario.ca/laws/statute/02t30",
      jurisdiction: "ON",
      effectiveDate: "2023-12-01",
      owner: "broker of record",
      requirement:
        "No trading unless registered; categories salesperson/broker employed by brokerage; 'agent'/'REALTOR®' not categories; client vs self-represented party (SRP).",
      control: {
        id: "registrant-directory",
        description:
          "Directory stores RECO number/category/brokerage; outputs render registered name+category; periodic check vs RECO public register.",
        kind: "registry",
        params: {},
      },
      testScenarios: [
        { name: "correct signature", given: "registered name + category renders", expect: "allow" },
        { name: "'licensed agent' in ad", given: "'licensed agent' in ad", expect: "block" },
        { name: "lapsed registration", given: "lapsed registration", expect: "block" },
      ],
      escalationPath: "broker of record",
      confidence: "high",
    },
    {
      ruleId: "TRESA-02",
      sourceName: "O. Reg. 567/05 (broker of record)",
      sourceUrl: "https://www.ontario.ca/laws/regulation/050567",
      jurisdiction: "ON",
      effectiveDate: "2006-03-31",
      owner: "broker of record",
      requirement:
        "Brokerage must designate broker of record responsible for compliance, supervision, trust accounts; remuneration flows through brokerage only.",
      control: {
        id: "bor-designation",
        description:
          "Org chart names BOR; commission flows via brokerage accounts; BOR dashboards see AI comms + blocks.",
        kind: "registry",
        params: {},
      },
      testScenarios: [
        { name: "BOR sees blocks", given: "BOR dashboard shows blocked sends", expect: "allow" },
        { name: "direct-to-agent payment", given: "direct-to-agent payment", expect: "block" },
        { name: "trust deposit", given: "deposit to brokerage trust", expect: "allow" },
      ],
      escalationPath: "broker of record (statutory point)",
      confidence: "high",
      verifyNote: "VERIFY subsection numbering.",
    },
    {
      ruleId: "TRESA-03",
      sourceName: "O. Reg. 567/05 s.13(3)-(4) — RECO Information Guide",
      sourceUrl: "https://www.ontario.ca/laws/regulation/050567",
      jurisdiction: "ON",
      effectiveDate: "2023-12-01",
      owner: "broker of record",
      requirement:
        "Before any services/assistance (clients or SRPs), ensure the person receives the RECO Information Guide and explain contents.",
      control: {
        id: "reco-guide-gate",
        description:
          "First-substantive-contact trigger sends/links current Guide; delivery + explanation recorded before service workflows unlock; version pinned.",
        kind: "pre_send_gate",
        params: {},
      },
      testScenarios: [
        { name: "Guide acknowledged", given: "Guide acknowledged → showing booked", expect: "allow" },
        { name: "CMA before Guide", given: "CMA before Guide delivery", expect: "block" },
        { name: "lease clients gated", given: "lease client gated too", expect: "allow" },
      ],
      escalationPath: "broker of record",
      confidence: "high",
      verifyNote: "VERIFY numbering.",
    },
    {
      ruleId: "TRESA-04",
      sourceName: "TRESA + O. Reg. 567/05 + RECO SRP guidance",
      sourceUrl: "https://reco.on.ca/",
      jurisdiction: "ON",
      effectiveDate: "2023-12-01",
      owner: "broker of record",
      requirement:
        "Self-represented parties: registrant may provide only assistance incidental to services to their own client; must NOT provide SRP services/opinions/advice; must clarify no representation and encourage independent representation.",
      control: {
        id: "srp-guardrail",
        description:
          "SRP-flagged contacts: assistant shares only factual client-serving info (logistics, property facts); blocked from advice/opinions/pricing/negotiation/form help; SRP disclosure auto-inserted; acknowledgment captured.",
        kind: "linter",
        params: { blockCategories: ["advice", "opinion", "pricing", "negotiation", "form_help"] },
      },
      testScenarios: [
        { name: "showing time OK", given: "showing time logistics to SRP", expect: "allow" },
        { name: "offer-price advice", given: "'should I offer $950k?' to SRP", expect: "block" },
        { name: "drafting offer for SRP", given: "drafting offer for SRP", expect: "block" },
      ],
      escalationPath: "broker of record",
      confidence: "high",
      verifyNote: "VERIFY regulation text.",
    },
    {
      ruleId: "TRESA-05",
      sourceName: "TRESA designated/multiple representation; RECO Bulletin 3.4",
      sourceUrl: "https://reco.on.ca/",
      jurisdiction: "ON",
      effectiveDate: "2023-12-01",
      owner: "broker of record",
      requirement:
        "Designated representation: duties flow to designated registrant; otherwise multiple representation requires written consent from EVERY client after disclosure; designated registrants must not share client confidences.",
      control: {
        id: "representation-graph",
        description:
          "Deal graph detects same-brokerage opposing clients; representation records store model + consents; information barriers between DR files; consent-deficient MR blocks engagement.",
        kind: "access_control",
        params: {},
      },
      testScenarios: [
        { name: "DR info barrier", given: "DR information barrier holds", expect: "allow" },
        { name: "MR without consents", given: "multiple representation without all consents", expect: "block" },
        { name: "revoked consent", given: "revoked consent triggers conflict workflow", expect: "escalate" },
      ],
      escalationPath: "broker of record",
      confidence: "high",
      verifyNote: "VERIFY mechanics vs Bulletin 3.4.",
    },
    {
      ruleId: "TRESA-06",
      sourceName: "O. Reg. 567/05 s.36 area; RECO Bulletin 5.1",
      sourceUrl: "https://www.ontario.ca/laws/regulation/050567",
      jurisdiction: "ON",
      effectiveDate: "2023-12-01",
      owner: "broker of record",
      requirement:
        "All advertising (incl. social, AI-generated) must identify registrant by registered name, category (salesperson/broker), and brokerage name with prominence not less than the registrant's; team names must not obscure brokerage.",
      control: {
        id: "ad-id-linter",
        description:
          "Templates enforce ID block; generator refuses marketing copy lacking name+category+brokerage prominence; pre-publish linter all channels.",
        kind: "linter",
        params: { requiredFields: ["registeredName", "category", "brokerageName"] },
      },
      testScenarios: [
        { name: "compliant IG post", given: "compliant IG post", expect: "allow" },
        { name: "team-name-tiny-brokerage", given: "team name obscuring brokerage", expect: "block" },
        { name: "nickname", given: "nickname instead of registered name", expect: "block" },
      ],
      escalationPath: "broker of record",
      confidence: "high",
      verifyNote: "VERIFY subsection.",
    },
    {
      ruleId: "TRESA-07",
      sourceName: "TRESA s.32 area; O. Reg. 365/22",
      sourceUrl: "https://www.ontario.ca/laws/statute/02t30",
      jurisdiction: "ON",
      effectiveDate: "2023-12-01",
      owner: "broker of record",
      requirement:
        "No false/misleading/deceptive statements in advertising/representations — inaccurate property claims, unsubstantiated superlatives, misleading price/sold claims, incl. AI listing remarks.",
      control: {
        id: "claim-cross-check",
        description:
          "Generator cross-checks claims vs structured listing data; superlatives/statistics need source field; status claims verified vs board data.",
        kind: "linter",
        params: { superlativeRequiresSource: true },
      },
      testScenarios: [
        { name: "invented ravine backing", given: "invented ravine backing claim", expect: "block" },
        { name: "matching 3-bedroom", given: "matching '3-bedroom' claim", expect: "allow" },
        { name: "#1 agent no metric", given: "'#1 agent' without metric source", expect: "block" },
      ],
      escalationPath: "broker of record",
      confidence: "high",
      verifyNote: "VERIFY section.",
    },
    {
      ruleId: "TRESA-08",
      sourceName: "O. Reg. 567/05; RECO Bulletin 4.1 (offer handling)",
      sourceUrl: "https://www.ontario.ca/laws/regulation/050567",
      jurisdiction: "ON",
      effectiveDate: "2023-12-01",
      owner: "broker of record",
      requirement:
        "Convey ALL written offers promptly; client instructions in writing; competing offers: disclose NUMBER as directed; CONTENT/terms not disclosed except where the seller directs in writing (open-offer process); never leak confidential client info.",
      control: {
        id: "offer-content-lock",
        description:
          "Offer intake logs every written offer + auto-notifies client; AI can never reveal competing terms; count disclosure follows recorded instruction; content-sharing disabled absent signed written direction (per-trade scope).",
        kind: "access_control",
        params: { contentSharingRequiresWrittenDirection: true },
      },
      testScenarios: [
        { name: "low offer presented", given: "low offer still presented", expect: "allow" },
        { name: "cross-side AI query", given: "cross-side AI query for competing terms", expect: "block" },
        { name: "signed direction", given: "signed written direction unlocks content-sharing for that trade only", expect: "allow" },
      ],
      escalationPath: "broker of record immediately",
      confidence: "high",
      verifyNote: "VERIFY consent mechanics.",
    },
    {
      ruleId: "TRESA-09",
      sourceName: "RECO guidance + O. Reg. 365/22 (open-house conduct)",
      sourceUrl: "https://reco.on.ca/",
      jurisdiction: "ON",
      effectiveDate: "2023-12-01",
      owner: "broker of record",
      requirement:
        "Open-house/showing conduct: visitors commonly SRPs — identify as registrant for the seller, Guide before substantive assistance, no advice to SRPs, protect seller property; sign-in sheets comply with privacy law.",
      control: {
        id: "open-house-module",
        description:
          "QR sign-in + privacy notice + separate unchecked marketing opt-in (CASL); auto Guide delivery; attendee log; SRP-mode kiosk guardrails.",
        kind: "template",
        params: { marketingOptInUnchecked: true },
      },
      testScenarios: [
        { name: "sign-in without marketing box", given: "sign-in without marketing opt-in → no consent", expect: "allow" },
        { name: "kiosk refuses lowest-price", given: "kiosk asked 'lowest they'll take'", expect: "block" },
        { name: "Guide logged per attendee", given: "Guide logged per attendee", expect: "allow" },
      ],
      escalationPath: "broker of record",
      confidence: "moderate-high",
    },
    // ── AREA 6 — Human rights / fair housing ─────────────────────────────
    {
      ruleId: "HR-01",
      sourceName: "CHRA ss.3,5,6,12",
      sourceUrl: "https://laws-lois.justice.gc.ca/eng/acts/H-6/",
      jurisdiction: "CA",
      effectiveDate: "1985-03-01",
      owner: "broker of record",
      requirement:
        "Prohibited grounds (federal scope): race, national/ethnic origin, colour, religion, age, sex, sexual orientation, gender identity/expression, marital status, family status, genetic characteristics, disability, pardoned conviction; s.6 housing discrimination; s.12 discriminatory notices.",
      control: {
        id: "prohibited-grounds-taxonomy",
        description:
          "Shared prohibited-grounds taxonomy as configuration feeding the content linter.",
        kind: "linter",
        params: {},
      },
      testScenarios: [
        { name: "taxonomy loaded", given: "taxonomy available to linter", expect: "allow" },
        { name: "discriminatory notice", given: "notice indicating discrimination", expect: "block" },
      ],
      escalationPath: "broker of record + counsel",
      confidence: "high",
    },
    {
      ruleId: "HR-02",
      sourceName: "Ontario Human Rights Code ss.1,2(1),3",
      sourceUrl: "https://www.ontario.ca/laws/statute/90h19",
      jurisdiction: "ON",
      effectiveDate: "1990-06-15",
      owner: "broker of record",
      requirement:
        "Equal treatment in accommodation without discrimination because of race, ancestry, place of origin, colour, ethnic origin, citizenship, creed, sex, sexual orientation, gender identity, gender expression, age, marital status, family status, disability, receipt of public assistance.",
      control: {
        id: "no-protected-ground-filtering",
        description:
          "Never filter/rank/steer on protected grounds or proxies; discriminatory client instructions refused + logged.",
        kind: "linter",
        params: { ontarioExtraGrounds: ["receipt of public assistance"] },
      },
      testScenarios: [
        { name: "no tenants on OW", given: "'no tenants on OW' instruction", expect: "block" },
        { name: "ethnic-neighbourhood request", given: "ethnic-neighbourhood request", expect: "block" },
        { name: "accessibility request", given: "accessibility request → accommodation workflow", expect: "allow" },
      ],
      escalationPath: "broker of record + counsel",
      confidence: "high",
    },
    {
      ruleId: "HR-03",
      sourceName: "Ontario HRC s.13; CHRA s.12 analogue",
      sourceUrl: "https://www.ontario.ca/laws/statute/90h19",
      jurisdiction: "ON",
      effectiveDate: "1990-06-15",
      owner: "broker of record",
      requirement:
        "No publishing/displaying/circulating notices or ads indicating discrimination or intent to infringe — incl. family-status proxies, 'adults only', public-assistance screening language; applies to listing remarks and AI-drafted copy.",
      control: {
        id: "human-rights-linter",
        description:
          "NLG linter with grounds+proxy lexicon on all property descriptions/ads/buyer criteria; flagged text needs human rewrite.",
        kind: "linter",
        params: { lexicon: "family-status/public-assistance/ethnicity proxies" },
      },
      testScenarios: [
        { name: "not suitable for kids", given: "'not suitable for kids' in ad", expect: "block" },
        { name: "Christian home preferred", given: "'Christian home preferred'", expect: "block" },
        { name: "transit 2-bed pet-friendly", given: "transit/2-bed/pet-friendly copy", expect: "allow" },
      ],
      escalationPath: "broker of record",
      confidence: "high",
    },
    {
      ruleId: "HR-04",
      sourceName: "Ontario HRC s.1, s.11; OHRC policy; CHRA s.5",
      sourceUrl: "https://www.ohrc.on.ca/en",
      jurisdiction: "ON",
      effectiveDate: "1990-06-15",
      owner: "broker of record",
      requirement:
        "No steering on protected grounds, no differential effort, no relaying discriminatory preferences; constructive discrimination prohibited absent bona fide justification + accommodation to undue hardship.",
      control: {
        id: "steering-detector",
        description:
          "Assistant refuses demographic-coded instructions; neighbourhood descriptions restricted to objective amenities (never demographics); service-quality telemetry for differential patterns.",
        kind: "linter",
        params: {},
      },
      testScenarios: [
        { name: "coded instruction", given: "coded demographic instruction", expect: "block" },
        { name: "ethnic-makeup summary", given: "ethnic-makeup neighbourhood summary", expect: "block" },
        { name: "amenity summary", given: "objective amenity summary", expect: "allow" },
      ],
      escalationPath: "broker of record + counsel",
      confidence: "high",
    },
    {
      ruleId: "HR-05",
      sourceName: "Ontario HRC ss.8,11(2),17; CHRA ss.14.1,15(2),59",
      sourceUrl: "https://www.ontario.ca/laws/statute/90h19",
      jurisdiction: "ON",
      effectiveDate: "1990-06-15",
      owner: "broker of record",
      requirement:
        "No reprisal for asserting rights; duty to accommodate to undue hardship (accessible formats, mobility-aware showings, translation).",
      control: {
        id: "accommodation-tracker",
        description:
          "Accommodation intake tracked to completion; anti-reprisal flag blocks complaint-linked service termination.",
        kind: "registry",
        params: {},
      },
      testScenarios: [
        { name: "accessible showing", given: "accessible showing logged", expect: "allow" },
        { name: "auto-archive after HRTO", given: "auto-archive after HRTO mention", expect: "block" },
        { name: "large-print docs", given: "large-print document request", expect: "allow" },
      ],
      escalationPath: "broker of record; disputes → counsel",
      confidence: "high",
    },
  ],
};
