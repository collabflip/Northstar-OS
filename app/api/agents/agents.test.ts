import { describe, expect, it } from "vitest";
import {
  ALL_AGENTS,
  BuyerMatch,
  ComparableSelection,
  ConsentResolver,
  ContactIdentityResolver,
  ContentBrand,
  ConversationalLead,
  IntakeRouter,
  ListingStrategist,
  MarketIntelligence,
  MediaQA,
  CampaignPlanner,
  OfferExtraction,
  PrivacyRetention,
  PropertyDossier,
  QualityJudge,
  Scheduling,
  SellerDiscovery,
  TransactionCoordinator,
  ComplianceSentinel,
  ValuationSupport,
  VALUATION_DISCLAIMER,
  type AgentResult,
} from "./index";

const NOW = new Date("2026-06-10T14:00:00Z");

function assertContract<T>(r: AgentResult<T>, schema: { parse: (v: unknown) => unknown }) {
  expect(() => schema.parse(r.result)).not.toThrow();
  expect(r.confidence).toBeGreaterThanOrEqual(0);
  expect(r.confidence).toBeLessThanOrEqual(1);
  expect(Array.isArray(r.evidenceIds)).toBe(true);
  expect(Array.isArray(r.assumptions)).toBe(true);
  expect(Array.isArray(r.unresolvedConflicts)).toBe(true);
  expect(["low", "medium", "high", "regulated"]).toContain(r.riskClass);
  expect(["A0", "A1", "A2", "A3", "A4"]).toContain(r.autonomyLevel);
  expect(typeof r.requiresHumanApproval).toBe("boolean");
  expect(typeof r.rationale).toBe("string");
  expect(r.rationale.length).toBeLessThan(600); // concise rationale, no chain-of-thought
  expect(r.modelVersion).toBe("mock-deterministic-1");
  expect(r.promptVersion).toMatch(/@1\.0$/);
}

