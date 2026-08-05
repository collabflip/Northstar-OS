/**
 * RED-TEAM: privilege escalation + role-check battery (live MySQL).
 *
 * SEC-2 (FIXED — regression tests below): auth.chooseDemoRole had NO
 * demo-tenant check, letting any authenticated user promote themselves to
 * ANY membership role (broker_of_record, fintrac_officer) in ANY tenant,
 * defeating every role gate (A4 approvals, FIN-07 FINTRAC isolation, F9
 * autonomy ceiling setting). chooseDemoRole is now confined to the seeded
 * demo tenant (FORBIDDEN elsewhere).
 *
 * SEC-3 (FIXED — regression tests below): transactions.completeTask let ANY
 * role mark FINTRAC tasks done (fintrac_* kinds are hidden from non-officers
 * by F3 redaction, but the mutation did not check task kind or role) — blind
 * compliance sabotage. fintrac_* tasks now require the fintrac_officer role
 * and missing task ids return NOT_FOUND.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { createTwoTenantFixture, ctxFor, type TwoTenantFixture } from "../testkit/liveDb";
import { authRouter } from "../auth-router";
import { settingsRouter } from "../routers/settings";
import { approvalsRouter } from "../routers/approvals";
import { complianceRouter } from "../routers/compliance";
import { transactionsRouter } from "../routers/transactions";
import { offersRouter } from "../routers/offers";
import { strategiesRouter } from "../routers/strategies";
import { payloadHash } from "../audit";

let fx: TwoTenantFixture;
let approvalA4: number, fintracTask: number, txnA: number, offerA: number, strategyA: number;

beforeAll(async () => {
  // NOTE: fixture tenant names are "TEST priv A …" — NOT a demo tenant name.
  fx = await createTwoTenantFixture("priv");
  txnA = await fx.insert(s.transactions, {
    tenantId: fx.tenantA, propertyId: await fx.insert(s.properties, {
      tenantId: fx.tenantA, addressLine1: "9 Escalation Ave", city: "Ottawa",
      province: "ON", postalCode: "K1K1K1",
    }), status: "firm",
  });
  const payload = { kind: "publish.listing_copy", copy: "x" };
  approvalA4 = await fx.insert(s.approvals, {
    tenantId: fx.tenantA, kind: "publish.listing_copy", title: "A4 listing copy",
    payload, payloadHash: payloadHash(payload), destination: "listing:mock",
    requestedBy: "test", autonomyLevel: "A4",
    expiresAt: new Date(Date.now() + 48 * 3600 * 1000),
  });
  fintracTask = await fx.insert(s.transactionTasks, {
    tenantId: fx.tenantA, transactionId: txnA, kind: "fintrac_str",
    title: "STR review — suspicious funds",
  });
  const propertyA2 = await fx.insert(s.properties, {
    tenantId: fx.tenantA, addressLine1: "17 Fixture Lane", city: "Ottawa",
    province: "ON", postalCode: "K2P2P2",
  });
  offerA = await fx.insert(s.offers, {
    tenantId: fx.tenantA, propertyId: propertyA2, buyerLabel: "B", fileName: "f.pdf",
    status: "extracted", receivedAt: new Date(),
  });
  strategyA = await fx.insert(s.strategies, {
    tenantId: fx.tenantA, propertyId: propertyA2, status: "proposed",
  });
});

afterAll(async () => {
  const db = getDb();
  for (const t of [s.offers, s.auditLog] as const) {
    await db.delete(t).where(eq(t.tenantId, fx.tenantA));
    await db.delete(t).where(eq(t.tenantId, fx.tenantB));
  }
  await fx?.cleanup();
});

const A = () => ctxFor(fx.userA, fx.tenantA); // team_member in tenant A

describe("role gates that HOLD for a plain team_member", () => {
  it("approvals.decide on A4 approval as team_member → FORBIDDEN", async () => {
    const hash = payloadHash({ kind: "publish.listing_copy", copy: "x" });
    await expect(approvalsRouter.createCaller(A()).decide({
      id: approvalA4, decision: "approved", expectedPayloadHash: hash,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("settings.setAutonomyCeiling as team_member → FORBIDDEN", async () => {
    await expect(settingsRouter.createCaller(A()).setAutonomyCeiling({ ceiling: "A4" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("offers.recordDecision (A4) as team_member → FORBIDDEN", async () => {
    await expect(offersRouter.createCaller(A()).recordDecision({
      offerId: offerA, decisionType: "accept", instruction: "take it", countersignUserId: fx.userA.id,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("strategies.setStatus approved (A4) as team_member → FORBIDDEN", async () => {
    await expect(strategiesRouter.createCaller(A()).setStatus({ id: strategyA, status: "approved" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("compliance.fintracQueue as team_member → FORBIDDEN (F3 holds pre-escalation)", async () => {
    await expect(complianceRouter.createCaller(A()).fintracQueue())
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("regression: SEC-2 — chooseDemoRole self-escalation BLOCKED in a NON-demo tenant", () => {
  it("team_member cannot promote self to broker_of_record in a non-demo tenant", async () => {
    const [tenant] = await getDb().select().from(s.tenants).where(eq(s.tenants.id, fx.tenantA));
    expect(tenant.name).not.toContain("Demo");       // NOT the documented demo tenant
    expect(tenant.name).not.toContain("Harbourline"); // NOT the seeded demo brokerage

    // 1. self-promotion attempt → FORBIDDEN, membership role unchanged
    await expect(authRouter.createCaller(A()).chooseDemoRole({ role: "broker_of_record" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    const [m] = await getDb().select().from(s.memberships).where(
      eq(s.memberships.userId, fx.userA.id),
    );
    expect(m.role).toBe("team_member");

    // 2. BOR-only autonomy ceiling change stays FORBIDDEN
    await expect(settingsRouter.createCaller(A()).setAutonomyCeiling({ ceiling: "A4" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });

    // 3. A4 approval decision stays FORBIDDEN
    const hash = payloadHash({ kind: "publish.listing_copy", copy: "x" });
    await expect(approvalsRouter.createCaller(A()).decide({
      id: approvalA4, decision: "approved", expectedPayloadHash: hash,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("team_member cannot promote self to fintrac_officer (FIN-07 isolation intact)", async () => {
    await expect(authRouter.createCaller(A()).chooseDemoRole({ role: "fintrac_officer" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(complianceRouter.createCaller(A()).fintracQueue())
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("regression: SEC-3 — transactions.completeTask enforces FINTRAC task kind and role", () => {
  it("plain team_member CANNOT mark a fintrac_str task done (blind actor blocked)", async () => {
    // F3: they cannot SEE the task…
    const view = await transactionsRouter.createCaller(A()).byId({ id: txnA });
    expect(view.tasks.some((t) => t.id === fintracTask)).toBe(false);
    // …and they can no longer COMPLETE it by id either
    await expect(transactionsRouter.createCaller(A()).completeTask({ taskId: fintracTask }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    const [t] = await getDb().select().from(s.transactionTasks).where(eq(s.transactionTasks.id, fintracTask));
    expect(t.status).toBe("pending"); // STR task untouched
  });

  it("non-existent task id → NOT_FOUND (no silent ok:true)", async () => {
    await expect(transactionsRouter.createCaller(A()).completeTask({ taskId: 999999999 }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
