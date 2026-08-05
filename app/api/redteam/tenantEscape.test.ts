/**
 * RED-TEAM: systematic cross-tenant escape battery (live MySQL, two tenants).
 * Tenant B (attacker) attempts to read/write tenant A's (victim) resources
 * through every router NOT covered by the F1 valuations tests.
 *
 * Convention: "BLOCKED" assertions prove isolation holds; "FINDING"
 * assertions prove a hole (the test passes BECAUSE the hole exists — each
 * finding test documents the expected safe behavior in a comment).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { createTwoTenantFixture, ctxFor, type TwoTenantFixture } from "../testkit/liveDb";
import { offersRouter } from "../routers/offers";
import { conversationsRouter } from "../routers/conversations";
import { transactionsRouter } from "../routers/transactions";
import { contactsRouter } from "../routers/contacts";
import { campaignsRouter } from "../routers/campaigns";
import { approvalsRouter } from "../routers/approvals";
import { consentsRouter } from "../routers/consents";
import { dossiersRouter } from "../routers/dossiers";
import { strategiesRouter } from "../routers/strategies";
import { valuationsRouter } from "../routers/valuations";
import { portalRouter } from "../routers/portal";
import { workflowsRouter } from "../routers/workflows";
import { integrationsRouter } from "../routers/integrations";
import { auditRouter } from "../routers/audit";
import { payloadHash } from "../audit";

let fx: TwoTenantFixture;
let propertyA: number, contactA: number, conversationA: number, txnA: number;
let campaignA: number, approvalA: number, dossierA: number, strategyA: number;
let offerA: number, termA: number, taskA: number, workflowA: number;

beforeAll(async () => {
  fx = await createTwoTenantFixture("escape");
  propertyA = await fx.insert(s.properties, {
    tenantId: fx.tenantA, addressLine1: "1 Victim Way", city: "Toronto",
    province: "ON", postalCode: "M1M1M1",
  });
  contactA = await fx.insert(s.contacts, {
    tenantId: fx.tenantA, firstName: "Victim", lastName: "Seller", kind: "seller",
  });
  conversationA = await fx.insert(s.conversations, {
    tenantId: fx.tenantA, contactId: contactA, channel: "email",
  });
  txnA = await fx.insert(s.transactions, {
    tenantId: fx.tenantA, propertyId: propertyA, status: "conditional",
  });
  campaignA = await fx.insert(s.campaigns, {
    tenantId: fx.tenantA, name: "Victim Campaign", status: "draft",
  });
  dossierA = await fx.insert(s.dossiers, {
    tenantId: fx.tenantA, propertyId: propertyA, status: "draft",
  });
  strategyA = await fx.insert(s.strategies, {
    tenantId: fx.tenantA, propertyId: propertyA, status: "draft",
  });
  offerA = await fx.insert(s.offers, {
    tenantId: fx.tenantA, propertyId: propertyA, buyerLabel: "VictimBuyer",
    fileName: "offer.pdf", status: "extracted", receivedAt: new Date(),
  });
  termA = await fx.insert(s.offerTerms, {
    tenantId: fx.tenantA, offerId: offerA, field: "price", value: "900000",
  });
  taskA = await fx.insert(s.transactionTasks, {
    tenantId: fx.tenantA, transactionId: txnA, kind: "deposit", title: "Deposit due",
  });
  workflowA = await fx.insert(s.workflows, {
    tenantId: fx.tenantA, kind: "transaction_coordination", subjectId: txnA,
  });
  const payload = { campaignId: campaignA };
  approvalA = await fx.insert(s.approvals, {
    tenantId: fx.tenantA, kind: "campaign.launch", title: "Victim approval",
    payload, payloadHash: payloadHash(payload), destination: "comms:mock",
    requestedBy: "test", autonomyLevel: "A3",
    expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
  });
});

afterAll(async () => {
  const db = getDb();
  for (const t of [s.offers, s.offerTerms, s.consentRecords, s.suppressionList, s.messages, s.auditLog, s.policyDecisions, s.outbox] as const) {
    await db.delete(t).where(eq(t.tenantId, fx.tenantA));
    await db.delete(t).where(eq(t.tenantId, fx.tenantB));
  }
  await fx?.cleanup();
});

const B = () => ctxFor(fx.userB, fx.tenantB);

describe("cross-tenant READS (must all be blocked)", () => {
  it("offers.byProperty: B reads A's property offers → empty", async () => {
    const res = await offersRouter.createCaller(B()).byProperty({ propertyId: propertyA });
    expect(res).toEqual([]);
  });
  it("conversations.thread: B reads A's conversation → NOT_FOUND", async () => {
    await expect(conversationsRouter.createCaller(B()).thread({ id: conversationA }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("transactions.byId: B reads A's transaction → NOT_FOUND", async () => {
    await expect(transactionsRouter.createCaller(B()).byId({ id: txnA }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("contacts.byId: B reads A's contact → NOT_FOUND", async () => {
    await expect(contactsRouter.createCaller(B()).byId({ id: contactA }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("campaigns.byId: B reads A's campaign → NOT_FOUND", async () => {
    await expect(campaignsRouter.createCaller(B()).byId({ id: campaignA }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("approvals.byId: B reads A's approval → NOT_FOUND", async () => {
    await expect(approvalsRouter.createCaller(B()).byId({ id: approvalA }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("dossiers.byProperty: B reads A's dossier → NOT_FOUND", async () => {
    await expect(dossiersRouter.createCaller(B()).byProperty({ propertyId: propertyA }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("strategies.byProperty: B reads A's strategy → null", async () => {
    expect(await strategiesRouter.createCaller(B()).byProperty({ propertyId: propertyA })).toBeNull();
  });
  it("valuations.byProperty: B reads A's valuation → null (F1 holds)", async () => {
    expect(await valuationsRouter.createCaller(B()).byProperty({ propertyId: propertyA })).toBeNull();
  });
  it("portal.myProperty: B passes A's seller contactId → NOT_FOUND", async () => {
    await expect(portalRouter.createCaller(B()).myProperty({ contactId: contactA }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("workflows.byId: B reads A's workflow → NOT_FOUND", async () => {
    await expect(workflowsRouter.createCaller(B()).byId({ id: workflowA }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("consents.byContact: B reads A's contact consents → empty", async () => {
    expect(await consentsRouter.createCaller(B()).byContact({ contactId: contactA })).toEqual([]);
  });
});

describe("cross-tenant WRITES (must all be blocked)", () => {
  it("approvals.decide: B decides A's approval → NOT_FOUND", async () => {
    const hash = payloadHash({ campaignId: campaignA });
    await expect(approvalsRouter.createCaller(B()).decide({
      id: approvalA, decision: "approved", expectedPayloadHash: hash,
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const [a] = await getDb().select().from(s.approvals).where(eq(s.approvals.id, approvalA));
    expect(a.status).toBe("pending");
  });
  it("campaigns.launch: B launches A's campaign → NOT_FOUND", async () => {
    await expect(campaignsRouter.createCaller(B()).launch({ id: campaignA }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("offers.verifyTerm: B verifies A's term → term stays unverified", async () => {
    await offersRouter.createCaller(B()).verifyTerm({ termId: termA });
    const [t] = await getDb().select().from(s.offerTerms).where(eq(s.offerTerms.id, termA));
    expect(t.verifiedBy).toBeNull();
  });
  it("transactions.completeTask: B completes A's task → NOT_FOUND, task stays pending", async () => {
    await expect(transactionsRouter.createCaller(B()).completeTask({ taskId: taskA }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    const [t] = await getDb().select().from(s.transactionTasks).where(eq(s.transactionTasks.id, taskA));
    expect(t.status).toBe("pending");
  });
  it("contacts.updateScore: B rescores A's contact → score unchanged", async () => {
    await contactsRouter.createCaller(B()).updateScore({ id: contactA, score: 99, reasons: ["pwn"] });
    const [c] = await getDb().select().from(s.contacts).where(eq(s.contacts.id, contactA));
    expect(c.leadScore).not.toBe(99);
  });
  it("strategies.setStatus: B flips A's strategy → status unchanged", async () => {
    await strategiesRouter.createCaller(B()).setStatus({ id: strategyA, status: "rejected", reason: "pwn" });
    const [st] = await getDb().select().from(s.strategies).where(eq(s.strategies.id, strategyA));
    expect(st.status).toBe("draft");
  });
  it("conversations.draftReply: B drafts in A's thread → NOT_FOUND", async () => {
    await expect(conversationsRouter.createCaller(B()).draftReply({ conversationId: conversationA }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("conversations.sendMessage: B sends into A's thread → NOT_FOUND", async () => {
    await expect(conversationsRouter.createCaller(B()).sendMessage({
      conversationId: conversationA, body: "cross-tenant hello", idempotencyKey: "redteam_xtenant_1",
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("workflows.webhook: B spoofs event into A's workflow → rejected (FORBIDDEN role gate fires first post-SEC-10)", async () => {
    await expect(workflowsRouter.createCaller(B()).webhook({
      id: workflowA, eventType: "lawyer_confirmed", dedupeKey: "redteam spoof 1",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("dossiers.resolveContradiction: B edits A's dossier → NOT_FOUND", async () => {
    await expect(dossiersRouter.createCaller(B()).resolveContradiction({
      dossierId: dossierA, field: "sqft", chosenValue: "1", rationale: "pwn",
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("regression: SEC-1 cross-tenant reference pollution BLOCKED (ownership checked)", () => {
  it("offers.upload by B with A's propertyId → NOT_FOUND (mirrors recordSellerDirection)", async () => {
    await expect(offersRouter.createCaller(B()).upload({
      propertyId: propertyA,
      buyerLabel: "AttackerFabricated",
      fileName: "fake.pdf",
      documentText: "PURCHASE PRICE: $1.00\nDEPOSIT: $1\nCLOSING DATE: tomorrow\nIRREVOCABLE: never",
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
    // No forged offer hung on the victim's property:
    expect(await offersRouter.createCaller(ctxFor(fx.userA, fx.tenantA)).byProperty({ propertyId: propertyA }))
      .toHaveLength(1); // only the victim's own offer
    const polluting = await getDb().select().from(s.offers).where(
      and(eq(s.offers.tenantId, fx.tenantB), eq(s.offers.propertyId, propertyA)),
    );
    expect(polluting).toHaveLength(0);
  });
  it("consents.record by B with A's contactId → NOT_FOUND", async () => {
    await expect(consentsRouter.createCaller(B()).record({
      contactId: contactA, channel: "email", basis: "express",
      evidenceText: "fabricated consent", source: "attacker", purpose: "transaction",
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const rows = await getDb().select().from(s.consentRecords).where(
      and(eq(s.consentRecords.tenantId, fx.tenantB), eq(s.consentRecords.contactId, contactA)),
    );
    expect(rows).toHaveLength(0);
  });
  it("consents.suppress by B with A's contactId → NOT_FOUND", async () => {
    await expect(consentsRouter.createCaller(B()).suppress({
      contactId: contactA, channel: "email", reason: "attacker suppression row",
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const rows = await getDb().select().from(s.suppressionList).where(
      and(eq(s.suppressionList.tenantId, fx.tenantB), eq(s.suppressionList.contactId, contactA)),
    );
    expect(rows).toHaveLength(0);
  });
});

describe("integrations router scoping", () => {
  it("integrations.list returns rows with NO tenant filter (global table) — verify no secrets leak", async () => {
    const rows = await integrationsRouter.createCaller(B()).list();
    // Documented: integrations table is global (no tenantId). Assert nothing
    // secret-shaped leaks to any authenticated caller.
    for (const r of rows) {
      expect(JSON.stringify(r)).not.toMatch(/secret|apikey|api_key|password|bearer/i);
    }
  });
});

describe("audit isolation", () => {
  it("audit.list for B never includes A's entries", async () => {
    const rows = await auditRouter.createCaller(B()).list();
    expect(rows.every((r) => r.tenantId === fx.tenantB)).toBe(true);
  });
});
