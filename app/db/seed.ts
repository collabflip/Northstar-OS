import "dotenv/config";
import { eq, like } from "drizzle-orm";
import * as s from "./schema";
import { getDb } from "../api/queries/connection";
import { DrizzleStore } from "../api/store/drizzle";
import { appendAudit } from "../api/audit";
import { actionPayloadHash } from "../api/policy/actionHash";
import { ON_PACK } from "../api/policy/packs/on";
import { BC_PACK } from "../api/policy/packs/bc";
import { AB_PACK } from "../api/policy/packs/ab";
import { QC_PACK } from "../api/policy/packs/qc";
import { parseOfferDocument } from "../api/agents/OfferExtraction";
import { evaluateAction } from "../api/policy/engine";
import { startWorkflow } from "../api/workflows/runner";
import {
  sellerJourneyWorkflow,
  transactionCoordinationWorkflow,
} from "../api/workflows/definitions";
import { drainOutbox } from "../api/workflows/drainer";
import { MockCommsProvider } from "../api/integrations/mockComms";
import { INTEGRATION_REGISTRY } from "../api/integrations";

/**
 * Idempotent Harbourline demo seed. Wipe-domain-data-then-insert for the demo
 * tenant + demo users only (never touches other tenants or real auth users).
 * Re-runnable: `npm run db:seed` any number of times.
 */

const TENANT_NAME = "Harbourline Realty Inc., Brokerage";
const DEMO_UNION_PREFIX = "demo-harbourline-";

const day = 24 * 3600 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * day);
const daysAhead = (n: number) => new Date(Date.now() + n * day);

async function wipe(db: ReturnType<typeof getDb>) {
  const existing = await db.select().from(s.tenants).where(eq(s.tenants.name, TENANT_NAME));
  for (const t of existing) {
    const tid = t.id;
    // DB-1: FK-enforced order — children strictly before parents.
    // (transactions reference offers via acceptedOfferId; audit/approvals/
    // outbox/campaign_messages reference policy_decisions.)
    await db.delete(s.offerTerms).where(eq(s.offerTerms.tenantId, tid));
    await db.delete(s.transactionTasks).where(eq(s.transactionTasks.tenantId, tid));
    await db.delete(s.transactions).where(eq(s.transactions.tenantId, tid));
    await db.delete(s.offers).where(eq(s.offers.tenantId, tid));
    await db.delete(s.offerComparisons).where(eq(s.offerComparisons.tenantId, tid));
    await db.delete(s.campaignMessages).where(eq(s.campaignMessages.tenantId, tid));
    await db.delete(s.campaigns).where(eq(s.campaigns.tenantId, tid));
    await db.delete(s.messages).where(eq(s.messages.tenantId, tid));
    await db.delete(s.conversations).where(eq(s.conversations.tenantId, tid));
    await db.delete(s.workflowEvents).where(eq(s.workflowEvents.tenantId, tid));
    await db.delete(s.workflows).where(eq(s.workflows.tenantId, tid));
    await db.delete(s.outbox).where(eq(s.outbox.tenantId, tid));
    await db.delete(s.valuations).where(eq(s.valuations.tenantId, tid));
    await db.delete(s.comparables).where(eq(s.comparables.tenantId, tid));
    await db.delete(s.dossiers).where(eq(s.dossiers.tenantId, tid));
    await db.delete(s.strategies).where(eq(s.strategies.tenantId, tid));
    await db.delete(s.sellerDirectionArtifacts).where(eq(s.sellerDirectionArtifacts.tenantId, tid));
    await db.delete(s.evidence).where(eq(s.evidence.tenantId, tid));
    await db.delete(s.approvals).where(eq(s.approvals.tenantId, tid));
    await db.delete(s.auditLog).where(eq(s.auditLog.tenantId, tid));
    await db.delete(s.policyDecisions).where(eq(s.policyDecisions.tenantId, tid));
    await db.delete(s.properties).where(eq(s.properties.tenantId, tid));
    await db.delete(s.consentRecords).where(eq(s.consentRecords.tenantId, tid));
    await db.delete(s.suppressionList).where(eq(s.suppressionList.tenantId, tid));
    await db.delete(s.contacts).where(eq(s.contacts.tenantId, tid));
    await db.delete(s.modelCalls).where(eq(s.modelCalls.tenantId, tid));
    await db.delete(s.memberships).where(eq(s.memberships.tenantId, tid));
    await db.delete(s.tenants).where(eq(s.tenants.id, tid));
  }
  // demo users (unionId prefix) — safe to remove; real auth users untouched
  const demoUsers = await db.select().from(s.users).where(like(s.users.unionId, `${DEMO_UNION_PREFIX}%`));
  for (const u of demoUsers) {
    await db.delete(s.memberships).where(eq(s.memberships.userId, u.id));
    await db.delete(s.users).where(eq(s.users.id, u.id));
  }
  // policy packs + rules (global pack content, keyed by jurisdiction+version)
  const packs = await db.select().from(s.policyPacks);
  for (const p of packs) {
    await db.delete(s.policyRules).where(eq(s.policyRules.packId, p.id));
    await db.delete(s.policyPacks).where(eq(s.policyPacks.id, p.id));
  }
  await db.delete(s.integrations);
}