describe("agent contract — all 20 agents return valid AgentResult", () => {
  it("registry contains exactly 20 agents", () => {
    expect(ALL_AGENTS).toHaveLength(20);
    expect(new Set(ALL_AGENTS.map((a) => a.meta.name)).size).toBe(20);
  });

  it("IntakeRouter", () => {
    const r = IntakeRouter.run({ message: "I want to sell my home ASAP", channel: "web" });
    assertContract(r, IntakeRouter.resultSchema);
    expect(r.result.route).toBe("seller");
    expect(r.result.reasons.length).toBeGreaterThan(0);
  });
  it("ConsentResolver", () => {
    const r = ConsentResolver.run({
      consents: [{ channel: "email", basis: "express", capturedAt: NOW, status: "active" }],
      suppressedChannels: ["sms"], now: NOW,
    });
    assertContract(r, ConsentResolver.resultSchema);
    expect(r.result.channels.find((c) => c.channel === "sms")?.state).toBe("suppressed");
    expect(r.result.channels.find((c) => c.channel === "email")?.state).toBe("verified");
  });
  it("ContactIdentityResolver", () => {
    const r = ContactIdentityResolver.run({
      candidates: [
        { id: 2, name: "Nadia P", email: "n@x.ca" },
        { id: 5, name: "Nadia Pelletier", email: "n@x.ca" },
      ],
    });
    assertContract(r, ContactIdentityResolver.resultSchema);
    expect(r.result.canonicalId).toBe(2);
    expect(r.result.merges).toHaveLength(1);
    expect(r.requiresHumanApproval).toBe(true);
  });
  it("SellerDiscovery", () => {
    const r = SellerDiscovery.run({ answers: { motivation: "Downsizing" } });
    assertContract(r, SellerDiscovery.resultSchema);
    expect(r.result.followUpQuestions.length).toBe(4);
  });
  it("PropertyDossier", () => {
    const r = PropertyDossier.run({
      facts: [
        { field: "lotDepth", value: "122 ft", sourceName: "MPAC", kind: "third_party" },
        { field: "lotDepth", value: "125 ft", sourceName: "old listing", kind: "estimate" },
      ],
    });
    assertContract(r, PropertyDossier.resultSchema);
    expect(r.result.contradictions).toHaveLength(1);
    expect(r.result.profile.find((p) => p.field === "lotDepth")?.value).toBe("122 ft"); // higher-quality source wins
    expect(r.unresolvedConflicts.length).toBe(1);
  });
  it("MarketIntelligence", () => {
    const r = MarketIntelligence.run({
      area: "Davisville",
      series: [
        { date: "2026-03", medianPrice: 1600000, dom: 16, monthsInventory: 2.0 },
        { date: "2026-04", medianPrice: 1610000, dom: 15, monthsInventory: 1.9 },
        { date: "2026-05", medianPrice: 1620000, dom: 14, monthsInventory: 1.8 },
      ],
      sourceRefs: ["board-feed:may-2026"],
    });
    assertContract(r, MarketIntelligence.resultSchema);
    expect(r.result.citations).toContain("board-feed:may-2026");
    expect(r.result.narrative).toContain("board-feed:may-2026");
  });
  it("ComparableSelection — scored, reasoned, exclusions explained", () => {
    const r = ComparableSelection.run({
      subject: { beds: 4, baths: 3, sqft: 2380 },
      now: NOW,
      candidates: [
        { id: 1, address: "DEMO-ON-AVENUE-001", soldPrice: 1290000, soldDate: "2026-05-12", beds: 4, baths: 3, sqft: 2310, distanceKm: 0.12 },
        { id: 2, address: "Far Away Rd", soldPrice: 1200000, soldDate: "2026-05-01", beds: 4, baths: 3, sqft: 2400, distanceKm: 2.2 },
        { id: 3, address: "Estate Sale Ave", soldPrice: 900000, soldDate: "2026-05-01", beds: 4, baths: 3, sqft: 2350, distanceKm: 0.4, atypical: "estate sale, atypical condition" },
      ],
    });
    assertContract(r, ComparableSelection.resultSchema);
    expect(r.result.selected.map((s) => s.id)).toEqual([1]);
    expect(r.result.excluded).toHaveLength(2);
    expect(r.result.selected[0].selectionReasoning).toContain("Selected");
    expect(r.result.excluded.map((e) => e.reason).join()).toContain("1.5 km");
  });
  it("ValuationSupport — disclaimer ALWAYS, refusal without comps, range widens on missing data", () => {
    const rich = ValuationSupport.run({ adjustedCompPrices: [1200000, 1250000, 1240000, 1260000], dataCompleteness: 1 });
    assertContract(rich, ValuationSupport.resultSchema);
    expect(rich.result.disclaimer).toBe(VALUATION_DISCLAIMER);
    expect(rich.result.low).toBeLessThan(rich.result.mid);
    expect(rich.result.mid).toBeLessThan(rich.result.high);
    const thin = ValuationSupport.run({ adjustedCompPrices: [1200000, 1250000], dataCompleteness: 0.6 });
    const richSpread = (rich.result.high - rich.result.low) / rich.result.mid;
    const thinSpread = (thin.result.high - thin.result.low) / thin.result.mid;
    expect(thinSpread).toBeGreaterThan(richSpread);
    expect(thin.result.confidencePct).toBeLessThan(rich.result.confidencePct);
    const none = ValuationSupport.run({ adjustedCompPrices: [], dataCompleteness: 0.5 });
    expect(none.result.mid).toBe(0);
    expect(none.result.disclaimer).toBe(VALUATION_DISCLAIMER);
    expect(none.requiresHumanApproval).toBe(true);
  });
  it("ListingStrategist", () => {
    const r = ListingStrategist.run({ propertyType: "detached", valuationMid: 1245000 });
    assertContract(r, ListingStrategist.resultSchema);
    expect(r.requiresHumanApproval).toBe(true);
    expect(r.autonomyLevel).toBe("A4");
  });
  it("ContentBrand — clean copy passes; HR violation fails closed", () => {
    const identity = { registeredName: "Maya Chen", category: "salesperson", brokerageName: "Harbourline Realty Inc., Brokerage" };
    const clean = ContentBrand.run({ facts: ["4 bedrooms", "33 x 122 ft lot"], identity, neighbourhood: "Davisville", propertyType: "detached" });
    assertContract(clean, ContentBrand.resultSchema);
    expect(clean.result.passedAllChecks).toBe(true);
    expect(clean.result.body).toContain("Maya Chen, salesperson");
    const dirty = ContentBrand.run({ facts: ["4 bedrooms", "not suitable for kids"], identity, neighbourhood: "Davisville", propertyType: "detached" });
    expect(dirty.result.passedAllChecks).toBe(false);
    expect(dirty.result.hrViolations.length).toBeGreaterThan(0);
  });
  it("MediaQA", () => {
    const r = MediaQA.run({
      assets: [
        { id: 1, type: "photo", width: 2000, height: 1500, sizeBytes: 400000 },
        { id: 2, type: "photo", width: 800, height: 600, sizeBytes: 400000 },
      ],
    });
    assertContract(r, MediaQA.resultSchema);
    expect(r.result.approved).toEqual([1]);
    expect(r.result.rejected[0].reasons[0]).toContain("1200px");
  });
  it("CampaignPlanner — always approval-gated", () => {
    const r = CampaignPlanner.run({ goal: "Spring follow-up", audienceSize: 100, channels: ["email"] });
    assertContract(r, CampaignPlanner.resultSchema);
    expect(r.requiresHumanApproval).toBe(true);
    expect(r.result.frequencyCapPerWeek).toBe(2);
  });
  it("ConversationalLead — grounded draft, escalation on negotiation, ungrounded refusal", () => {
    const grounded = ConversationalLead.run({
      contactName: "Jonah",
      inboundMessages: ["Is parking included?"],
      evidenceCorpus: [{ id: "ev-9", statement: "Private drive with parking for 2 cars" }],
    });
    assertContract(grounded, ConversationalLead.resultSchema);
    expect(grounded.result.draft).toContain("parking");
    expect(grounded.result.draft).toContain("AI assistant");
    expect(grounded.result.groundedEvidenceIds).toEqual(["ev-9"]);
    const negotiation = ConversationalLead.run({
      contactName: "Jonah",
      inboundMessages: ["Would they take $1.15M? Are they flexible?"],
      evidenceCorpus: [],
    });
    expect(negotiation.result.draft).toBeNull();
    expect(negotiation.result.escalation?.topic).toBe("negotiation");
    expect(negotiation.riskClass).toBe("high");
    const ungrounded = ConversationalLead.run({
      contactName: "Jonah", inboundMessages: ["What were the 2024 taxes?"], evidenceCorpus: [],
    });
    expect(ungrounded.result.draft).toBeNull();
    expect(ungrounded.result.blockedReason).toMatch(/evidence/);
  });
  it("Scheduling", () => {
    const r = Scheduling.run({
      durationMin: 60,
      requested: ["2026-06-12T14:00:00Z", "2026-06-12T15:00:00Z"],
      busy: [{ start: "2026-06-12T13:30:00Z", end: "2026-06-12T14:30:00Z" }],
    });
    assertContract(r, Scheduling.resultSchema);
    expect(r.result.proposals[0].conflicts).toBe(true);
    expect(r.result.recommended).toBe("2026-06-12T15:00:00Z");
  });
  it("BuyerMatch — demographic criteria refused (steering guardrail)", () => {
    const ok = BuyerMatch.run({
      criteria: { minBeds: 3, maxPrice: 1300000 },
      listings: [{ id: 1, address: "x", beds: 4, price: 1250000, features: ["garage"] }],
    });
    assertContract(ok, BuyerMatch.resultSchema);
    expect(ok.result.matches).toHaveLength(1);
    const refused = BuyerMatch.run({ criteria: { demographic: "families with small children only" }, listings: [] });
    expect(refused.result.matches).toHaveLength(0);
    expect(refused.result.refusedCriteria).toHaveLength(1);
    expect(refused.riskClass).toBe("regulated");
  });
  it("OfferExtraction", () => {
    const r = OfferExtraction.run({ documentText: "[p.1 §1.0] APS\n[p.2 §1.3] Purchase Price: $1,000,000" });
    assertContract(r, OfferExtraction.resultSchema);
    expect(r.riskClass).toBe("regulated");
    expect(r.requiresHumanApproval).toBe(true);
  });
  it("TransactionCoordinator", () => {
    const r = TransactionCoordinator.run({
      tasks: [
        { kind: "condition", title: "Financing", dueAt: "2026-06-13T00:00:00Z", status: "pending" },
        { kind: "deposit", title: "Deposit", dueAt: "2026-06-01T00:00:00Z", status: "done" },
      ],
      docs: [{ name: "APS", status: "received" }, { name: "IDV", status: "missing" }],
      now: NOW,
    });
    assertContract(r, TransactionCoordinator.resultSchema);
    expect(r.result.conditionsRemaining).toBe(1);
    expect(r.result.nextDeadline?.title).toBe("Financing");
    expect(r.result.docsComplete).toBe("1/2");
  });
  it("ComplianceSentinel", () => {
    const r = ComplianceSentinel.run({
      decisions: [{ verdict: "block", ruleIds: ["FIN-07"], action: "fintrac.str_file" }],
      consents: [{ contactId: 1, channel: "email", basis: "implied", status: "active", expiresAt: "2026-06-22T00:00:00Z" }],
      now: NOW,
    });
    assertContract(r, ComplianceSentinel.resultSchema);
    expect(r.result.alerts.some((a) => a.severity === "high")).toBe(true);
    expect(r.result.consentExpiring).toHaveLength(1);
  });
  it("PrivacyRetention — legal hold first, FINTRAC 5y, anonymize stale leads", () => {
    const r = PrivacyRetention.run({
      records: [
        { id: 1, class: "fintrac", createdAt: "2021-01-01T00:00:00Z" },
        { id: 2, class: "fintrac", createdAt: "2021-01-01T00:00:00Z", legalHold: true },
        { id: 3, class: "lead", createdAt: "2023-01-01T00:00:00Z", inactiveSince: "2023-06-01T00:00:00Z" },
      ],
      now: NOW,
    });
    assertContract(r, PrivacyRetention.resultSchema);
    expect(r.result.actions.find((a) => a.recordId === 1)?.action).toBe("destroy");
    expect(r.result.actions.find((a) => a.recordId === 2)?.action).toBe("legal_hold");
    expect(r.result.actions.find((a) => a.recordId === 3)?.action).toBe("anonymize");
  });
  it("QualityJudge — rubric scoring used by evals", () => {
    const r = QualityJudge.run({
      artifact: { text: "Range $1,180,000 to $1,310,000. Decision support, not an appraisal.", evidenceIds: ["e1"], facts: ["$1,180,000", "$1,310,000"] },
      rubric: { dimensions: [
        { name: "evidence", weight: 1, check: "has_evidence" },
        { name: "disclaimer", weight: 2, check: "has_disclaimer" },
        { name: "grounded", weight: 2, check: "grounded_numbers" },
        { name: "hr", weight: 1, check: "no_hr_violations" },
      ] },
    });
    assertContract(r, QualityJudge.resultSchema);
    expect(r.result.pass).toBe(true);
    expect(r.result.overall).toBe(1);
    const bad = QualityJudge.run({
      artifact: { text: "not suitable for kids, price $9,999,999", facts: [] },
      rubric: { dimensions: [{ name: "hr", weight: 1, check: "no_hr_violations" }, { name: "g", weight: 1, check: "grounded_numbers" }] },
    });
    expect(bad.result.pass).toBe(false);
  });
});