async function seed() {
  const db = getDb();
  const store = new DrizzleStore();
  console.log("[seed] wiping demo domain data…");
  await wipe(db);

  // ── tenant ────────────────────────────────────────────────────────────
  const [{ id: tenantId }] = await db.insert(s.tenants).values({
    name: TENANT_NAME,
    kind: "brokerage",
    province: "ON",
    timezone: "America/Toronto",
    policyPackVersion: "2026.1",
    brokeragePolicyVersion: "2.3",
    autonomyCeiling: "A2",
  }).$returningId();
  console.log(`[seed] tenant ${TENANT_NAME} id=${tenantId}`);

  // ── users + memberships ───────────────────────────────────────────────
  const mkUser = async (slug: string, name: string, email: string) => {
    const [{ id }] = await db.insert(s.users).values({
      unionId: `${DEMO_UNION_PREFIX}${slug}`, name, email, role: "user", lastSignInAt: new Date(),
    }).$returningId();
    return id;
  };
  const maya = await mkUser("maya-chen", "Maya Chen", "maya.chen@harbourline.example");
  const daniel = await mkUser("daniel-okafor", "Daniel Okafor", "daniel.okafor@harbourline.example");
  const sofia = await mkUser("sofia-tremblay", "Sofia Tremblay", "sofia.tremblay@harbourline.example");
  const amir = await mkUser("amir-haddad", "Amir Haddad", "amir.haddad@harbourline.example");
  await db.insert(s.memberships).values([
    { userId: maya, tenantId, role: "team_member", isDefault: true }, // salesperson
    { userId: daniel, tenantId, role: "broker_of_record", isDefault: true },
    { userId: sofia, tenantId, role: "transaction_coordinator", isDefault: true },
    { userId: amir, tenantId, role: "fintrac_officer", isDefault: true },
  ]);
  console.log("[seed] users + memberships (Maya, Daniel, Sofia, Amir)");

  // ── policy packs + rules ──────────────────────────────────────────────
  for (const pack of [ON_PACK, BC_PACK, AB_PACK, QC_PACK]) {
    const [{ id: packId }] = await db.insert(s.policyPacks).values({
      jurisdiction: pack.jurisdiction,
      version: pack.version,
      effectiveDate: new Date(pack.effectiveDate),
      reviewDate: pack.reviewDate ? new Date(pack.reviewDate) : null,
      owner: pack.owner,
      status: pack.status,
      disclaimer: pack.disclaimer,
    }).$returningId();
    await db.insert(s.policyRules).values(
      pack.rules.map((r) => ({
        packId,
        ruleId: r.ruleId,
        sourceName: r.sourceName,
        sourceUrl: r.sourceUrl,
        jurisdiction: r.jurisdiction,
        effectiveDate: r.effectiveDate,
        reviewDate: r.reviewDate ?? null,
        owner: r.owner,
        requirement: r.requirement,
        control: r.control,
        testScenarios: r.testScenarios,
        escalationPath: r.escalationPath,
        confidence: r.confidence,
        verifyNote: r.verifyNote ?? null,
      })),
    );
  }
  console.log(`[seed] policy packs ON(${ON_PACK.rules.length} rules) + BC/AB/QC fixtures`);

  // ── contacts ──────────────────────────────────────────────────────────
  const mkContact = async (row: Partial<s.Contact> & { firstName: string; lastName: string }) => {
    const [{ id }] = await db.insert(s.contacts).values({ tenantId, ...row } as never).$returningId();
    return id;
  };
  const pelletier = await mkContact({
    firstName: "Nadia", lastName: "Pelletier", preferredName: "Nadia & Marc Pelletier",
    email: "pelletier@example.ca", phone: "+1 416-555-0143", language: "fr-CA",
    kind: "seller", leadSource: "Web valuation form",
    relationshipToProperty: "Owners (confirmed)",
    motivation: "Downsizing after kids moved out", timing: "List within 8 weeks",
    occupancy: "Owner-occupied", leadScore: 87,
    leadScoreReasons: ["requested valuation", "booked consultation", "mortgage-free", "clear timing"],
    stage: "dossier_ready",
  });
  const sandhu = await mkContact({
    firstName: "Gurpreet", lastName: "Sandhu", email: "g.sandhu@example.ca",
    phone: "+1 905-555-0182", kind: "seller", leadSource: "Referral",
    motivation: "Relocating for work", timing: "Next 3–6 months", leadScore: 74,
    leadScoreReasons: ["referral source", "answered discovery call"], stage: "qualified",
  });
  const vance = await mkContact({
    firstName: "Eleanor", lastName: "Vance", email: "e.vance@example.ca",
    phone: "+1 613-555-0119", language: "fr-CA", kind: "seller",
    leadSource: "Web form", motivation: "Estate sale (probate context)",
    leadScore: 52, leadScoreReasons: ["new inquiry", "estate context"], stage: "new_lead",
  });
  const jonah = await mkContact({
    firstName: "Jonah", lastName: "Whitfield", email: "jonah.w@example.ca",
    phone: "+1 416-555-0177", kind: "buyer_lead", leadSource: "Listing inquiry",
    // PIPEDA-07/COMP-3: province-of-residence tag (fictional demo data) — ON
    // is inside the production pack scope, so gated actions evaluate normally.
    province: "ON",
    leadScore: 88,
    leadScoreReasons: ["viewed DEMO-ON-PROPERTY-001 listing 4×", "asked about offer deadline", "pre-approved"],
    stage: "new_lead",
  });
  const renata = await mkContact({
    firstName: "Renata", lastName: "Kowalski", email: "renata.k@example.ca",
    phone: "+1 416-555-0190", kind: "buyer_lead", leadSource: "Open house",
    leadScore: 40, stage: "new_lead",
  });
  const priya = await mkContact({
    firstName: "Priya", lastName: "Raghunathan", email: "priya.r@example.ca",
    kind: "seller", leadSource: "Web form", leadScore: 81,
    leadScoreReasons: ["requested valuation", "Ottawa area"], stage: "new_lead",
  });
  const nguyen = await mkContact({
    firstName: "Anh", lastName: "Nguyen", email: "anh.nguyen@example.ca",
    kind: "seller", stage: "under_contract", leadScore: 90,
    leadScoreReasons: ["accepted offer"], relationshipToProperty: "Owner",
  });
  console.log("[seed] contacts (Pelletier, Sandhu, Vance, Whitfield, Kowalski, Raghunathan, Nguyen)");

  // ── consents + suppression ────────────────────────────────────────────
  await db.insert(s.consentRecords).values([
    { tenantId, contactId: pelletier, channel: "email", basis: "express", evidenceText: "Checked 'Email me my valuation and next steps' on the web valuation form (unchecked by default).", source: "web-valuation-form v3", purpose: "transaction", capturedAt: daysAgo(13), status: "active" },
    { tenantId, contactId: pelletier, channel: "sms", basis: "express", evidenceText: "Texted YES to 44141 confirming SMS updates.", source: "sms double opt-in", purpose: "transaction", capturedAt: daysAgo(10), status: "active" },
    { tenantId, contactId: sandhu, channel: "sms", basis: "express", evidenceText: "Verbal consent on discovery call + follow-up SMS confirmation.", source: "discovery call log", purpose: "transaction", capturedAt: daysAgo(6), status: "active" },
    // EXPIRED implied consent (CASL-03 demo: inquiry > 6 months ago)
    { tenantId, contactId: sandhu, channel: "email", basis: "implied", evidenceText: "Inquiry via referral introduction.", source: "referral email", purpose: "marketing", capturedAt: daysAgo(230), expiresAt: daysAgo(230 - 183), status: "expired" },
    { tenantId, contactId: vance, channel: "email", basis: "express", evidenceText: "Checked consent box on estate-sale inquiry form (fr).", source: "web-form v3 fr-CA", purpose: "transaction", capturedAt: daysAgo(2), status: "active" },
    { tenantId, contactId: jonah, channel: "dm", basis: "express", evidenceText: "Chat widget consent screen acknowledged.", source: "chat-widget v2", purpose: "transaction", capturedAt: daysAgo(4), status: "active" },
    // EXPIRED SMS consent (CASL-03 demo: buyer lead Jonah's inquiry SMS window closed)
    { tenantId, contactId: jonah, channel: "sms", basis: "implied", evidenceText: "Replied to listing inquiry by SMS.", source: "listing inquiry SMS", purpose: "transaction", capturedAt: daysAgo(220), expiresAt: daysAgo(220 - 183), status: "expired" },
    // expiring-soon implied consent (compliance alert demo)
    { tenantId, contactId: priya, channel: "email", basis: "implied", evidenceText: "Valuation request inquiry.", source: "web-form v3", purpose: "transaction", capturedAt: daysAgo(171), expiresAt: daysAhead(12), status: "active" },
    { tenantId, contactId: nguyen, channel: "email", basis: "express", evidenceText: "Listing agreement consent schedule.", source: "listing agreement", purpose: "transaction", capturedAt: daysAgo(60), status: "active" },
    { tenantId, contactId: renata, channel: "email", basis: "express", evidenceText: "Open-house sign-in sheet opt-in (separate unchecked box).", source: "open-house QR form", purpose: "marketing", capturedAt: daysAgo(20), status: "withdrawn" },
  ]);
  // suppressed contact (CASL-06 blocked-action demo)
  await db.insert(s.suppressionList).values([
    { tenantId, contactId: renata, channel: "email", reason: "unsubscribe link clicked — honoured immediately" },
    { tenantId, contactId: renata, channel: "sms", reason: "STOP reply — honoured immediately" },
  ]);
  console.log("[seed] consent records (incl. EXPIRED implied) + suppression list");

  // ── properties ────────────────────────────────────────────────────────
  const [{ id: demoProperty }] = await db.insert(s.properties).values({
    tenantId, ownerContactId: pelletier,
    addressLine1: "DEMO-ON-PROPERTY-001", city: "Toronto", province: "ON", postalCode: "M0M 0M0",
    propertyType: "Detached 2-storey", beds: 4, baths: 3, sqft: 2380,
    lotDescription: "33 x 122 ft", yearBuilt: 1938, ownershipConfirmed: true,
    externalListingRef: "HLD-2041",
  }).$returningId();
  await db.insert(s.properties).values({
    tenantId, ownerContactId: sandhu,
    addressLine1: "DEMO-ON-PROPERTY-002", city: "Mississauga", province: "ON", postalCode: "M0M 0M0",
    propertyType: "Detached", beds: 4, baths: 3, sqft: 2200, yearBuilt: 1998, ownershipConfirmed: false,
  }).$returningId();
  await db.insert(s.properties).values({
    tenantId, ownerContactId: vance,
    addressLine1: "DEMO-ON-PROPERTY-003", city: "Ottawa", province: "ON", postalCode: "M0M 0M0",
    propertyType: "Bungalow", beds: 3, baths: 2, sqft: 1650, yearBuilt: 1962, ownershipConfirmed: false,
  }).$returningId();
  const [{ id: demoPropertyB }] = await db.insert(s.properties).values({
    tenantId, ownerContactId: nguyen,
    addressLine1: "DEMO-ON-PROPERTY-004", city: "Toronto", province: "ON", postalCode: "M0M 0M0",
    propertyType: "Semi-detached", beds: 3, baths: 2, sqft: 1720, yearBuilt: 1925, ownershipConfirmed: true,
  }).$returningId();

  // ── evidence ──────────────────────────────────────────────────────────
  const ev = (row: Partial<s.Evidence> & Pick<s.Evidence, "subjectType" | "subjectId" | "kind" | "statement">) => ({ tenantId, ...row });
  await db.insert(s.evidence).values([
    ev({ subjectType: "property", subjectId: demoProperty, kind: "third_party", statement: "Lot dimensions 33 x 122 ft", sourceName: "municipal record (MPAC-mock)", sourceRef: "mpac:roll-1904-552", freshness: daysAgo(2), confidence: 90, lineage: { agent: "PropertyDossier", tool: "mock-listing-data" } }),
    ev({ subjectType: "property", subjectId: demoProperty, kind: "verified", statement: "4 bedrooms / 3 bathrooms confirmed by agent walkthrough", sourceName: "agent input — M. Chen", freshness: daysAgo(3), confidence: 98, lineage: { agent: "PropertyDossier" } }),
    ev({ subjectType: "property", subjectId: demoProperty, kind: "assumption", statement: "Finished basement (seller stated, no permit found)", sourceName: "seller statement", freshness: daysAgo(5), confidence: 55, lineage: { agent: "SellerDiscovery" } }),
    ev({ subjectType: "property", subjectId: demoProperty, kind: "third_party", statement: "2024 property taxes $8,940", sourceName: "municipal record (MPAC-mock)", sourceRef: "mpac:tax-2024", freshness: daysAgo(2), confidence: 92, lineage: { agent: "PropertyDossier" } }),
    ev({ subjectType: "property", subjectId: demoProperty, kind: "third_party", statement: "Prior listing 2019 expired at $1,695,000", sourceName: "mock board feed", sourceRef: "HLD-0915", freshness: daysAgo(2), confidence: 88, lineage: { agent: "MarketIntelligence" } }),
  ]);

  // ── dossier + comparables + valuation + strategy ──────────────────────
  const [{ id: dossierId }] = await db.insert(s.dossiers).values({
    tenantId, propertyId: demoProperty,
    profile: {
      lot: "33 x 122 ft", beds: 4, baths: 3, sqft: 2380,
      basement: "finished (unverified permit)", parking: "private drive, 2",
      taxes: "$8,940/yr (2024)", yearBuilt: 1938,
    },
    timeline: [
      { date: "2019", event: "prior listing expired ($1,695,000)", kind: "third_party" },
      { date: "2021", event: "kitchen + bath renovation (seller stated)", kind: "assumption" },
    ],
    marketContext: {
      area: "Davisville Village", medianDetached: 1620000, domMedian: 14, monthsInventory: 1.8,
      trend: "flat-to-up", sources: ["mock board feed"],
    },
    contradictions: [
      { field: "lotDepth", values: ["122 ft (municipal record)", "125 ft (2019 listing)"] },
    ],
    missingInfo: ["2024 utility costs", "Waterproofing documentation", "Survey (existing?)"],
    agentQuestions: ["Confirm waterproofing scope", "Verify survey existence", "Permit for basement finishing?"],
    status: "ready",
  }).$returningId();

  const compRows = [
    { address: "DEMO-ON-AVENUE-001", soldPrice: 1290000, soldDate: daysAgo(29), beds: 4, baths: 3, sqft: 2310, distanceKm: "0.12", relevanceScore: 92, selected: true, selectionReasoning: "Selected: same street, same vintage, adjusted +$12k for finished basement", adjustments: [{ factor: "basement", amountCad: 12000 }] },
    { address: "DEMO-ON-STREET-001", soldPrice: 1150000, soldDate: daysAgo(43), beds: 3, baths: 2, sqft: 1950, distanceKm: "0.35", relevanceScore: 81, selected: true, selectionReasoning: "Selected: same neighbourhood, adjusted +$86k area/bath", adjustments: [{ factor: "living area", amountCad: 74000 }, { factor: "bath count", amountCad: 12000 }] },
    { address: "DEMO-ON-AVENUE-002", soldPrice: 1335000, soldDate: daysAgo(55), beds: 4, baths: 3, sqft: 2450, distanceKm: "0.5", relevanceScore: 78, selected: true, selectionReasoning: "Selected: similar size/vintage, minor condition discount", adjustments: [{ factor: "condition", amountCad: -15000 }] },
    { address: "DEMO-ON-AVENUE-003", soldPrice: 1210000, soldDate: daysAgo(70), beds: 4, baths: 2, sqft: 2250, distanceKm: "0.6", relevanceScore: 74, selected: true, selectionReasoning: "Selected: strong lot comp, +$12k bath adjustment", adjustments: [{ factor: "bath count", amountCad: 12000 }] },
    { address: "DEMO-ON-STREET-002", soldPrice: 1175000, soldDate: daysAgo(90), beds: 3, baths: 3, sqft: 2100, distanceKm: "0.8", relevanceScore: 66, selected: true, selectionReasoning: "Selected: bracket low end, area adjustment +$50k", adjustments: [{ factor: "living area", amountCad: 50000 }] },
    { address: "DEMO-ON-STREET-003", soldPrice: 980000, soldDate: daysAgo(60), beds: 4, baths: 3, sqft: 2300, distanceKm: "0.9", relevanceScore: 40, selected: false, exclusionReason: "Excluded: estate sale, atypical condition", selectionReasoning: "Excluded per atypical-condition rule", adjustments: [] },
    { address: "DEMO-ON-STREET-004 (condo-adjacent)", soldPrice: 1400000, soldDate: daysAgo(50), beds: 4, baths: 3, sqft: 2400, distanceKm: "1.9", relevanceScore: 35, selected: false, exclusionReason: "Excluded: >1.5 km", selectionReasoning: "Excluded per distance rule", adjustments: [] },
  ];
  await db.insert(s.comparables).values(compRows.map((c) => ({ tenantId, dossierId, ...c })));

  await db.insert(s.valuations).values({
    tenantId, dossierId, low: 1180000, mid: 1245000, high: 1310000,
    confidenceInterval: 87,
    assumptions: [
      "Interior condition assumed good based on 2021 renovation photos",
      "No material latent defects",
      "±$40k sensitivity if finished-basement status unverified",
    ],
    rationale: "Adjusted comp median $1.245M from 5 selected comps; range widened ±5.2% for dispersion and the unverified finished basement.",
    disclaimer: "Decision support for a licensed registrant. This is not an appraisal, a guaranteed sale price, or a final pricing opinion.",
    modelVersion: "mock-deterministic-1",
  });

  const [{ id: strategyId }] = await db.insert(s.strategies).values({
    tenantId, propertyId: demoProperty,
    positioning: ["Move-in-ready Davisville detached for school-catchment buyers", "Anchor near $1.245M point estimate with offer date"],
    prepWork: [{ item: "Deep clean + declutter", priority: "high" }, { item: "Confirm survey + permits", priority: "medium" }],
    mediaPlan: ["HDR photo set", "Floor plan", "Walkthrough video"],
    launchSequence: [{ step: 1, action: "Coming soon", day: -5 }, { step: 2, action: "MLS-mock live", day: 0 }],
    commsPlan: { channels: ["email", "dm"], cadence: "weekly seller update (fr-CA)" },
    showingStrategy: { openHouse: "weekend 2-4pm, SRP-safe kiosk" },
    timeline: { weeks: 6 },
    status: "proposed",
  }).$returningId();

  // ── approvals (payload-bound) ─────────────────────────────────────────
  const listingCopyPayload = {
    headline: "Sun-filled Davisville detached on a 33 x 122 ft lot",
    body: "4 bedrooms, 3 bathrooms, 2,380 sqft. Private drive, 2 parking. 2024 taxes $8,940. Listed by Maya Chen, salesperson, with Harbourline Realty Inc., Brokerage.",
    propertyId: demoProperty,
  };
  const smsPayload = {
    to: "+1 905-555-0182",
    body: "Hi Gurpreet — Maya here. Thanks again for the consultation; your dossier draft is underway. Reply STOP anytime.",
    contactId: sandhu,
  };
  await db.insert(s.approvals).values([
    {
      tenantId, kind: "content", title: "Publish listing copy — DEMO-ON-PROPERTY-001",
      payload: listingCopyPayload,
      // SEC-6/SEC-7 vintage: canonical action hash (kind + payload + destination
      // once the consolidated actionHash lands; payload-only until then).
      payloadHash: actionPayloadHash({ kind: "publish.listing_copy", payload: listingCopyPayload, destination: `mls-mock:listing/HLD-2041/remarks` }),
      destination: `mls-mock:listing/HLD-2041/remarks`,
      requestedBy: "content-brand-agent", autonomyLevel: "A4",
      status: "pending", expiresAt: daysAhead(2),
    },
    {
      tenantId, kind: "communication", title: "Send consultation follow-up SMS — Gurpreet Sandhu",
      payload: smsPayload,
      payloadHash: actionPayloadHash({ kind: "cem.send", payload: smsPayload, destination: `sms:+19055550182` }),
      destination: `sms:+19055550182`,
      requestedBy: "conversational-lead-agent", autonomyLevel: "A2",
      status: "pending", expiresAt: daysAhead(2),
    },
  ]);
  console.log("[seed] dossier + 7 comparables + valuation + strategy + 2 pending approvals");

  // ── campaign (pending A2 SMS approval) ────────────────────────────────
  const [{ id: campaignId }] = await db.insert(s.campaigns).values({
    tenantId, name: "Spring seller seminar follow-up",
    audience: { size: 1, filter: "express-consent only" },
    contentFamily: "seller-nurture@v2",
    budgetCapCents: 150000, frequencyCapPerWeek: 2,
    schedule: { startDate: new Date().toISOString().slice(0, 10), window: "10:00-16:00 weekdays" },
    channels: ["sms"], autonomyLevel: "A2", status: "pending_approval",
  }).$returningId();
  await db.insert(s.campaignMessages).values({
    tenantId, campaignId, contactId: sandhu, channel: "sms",
    body: "Thanks for attending our spring seller seminar — your home valuation update is ready when you are. Reply STOP anytime.",
    status: "draft", idempotencyKey: `cm_${campaignId}_${sandhu}_1`,
  });

  // ── conversations ─────────────────────────────────────────────────────
  const [{ id: jonahConvo }] = await db.insert(s.conversations).values({
    tenantId, contactId: jonah, channel: "dm", status: "escalated", assignedTo: maya,
  }).$returningId();
  await db.insert(s.messages).values([
    { tenantId, conversationId: jonahConvo, direction: "inbound", body: "Hi! I've viewed the DEMO-ON-PROPERTY-001 listing 4 times — is it still available?", status: "received", createdAt: daysAgo(1) },
    { tenantId, conversationId: jonahConvo, direction: "outbound", body: "I'm Northstar's AI assistant working with Maya Chen — a licensed registrant reviews anything before it's sent. Yes, DEMO-ON-PROPERTY-001 is currently available; showings run this week.", aiDisclosed: true, isAiDraft: false, groundedEvidenceIds: ["HLD-2041"], status: "sent", createdAt: daysAgo(1) },
    { tenantId, conversationId: jonahConvo, direction: "inbound", body: "Is the seller flexible on closing date? And would they take $1.15M?", status: "received", createdAt: daysAgo(0) },
    { tenantId, conversationId: jonahConvo, direction: "outbound", body: "[ESCALATED] Negotiation topics are handled only by a licensed registrant. Maya Chen has been notified.", aiDisclosed: true, status: "blocked", escalation: { topic: "negotiation", reason: "negotiation topics require a licensed registrant (A4)", at: new Date().toISOString() }, createdAt: daysAgo(0) },
  ]);
  const [{ id: sandhuConvo }] = await db.insert(s.conversations).values({
    tenantId, contactId: sandhu, channel: "sms", status: "open", assignedTo: maya,
  }).$returningId();
  await db.insert(s.messages).values([
    { tenantId, conversationId: sandhuConvo, direction: "outbound", body: "Hi Gurpreet — Maya here. Your dossier draft for DEMO-ON-PROPERTY-002 is underway.", aiDisclosed: false, status: "sent", createdAt: daysAgo(2) },
    { tenantId, conversationId: sandhuConvo, direction: "inbound", body: "Great — can you also send the utility cost breakdown once you have it?", status: "received", createdAt: daysAgo(2) },
  ]);
  console.log("[seed] conversations (escalated Whitfield thread incl. AI disclosure)");

  // ── offers (deterministic extraction with citations) ──────────────────
  const offerAText = [
    "[p.1 §1.0] AGREEMENT OF PURCHASE AND SALE — DEMO-ON-PROPERTY-001, Toronto",
    "[p.2 §1.3] Purchase Price: $1,225,000",
    "[p.2 §1.4] Deposit: $60,000 — within 24 hours of acceptance",
    "[p.2 §1.5] Completion Date: August 15, 2026",
    "[p.2 §1.6] Possession: same day as completion",
    "[p.3 §2.1] Irrevocable until: June 11, 2026 21:00",
    "[p.3 §3.0] Conditions: financing (5 business days); home inspection (3 business days)",
    "[p.3 §3.4] Sale-of-property condition: none",
    "[p.4 §5.1] Inclusions: fridge, stove, dishwasher, washer, dryer",
    "[p.4 §5.2] Exclusions: none stated",
    "[p.4 §5.3] Rental items: hot water tank (rental)",
    "[p.5 §6.0] Adjustments: standard",
    "[p.5 §7.0] Schedules attached: A, B, C",
    "[p.5 §8.2] Escalation clause: buyer will exceed any competing bona fide offer by $5,000 to a cap of $1,260,000",
    "[p.6 §9.1] Schedule A deposit: $55,000 payable upon acceptance",
    "[p.6 §9.2] Witness signature: J. Whitfield / WITNESSED",
  ].join("\n");
  const offerBText = [
    "[p.1 §1.0] AGREEMENT OF PURCHASE AND SALE — DEMO-ON-PROPERTY-001, Toronto",
    "[p.2 §1.3] Purchase Price: $1,198,000",
    "[p.2 §1.4] Deposit: $50,000 — within 24 hours of acceptance",
    "[p.2 §1.5] Completion Date: July 30, 2026",
    "[p.2 §1.6] Possession: same day as completion",
    "[p.3 §2.1] Irrevocable until: June 12, 2026 12:00",
    "[p.3 §3.0] Conditions: financing (3 business days)",
    "[p.3 §3.4] Sale-of-property condition: none",
    "[p.4 §5.1] Inclusions: appliances as listed",
    "[p.4 §5.2] Exclusions: dining chandelier",
    "[p.4 §5.3] Rental items: hot water tank (rental)",
    "[p.5 §6.0] Adjustments: standard",
    "[p.5 §7.0] Schedules attached: A, B",
    "[p.6 §9.2] Witness signature: ",
  ].join("\n");
  for (const [label, file, text, received, irrev] of [
    ["Whitfield (buyer)", "offer_whitfield.pdf", offerAText, daysAgo(0), daysAhead(1)],
    ["D'Souza", "offer_dsouza.pdf", offerBText, daysAgo(0), daysAhead(2)],
  ] as const) {
    const terms = parseOfferDocument(text);
    const conf = Math.round(terms.reduce((sum, t) => sum + t.confidence, 0) / Math.max(1, terms.length));
    const [{ id: offerId }] = await db.insert(s.offers).values({
      tenantId, propertyId: demoProperty, buyerLabel: label, fileName: file,
      documentText: text, receivedAt: received, irrevocableUntil: irrev,
      extractionConfidence: conf, status: "under_review",
    }).$returningId();
    await db.insert(s.offerTerms).values(
      terms.map((t) => ({
        tenantId, offerId, field: t.field, value: t.value,
        sourcePage: t.sourcePage, sourceSection: t.sourceSection,
        confidence: t.confidence, flag: t.flag === "none" ? null : t.flag, flagNote: t.flagNote,
      })),
    );
  }
  console.log("[seed] 2 offers with cited terms (incl. contradiction + missing-signature flags)");

  // ── F8: written seller direction artifact (TRESA-08 demo flows) ────────
  await db.insert(s.sellerDirectionArtifacts).values({
    tenantId, propertyId: demoProperty, contactId: pelletier,
    signedEvidenceText: "Nadia & Marc Pelletier direct, in writing (signed 2026-06-02), disclosure of competing offer CONTENT to all bona fide offerors for DEMO-ON-PROPERTY-001.",
    status: "verified", verifiedByUserId: daniel, verifiedAt: daysAgo(1),
  });
  console.log("[seed] seller direction artifact (Pelletier, verified)");

  // ── transaction + tasks ───────────────────────────────────────────────
  const [{ id: txnId }] = await db.insert(s.transactions).values({
    tenantId, propertyId: demoPropertyB,
    sellerName: "A. Nguyen", buyerName: "K. Osei",
    acceptedPrice: 1075000, acceptedAt: daysAgo(4), closingAt: daysAhead(48),
    status: "conditional",
  }).$returningId();
  await db.insert(s.transactionTasks).values([
    { tenantId, transactionId: txnId, kind: "deposit", title: "Deposit due (24h) — receipt of funds recorded", dueAt: daysAgo(3), ownerRole: "transaction_coordinator", status: "done", completedAt: daysAgo(3) },
    { tenantId, transactionId: txnId, kind: "fintrac_receipt_of_funds", title: "FINTRAC receipt-of-funds record — awaiting review", dueAt: daysAgo(2), ownerRole: "fintrac_officer", status: "in_progress" },
    { tenantId, transactionId: txnId, kind: "fintrac_idv", title: "ID verification — buyer (prescribed method captured)", dueAt: daysAgo(3), ownerRole: "fintrac_officer", status: "done", completedAt: daysAgo(3) },
    { tenantId, transactionId: txnId, kind: "condition", title: "Home inspection", dueAt: daysAgo(0), ownerRole: "buyer_rep", status: "done", completedAt: daysAgo(0) },
    { tenantId, transactionId: txnId, kind: "condition", title: "Financing condition — waiver due", dueAt: daysAhead(3), ownerRole: "buyer_rep", status: "pending" },
    { tenantId, transactionId: txnId, kind: "lawyer_handoff", title: "Send executed APS + amendments to Harrison & Lee LLP", dueAt: daysAhead(6), ownerRole: "transaction_coordinator", status: "pending" },
    { tenantId, transactionId: txnId, kind: "closing", title: "Closing — funds + keys", dueAt: daysAhead(48), ownerRole: "transaction_coordinator", status: "pending" },
  ]);

  // ── workflows (real runner → real events + outbox) ────────────────────
  const sj = await startWorkflow(store, sellerJourneyWorkflow, {
    tenantId, subjectId: pelletier,
    input: { contactId: pelletier, propertyId: demoProperty, initiatedBy: maya },
  });
  const tj = await startWorkflow(store, transactionCoordinationWorkflow, {
    tenantId, subjectId: txnId,
    input: { sellerContactId: nguyen, transactionId: txnId, initiatedBy: sofia },
  });
  // drain once: transactional emails send (mock, policy-gated); campaign launch escalates
  const comms = new MockCommsProvider();
  const drained = await drainOutbox(store, comms, { brokeragePolicyVersion: "2.3" });
  console.log(`[seed] workflows sj=#${sj.workflowId} txn=#${tj.workflowId}; drained ${drained.sent} sent / ${drained.escalated} escalated / ${drained.blocked} blocked`);

  // ── real gate decision: blocked CASL-03 SMS to Jonah (demo evidence) ───
  // Jonah's SMS consent is EXPIRED — the commit-time gate blocks the send and
  // persists the policy_decisions row the demo points to as evidence.
  const jonahSms = await evaluateAction(store, { tenantId, actorId: maya, brokeragePolicyVersion: "2.3" }, {
    kind: "cem.send",
    payload: { contactId: jonah, channel: "sms", campaign: "buyer nurture" },
    destination: `comms:sms:contact:${jonah}`,
    idempotencyKey: "seed_jonah_sms_casl03_demo",
    contactId: jonah,
    channel: "sms",
    purpose: "transaction",
    text: "Hi Jonah — DEMO-ON-PROPERTY-001 is still available! Want a private showing this week?",
    marketing: true,
  });
  if (jonahSms.verdict !== "block" || !jonahSms.ruleIds.includes("CASL-03")) {
    throw new Error(`[seed] expected blocked CASL-03 decision for Jonah SMS, got ${jonahSms.verdict} [${jonahSms.ruleIds}]`);
  }
  console.log(`[seed] policy decision #${jonahSms.decisionId}: BLOCKED CASL-03 SMS to Jonah Whitfield (expired consent)`);

  // ── integrations ──────────────────────────────────────────────────────
  await db.insert(s.integrations).values(INTEGRATION_REGISTRY.map((i) => ({ ...i, config: i.config })));

  // ── audit chain entries ───────────────────────────────────────────────
  const auditSeed = [
    { actorId: daniel, actorRole: "broker_of_record", action: "tenant.seed", subjectType: "tenant", subjectId: tenantId, payload: { name: TENANT_NAME } },
    { actorId: maya, actorRole: "team_member", action: "dossier.ready", subjectType: "dossier", subjectId: dossierId, payload: { propertyId: demoProperty, contradictions: 1, missing: 3 } },
    { actorId: maya, actorRole: "team_member", action: "valuation.publish", subjectType: "dossier", subjectId: dossierId, payload: { low: 1180000, mid: 1245000, high: 1310000 }, modelVersion: "mock-deterministic-1", promptVersion: "valuation-support@1.0" },
    { actorId: maya, actorRole: "team_member", action: "strategy.propose", subjectType: "strategy", subjectId: strategyId, payload: { status: "proposed" } },
    { actorId: daniel, actorRole: "broker_of_record", action: "transaction.open", subjectType: "transaction", subjectId: txnId, payload: { acceptedPrice: 1075000 } },
    { actorId: sofia, actorRole: "transaction_coordinator", action: "workflow.start", subjectType: "workflow", subjectId: tj.workflowId, payload: { kind: "transaction_coordination" } },
  ];
  for (const a of auditSeed) {
    await appendAudit(store, { tenantId, ...a });
  }
  console.log("[seed] audit chain seeded");

  const counts = {
    contacts: 7, consents: 10, properties: 4, comparables: compRows.length,
    approvals: 2, offers: 2, workflows: 2, outboxSent: drained.sent,
    sellerDirectionArtifacts: 1, jonahSmsDecision: jonahSms.decisionId,
    policyRules: ON_PACK.rules.length + 3,
  };
  console.log("[seed] DONE ✔", JSON.stringify(counts));
  process.exit(0);
}

seed().catch((err) => {
  console.error("[seed] FAILED", err);
  process.exit(1);
});
